import type { ExecutionSession } from '../sessions/model';
import type { Subtask, SubtaskPlan } from '../subtasks/model';
import type { ReviewStats } from './model';

export function hasExecutionArchive(
	sessions: ExecutionSession[],
	plan: SubtaskPlan,
): boolean {
	return sessions.length > 0 || plan.subtasks.length > 0;
}

export function buildReviewStats(
	sessions: ExecutionSession[],
	plan: SubtaskPlan,
	completedAt: string,
): ReviewStats {
	const taskSessions = sessions.filter((session) => session.taskId === plan.taskId);
	const startCandidates = [
		...taskSessions.map((session) => session.startedAt),
		...plan.subtasks.map((subtask) => subtask.createdAt),
	].sort();
	const taskStartedAt = startCandidates[0] ?? null;
	const activeDays = new Set(taskSessions.map((session) => session.startedAt.slice(0, 10)));
	const durationByTarget = new Map<string, number>();
	for (const session of taskSessions) {
		const key = session.subtaskId ?? '__parent__';
		durationByTarget.set(
			key,
			(durationByTarget.get(key) ?? 0) + session.activeDurationSeconds,
		);
	}
	const longestTarget = [...durationByTarget.entries()].sort(
		(left, right) => right[1] - left[1],
	)[0];
	const longestStepTitle = longestTarget
		? longestTarget[0] === '__parent__'
			? '母任务（未绑定子任务）'
			: plan.subtasks.find(({ subtaskId }) => subtaskId === longestTarget[0])
					?.title ?? '已移除的子任务'
		: null;
	const lastProgress = [...taskSessions]
		.sort((left, right) => right.endedAt.localeCompare(left.endedAt))
		.find((session) => session.completedWork !== null)?.completedWork ?? null;

	return {
		taskStartedAt,
		taskSpanSeconds:
			taskStartedAt === null
				? 0
				: Math.max(
						0,
						Math.floor(
							(Date.parse(completedAt) - Date.parse(taskStartedAt)) / 1_000,
						),
					),
		activeDayCount: activeDays.size,
		sessionCount: taskSessions.length,
		totalActiveDurationSeconds: sum(
			taskSessions.map((session) => session.activeDurationSeconds),
		),
		totalPausedDurationSeconds: sum(
			taskSessions.map((session) => session.pausedDurationSeconds),
		),
		endedEarlySessionCount: taskSessions.filter((session) => session.endedEarly)
			.length,
		initialSubtaskCount: plan.subtasks.filter(
			(subtask) => subtask.origin === 'initial',
		).length,
		addedDuringExecutionCount: plan.subtasks.filter(
			(subtask) => subtask.origin === 'during-execution',
		).length,
		completedSubtaskCount: plan.subtasks.filter(
			(subtask) => subtask.status === 'completed',
		).length,
		cancelledSubtaskCount: plan.subtasks.filter(
			(subtask) => subtask.status === 'cancelled',
		).length,
		longestStepTitle,
		longestStepActiveDurationSeconds: longestTarget?.[1] ?? 0,
		lastProgress,
		outstandingSubtasks: plan.subtasks
			.filter((subtask) => subtask.status === 'active')
			.map((subtask) => subtask.title),
	};
}

export function buildSubtaskReviewStats(
	sessions: ExecutionSession[],
	plan: SubtaskPlan,
	subtask: Subtask,
	completedAt: string,
): ReviewStats {
	return buildReviewStats(
		sessions.filter((session) => session.subtaskId === subtask.subtaskId),
		{ ...plan, subtasks: [subtask], currentNextSubtaskId: null },
		completedAt,
	);
}

function sum(values: number[]): number {
	return values.reduce((total, value) => total + value, 0);
}
