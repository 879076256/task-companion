export type TimerMode = 'focus-25' | 'focus-50' | 'custom';
export type TimerCompletion = 'normal' | 'early';
export type TimerPurpose = 'focus' | 'break';

export interface IdleTimerState {
	status: 'idle';
}

export interface ReadyTimerState {
	status: 'ready';
	sessionId: string;
	mode: TimerMode;
	durationSeconds: number;
	subtaskId: string | null;
	purpose?: 'break';
}

interface TimerSession {
	sessionId: string;
	mode: TimerMode;
	durationSeconds: number;
	startedAtMs: number;
	pausedDurationMs: number;
	subtaskId: string | null;
	purpose?: 'break';
}

export interface RunningTimerState extends TimerSession {
	status: 'running';
	endsAtMs: number;
}

export interface PausedTimerState extends TimerSession {
	status: 'paused';
	pausedAtMs: number;
	remainingSeconds: number;
}

export interface FinishedTimerState extends TimerSession {
	status: 'finished';
	endedAtMs: number;
	completion: TimerCompletion;
}

export type ActiveTimerState = RunningTimerState | PausedTimerState;
export type TimerState =
	| IdleTimerState
	| ReadyTimerState
	| RunningTimerState
	| PausedTimerState
	| FinishedTimerState;

export interface StartTimerInput {
	mode: TimerMode;
	durationSeconds?: number;
	nowMs: number;
	sessionId: string;
	subtaskId?: string | null;
	purpose?: TimerPurpose;
}

export interface PrepareTimerInput {
	mode: TimerMode;
	durationSeconds?: number;
	sessionId: string;
	subtaskId?: string | null;
	purpose?: TimerPurpose;
}

export type TimerTransitionError =
	| 'active-session'
	| 'invalid-duration'
	| 'invalid-state';

export type TimerTransition =
	| { ok: true; state: TimerState }
	| { ok: false; state: TimerState; error: TimerTransitionError };
