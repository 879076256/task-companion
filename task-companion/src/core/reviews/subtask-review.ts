import type { ExecutionSession } from '../sessions/model';
import type { Subtask, SubtaskPlan } from '../subtasks/model';
import type { ParsedTask } from '../tasks/task-rules';
import { REVIEW_SCHEMA_VERSION, ReviewEvent } from './model';
import { buildSubtaskReviewStats } from './stats';

export function createSubtaskReviewEvent(
	parentTask: ParsedTask,
	subtask: Subtask,
	sessions: ExecutionSession[],
	plan: SubtaskPlan,
	nowMs: number,
	idFactory: () => string = () => crypto.randomUUID(),
): ReviewEvent {
	const completedAt = new Date(nowMs).toISOString();
	const completedSubtask: Subtask = {
		...subtask,
		status: 'completed',
		updatedAt: completedAt,
		completedAt,
		cancelledAt: null,
	};
	return {
		schemaVersion: REVIEW_SCHEMA_VERSION,
		eventId: idFactory(),
		reviewId: idFactory(),
		taskId: parentTask.id,
		taskTitle: subtask.title,
		targetType: 'subtask',
		subtaskId: subtask.subtaskId,
		parentTaskTitle: removeTrailingTaskId(parentTask.text),
		sourcePath: parentTask.sourcePath,
		sourceLineNumber: parentTask.lineNumber,
		occurredAt: completedAt,
		completedAt,
		reviewStatus: 'pending',
		stats: buildSubtaskReviewStats(
			sessions,
			plan,
			completedSubtask,
			completedAt,
		),
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
