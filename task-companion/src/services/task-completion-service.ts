import type { TaskScanner } from '../adapters/tasks/task-scanner';
import {
	REVIEW_SCHEMA_VERSION,
	ReviewEvent,
} from '../core/reviews/model';
import {
	buildReviewStats,
	hasExecutionArchive,
} from '../core/reviews/stats';
import type { Subtask } from '../core/subtasks/model';
import type { SelectedTask } from '../core/tasks/task-rules';
import type { SessionService } from './session-service';
import type { SubtaskService } from './subtask-service';
import type { ReviewService } from './review-service';

export type OutstandingSubtaskResolution = 'cancel' | 'keep';

export interface CompletionAnalysis {
	hasArchive: boolean;
	activeSubtasks: Subtask[];
}

export interface CompletionResult {
	reviewQueued: boolean;
	reviewIndexWritePending: boolean;
}

export class TaskCompletionService {
	constructor(
		private readonly scanner: TaskScanner,
		private readonly sessions: SessionService,
		private readonly subtasks: SubtaskService,
		private readonly reviews: ReviewService,
		private readonly idFactory: () => string = () => crypto.randomUUID(),
	) {}

	async analyze(selected: SelectedTask): Promise<CompletionAnalysis> {
		const [sessions, plan] = await Promise.all([
			this.sessions.history(selected.task.id),
			this.subtasks.load(selected.task.id),
		]);
		return {
			hasArchive: hasExecutionArchive(sessions, plan),
			activeSubtasks: plan.subtasks.filter(
				(subtask) => subtask.status === 'active',
			),
		};
	}

	async complete(
		selected: SelectedTask,
		resolution: OutstandingSubtaskResolution | null,
		nowMs: number,
	): Promise<CompletionResult> {
		let [sessions, plan] = await Promise.all([
			this.sessions.history(selected.task.id),
			this.subtasks.load(selected.task.id),
		]);
		const activeSubtasks = plan.subtasks.filter(
			(subtask) => subtask.status === 'active',
		);
		if (activeSubtasks.length > 0 && resolution === null) {
			throw new Error('Outstanding subtask resolution is required.');
		}
		if (resolution === 'cancel') {
			for (const subtask of activeSubtasks) {
				await this.subtasks.cancel(selected.task.id, subtask.subtaskId, nowMs);
			}
			plan = await this.subtasks.load(selected.task.id);
		}

		const reviewQueued = hasExecutionArchive(sessions, plan);
		const completedAt = new Date(nowMs).toISOString();
		const pendingEvent = reviewQueued
			? createPendingReviewEvent(
					selected,
					buildReviewStats(sessions, plan, completedAt),
					completedAt,
					this.idFactory,
				)
			: null;
		if (pendingEvent) await this.reviews.prepareEvent(pendingEvent);
		try {
			await this.scanner.complete(selected);
		} catch (error) {
			if (pendingEvent) await this.reviews.discardPrepared(pendingEvent.eventId);
			throw error;
		}

		let reviewIndexWritePending = false;
		if (pendingEvent) {
			try {
				await this.reviews.commitPrepared(pendingEvent.eventId);
			} catch {
				reviewIndexWritePending = true;
			}
		}
		return { reviewQueued, reviewIndexWritePending };
	}
}

function createPendingReviewEvent(
	selected: SelectedTask,
	stats: ReviewEvent['stats'],
	completedAt: string,
	idFactory: () => string,
): ReviewEvent {
	return {
		schemaVersion: REVIEW_SCHEMA_VERSION,
		eventId: idFactory(),
		reviewId: idFactory(),
		taskId: selected.task.id,
		taskTitle: removeTrailingTaskId(selected.task.text),
		sourcePath: selected.task.sourcePath,
		sourceLineNumber: selected.task.lineNumber,
		occurredAt: completedAt,
		completedAt,
		reviewStatus: 'pending',
		stats,
		reviewText: null,
		wentWell: null,
		reworkOrBlocker: null,
		nextAdjustment: null,
		markdownPath: null,
	};
}

function removeTrailingTaskId(text: string): string {
	return text.replace(/\s+\^tc-[0-9a-f]{6}\s*$/u, '');
}
