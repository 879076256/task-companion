export type TimerActivity = 'idle' | 'ready' | 'running' | 'paused' | 'finished';
export type TaskSelectionAction = 'bind-new' | 'open-current' | 'reject-switch';

export function resolveTaskSelectionAction(
	timerStatus: TimerActivity,
	currentTaskId: string | null,
	selectedTaskId: string,
): TaskSelectionAction {
	if (
		timerStatus !== 'ready' &&
		timerStatus !== 'running' &&
		timerStatus !== 'paused'
	) {
		return 'bind-new';
	}
	return currentTaskId === selectedTaskId ? 'open-current' : 'reject-switch';
}
