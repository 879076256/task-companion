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

export class ReviewService {
	private pendingEvents: ReviewEvent[] = [];
	private pendingMarkdown: PendingReviewMarkdownWrite[] = [];

	constructor(
		private readonly repository: ReviewRepository,
		private readonly persistPending: PendingReviewPersistence,
		private readonly idFactory: () => string = () => crypto.randomUUID(),
	) {}

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
		const added = !this.pendingEvents.some(
			({ eventId }) => eventId === event.eventId,
		);
		if (added) {
			this.pendingEvents.push(event);
		}
		try {
			await this.persist();
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
		await this.repository.append(event);
		this.pendingEvents = this.pendingEvents.filter(
			(candidate) => candidate.eventId !== eventId,
		);
		await this.persist();
	}

	async discardPrepared(eventId: string): Promise<void> {
		this.pendingEvents = this.pendingEvents.filter(
			(candidate) => candidate.eventId !== eventId,
		);
		await this.persist();
	}

	async list(): Promise<ReviewEvent[]> {
		return foldReviewEvents([
			...(await this.repository.list()),
			...this.pendingEvents,
		]);
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

	private async retryMarkdown(reviewId: string): Promise<void> {
		const write = this.pendingMarkdown.find(
			(candidate) => candidate.reviewId === reviewId,
		);
		if (!write) return;
		await this.repository.writeMarkdown(write.path, write.content);
		await this.repository.append(write.completedEvent);
		this.pendingMarkdown = this.pendingMarkdown.filter(
			(candidate) => candidate.reviewId !== reviewId,
		);
		await this.persist();
	}

	private persist(): Promise<void> {
		return this.persistPending(
			this.getPendingEvents(),
			this.getPendingMarkdown(),
		);
	}
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
