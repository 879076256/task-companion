import type { ExecutionSession } from '../sessions/model';
import type { Subtask, SubtaskPlan } from './model';

export interface SubtaskProgress extends Subtask {
	activeDurationSeconds: number;
	sessionCount: number;
}

export interface TaskProgressSummary {
	taskId: string;
	completedSubtasks: number;
	totalSubtasks: number;
	totalSessionCount: number;
	totalActiveDurationSeconds: number;
	parentDirectDurationSeconds: number;
	currentNextSubtaskId: string | null;
	currentNextTitle: string | null;
	subtasks: SubtaskProgress[];
}

export function buildTaskProgress(
	plan: SubtaskPlan,
	sessions: ExecutionSession[],
): TaskProgressSummary {
	const taskSessions = sessions.filter((session) => session.taskId === plan.taskId);
	const subtasks = plan.subtasks.map((subtask) => {
		const matching = taskSessions.filter(
			(session) => session.subtaskId === subtask.subtaskId,
		);
		return {
			...subtask,
			activeDurationSeconds: sumDuration(matching),
			sessionCount: matching.length,
		};
	});
	const countedSubtasks = subtasks.filter((subtask) => subtask.status !== 'cancelled');
	return {
		taskId: plan.taskId,
		completedSubtasks: countedSubtasks.filter(
			(subtask) => subtask.status === 'completed',
		).length,
		totalSubtasks: countedSubtasks.length,
		totalSessionCount: taskSessions.length,
		totalActiveDurationSeconds: sumDuration(taskSessions),
		parentDirectDurationSeconds: sumDuration(
			taskSessions.filter((session) => session.subtaskId === null),
		),
		currentNextSubtaskId: plan.currentNextSubtaskId,
		currentNextTitle:
			subtasks.find(
				(subtask) => subtask.subtaskId === plan.currentNextSubtaskId,
			)?.title ?? null,
		subtasks,
	};
}

function sumDuration(sessions: ExecutionSession[]): number {
	return sessions.reduce(
		(total, session) => total + session.activeDurationSeconds,
		0,
	);
}
