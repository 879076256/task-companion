import { buildReviewMarkdown } from '../core/reviews/markdown';
import {
	foldReviewEvents,
	normalizePendingReviewMarkdownWrite,
	normalizeReviewEvent,
	normalizeReviewText,
	PendingReviewMarkdownWrite,
	ReviewEvent,
	ReviewReflection,
} from '../core/reviews/model';
import {
	reviewMarkdownPath,
	ReviewRepository,
} from './review-repository';

export type PendingReviewPersistence = (
	pendingEvents: ReviewEvent[],
	pendingMarkdown: PendingReviewMarkdownWrite[],
) => Promise<void>;

export interface ReviewRetryResult {
	events: number;
	markdown: number;
}

export type ReviewEligibilityChecker = (review: ReviewEvent) => Promise<boolean>;
export type ReviewChangeListener = () => void;
export type ReviewEventListener = (event: ReviewEvent) => void;

export class ReviewService {
	private pendingEvents: ReviewEvent[] = [];
	private pendingMarkdown: PendingReviewMarkdownWrite[] = [];
	private eligibilityChecker: ReviewEligibilityChecker = async () => true;
	private readonly listeners = new Set<ReviewChangeListener>();
	private readonly eventListeners = new Set<ReviewEventListener>();
	private readonly purgedSubtasks = new Set<string>();
	private readonly activeWrites = new Set<Promise<void>>();

	constructor(
		private readonly repository: ReviewRepository,
		private readonly persistPending: PendingReviewPersistence,
		private readonly idFactory: () => string = () => crypto.randomUUID(),
	) {}

	setEligibilityChecker(checker: ReviewEligibilityChecker): void {
		this.eligibilityChecker = checker;
	}

	subscribe(listener: ReviewChangeListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	onEvent(listener: ReviewEventListener): () => void {
		this.eventListeners.add(listener);
		return () => this.eventListeners.delete(listener);
	}

	notifyEligibilityChanged(): void {
		this.notify();
	}

	restorePending(events: unknown, markdown: unknown): void {
		this.pendingEvents = Array.isArray(events)
			? events
					.map(normalizeReviewEvent)
					.filter((event): event is ReviewEvent => event !== null)
			: [];
		this.pendingMarkdown = Array.isArray(markdown)
			? markdown
					.map(normalizePendingReviewMarkdownWrite)
					.filter(
						(write): write is PendingReviewMarkdownWrite => write !== null,
					)
			: [];
	}

	getPendingEvents(): ReviewEvent[] {
		return this.pendingEvents.map(cloneEvent);
	}

	getPendingMarkdown(): PendingReviewMarkdownWrite[] {
		return this.pendingMarkdown.map((write) => ({
			...write,
			completedEvent: cloneEvent(write.completedEvent),
		}));
	}

	async prepareEvent(event: ReviewEvent): Promise<void> {
		if (this.isPurged(event)) return;
		const added = !this.pendingEvents.some(
			({ eventId }) => eventId === event.eventId,
		);
		if (added) {
			this.pendingEvents.push(event);
		}
		try {
			await this.persist();
			this.notify();
		} catch (error) {
			if (added) {
				this.pendingEvents = this.pendingEvents.filter(
					(candidate) => candidate.eventId !== event.eventId,
				);
			}
			throw error;
		}
	}

	async commitPrepared(eventId: string): Promise<void> {
		const event = this.pendingEvents.find((candidate) => candidate.eventId === eventId);
		if (!event) return;
		if (this.isPurged(event)) {
			this.pendingEvents = this.pendingEvents.filter(
				(candidate) => candidate.eventId !== eventId,
			);
			await this.persist();
			this.notify();
			return;
		}
		await this.trackWrite(this.repository.append(event));
		this.notifyEvent(event);
		this.pendingEvents = this.pendingEvents.filter(
			(candidate) => candidate.eventId !== eventId,
		);
		await this.persist();
		this.notify();
	}

	async discardPrepared(eventId: string): Promise<void> {
		this.pendingEvents = this.pendingEvents.filter(
			(candidate) => candidate.eventId !== eventId,
		);
		await this.persist();
		this.notify();
	}

	async list(): Promise<ReviewEvent[]> {
		const reviews = foldReviewEvents([
			...(await this.repository.list()),
			...this.pendingEvents,
		]);
		const visible = await Promise.all(
			reviews.map(async (review) => ({
				review,
				eligible:
					review.reviewStatus === 'completed' ||
					(await this.eligibilityChecker(review)),
			})),
		);
		return visible.filter(({ eligible }) => eligible).map(({ review }) => review);
	}

	async hasPendingSubtask(taskId: string, subtaskId: string): Promise<boolean> {
		return this.hasPendingTarget(taskId, subtaskId);
	}

	async hasPendingTask(taskId: string): Promise<boolean> {
		return this.hasPendingTarget(taskId, null);
	}

	private async hasPendingTarget(
		taskId: string,
		subtaskId: string | null,
	): Promise<boolean> {
		return foldReviewEvents([
			...(await this.repository.list()),
			...this.pendingEvents,
		]).some(
			(review) =>
				review.reviewStatus === 'pending' &&
				review.taskId === taskId &&
				review.subtaskId === subtaskId,
		);
	}

	async saveReview(
		pendingEvent: ReviewEvent,
		reflection: ReviewReflection,
		nowMs: number,
	): Promise<string> {
		const completedEvent: ReviewEvent = {
			...pendingEvent,
			eventId: this.idFactory(),
			occurredAt: toIso(nowMs),
			reviewStatus: 'completed',
			reviewText: normalizeReviewText(reflection.reviewText),
			wentWell: normalizeReviewText(reflection.wentWell),
			reworkOrBlocker: normalizeReviewText(reflection.reworkOrBlocker),
			nextAdjustment: normalizeReviewText(reflection.nextAdjustment),
			markdownPath: null,
		};
		const path = reviewMarkdownPath(completedEvent);
		completedEvent.markdownPath = path;
		const write: PendingReviewMarkdownWrite = {
			reviewId: completedEvent.reviewId,
			path,
			content: buildReviewMarkdown(completedEvent),
			completedEvent,
		};
		this.pendingMarkdown = this.pendingMarkdown.filter(
			(candidate) => candidate.reviewId !== write.reviewId,
		);
		this.pendingMarkdown.push(write);
		await this.persist();
		await this.retryMarkdown(write.reviewId);
		this.notify();
		return path;
	}

	async retryAll(): Promise<ReviewRetryResult> {
		let events = 0;
		let markdown = 0;
		for (const { eventId } of [...this.pendingEvents]) {
			await this.commitPrepared(eventId);
			events += 1;
		}
		for (const { reviewId } of [...this.pendingMarkdown]) {
			await this.retryMarkdown(reviewId);
			markdown += 1;
		}
		return { events, markdown };
	}

	async purgeSubtask(taskId: string, subtaskId: string): Promise<number> {
		this.purgedSubtasks.add(subtaskKey(taskId, subtaskId));
		await Promise.all(
			[...this.activeWrites].map((write) => write.catch(() => undefined)),
		);
		const matches = (event: ReviewEvent): boolean =>
			event.targetType === 'subtask' &&
			event.taskId === taskId &&
			event.subtaskId === subtaskId;
		const removedEvents = this.pendingEvents.filter(matches);
		const removedMarkdown = this.pendingMarkdown.filter((write) =>
			matches(write.completedEvent),
		);
		const nextEvents = this.pendingEvents.filter((event) => !matches(event));
		const nextMarkdown = this.pendingMarkdown.filter(
			(write) => !matches(write.completedEvent),
		);
		await this.persistPending(
			nextEvents.map(cloneEvent),
			nextMarkdown.map((write) => ({
				...write,
				completedEvent: cloneEvent(write.completedEvent),
			})),
		);
		this.pendingEvents = nextEvents;
		this.pendingMarkdown = nextMarkdown;
		const removedStored = await this.repository.purgeSubtask(
			taskId,
			subtaskId,
			removedMarkdown.map(({ path }) => path),
		);
		this.notify();
		return removedEvents.length + removedMarkdown.length + removedStored;
	}

	private async retryMarkdown(reviewId: string): Promise<void> {
		const write = this.pendingMarkdown.find(
			(candidate) => candidate.reviewId === reviewId,
		);
		if (!write) return;
		if (this.isPurged(write.completedEvent)) {
			this.pendingMarkdown = this.pendingMarkdown.filter(
				(candidate) => candidate.reviewId !== reviewId,
			);
			await this.persist();
			this.notify();
			return;
		}
		await this.trackWrite(
			(async () => {
				await this.repository.writeMarkdown(write.path, write.content);
				await this.repository.append(write.completedEvent);
			})(),
		);
		this.notifyEvent(write.completedEvent);
		this.pendingMarkdown = this.pendingMarkdown.filter(
			(candidate) => candidate.reviewId !== reviewId,
		);
		await this.persist();
		this.notify();
	}

	private async trackWrite(write: Promise<void>): Promise<void> {
		this.activeWrites.add(write);
		try {
			await write;
		} finally {
			this.activeWrites.delete(write);
		}
	}

	private isPurged(event: ReviewEvent): boolean {
		return (
			event.targetType === 'subtask' &&
			event.subtaskId !== null &&
			this.purgedSubtasks.has(subtaskKey(event.taskId, event.subtaskId))
		);
	}

	private persist(): Promise<void> {
		return this.persistPending(
			this.getPendingEvents(),
			this.getPendingMarkdown(),
		);
	}

	private notify(): void {
		for (const listener of this.listeners) {
			try {
				listener();
			} catch {
				// UI listeners must not interrupt durable review writes.
			}
		}
	}

	private notifyEvent(event: ReviewEvent): void {
		for (const listener of this.eventListeners) {
			try {
				listener(cloneEvent(event));
			} catch {
				// Extension listeners must not interrupt durable review writes.
			}
		}
	}
}

function subtaskKey(taskId: string, subtaskId: string): string {
	return `${taskId}\u0000${subtaskId}`;
}

function cloneEvent(event: ReviewEvent): ReviewEvent {
	return {
		...event,
		stats: {
			...event.stats,
			outstandingSubtasks: [...event.stats.outstandingSubtasks],
		},
	};
}

function toIso(nowMs: number): string {
	if (!Number.isFinite(nowMs) || nowMs < 0) throw new Error('Invalid timestamp.');
	return new Date(nowMs).toISOString();
}
