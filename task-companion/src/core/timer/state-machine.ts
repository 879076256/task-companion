import {
	FinishedTimerState,
	PausedTimerState,
	RunningTimerState,
	StartTimerInput,
	TimerMode,
	TimerState,
	TimerTransition,
} from './model';

const PRESET_SECONDS: Record<Exclude<TimerMode, 'custom'>, number> = {
	'focus-25': 25 * 60,
	'focus-50': 50 * 60,
};

export function createIdleState(): TimerState {
	return { status: 'idle' };
}

export function startTimer(
	state: TimerState,
	input: StartTimerInput,
): TimerTransition {
	if (state.status === 'running' || state.status === 'paused') {
		return { ok: false, state, error: 'active-session' };
	}

	const durationSeconds = resolveDurationSeconds(input);
	if (durationSeconds === null) {
		return { ok: false, state, error: 'invalid-duration' };
	}

	const nextState: RunningTimerState = {
		status: 'running',
		sessionId: input.sessionId,
		mode: input.mode,
		durationSeconds,
		startedAtMs: input.nowMs,
		pausedDurationMs: 0,
		endsAtMs: input.nowMs + durationSeconds * 1_000,
	};
	return { ok: true, state: nextState };
}

export function pauseTimer(state: TimerState, nowMs: number): TimerTransition {
	if (state.status !== 'running') {
		return { ok: false, state, error: 'invalid-state' };
	}

	const remainingSeconds = getRemainingSeconds(state, nowMs);
	if (remainingSeconds === 0) {
		return { ok: true, state: completeNormally(state) };
	}

	const nextState: PausedTimerState = {
		status: 'paused',
		sessionId: state.sessionId,
		mode: state.mode,
		durationSeconds: state.durationSeconds,
		startedAtMs: state.startedAtMs,
		pausedDurationMs: state.pausedDurationMs,
		pausedAtMs: nowMs,
		remainingSeconds,
	};
	return { ok: true, state: nextState };
}

export function resumeTimer(state: TimerState, nowMs: number): TimerTransition {
	if (state.status !== 'paused') {
		return { ok: false, state, error: 'invalid-state' };
	}

	const nextState: RunningTimerState = {
		status: 'running',
		sessionId: state.sessionId,
		mode: state.mode,
		durationSeconds: state.durationSeconds,
		startedAtMs: state.startedAtMs,
		pausedDurationMs:
			state.pausedDurationMs + Math.max(0, nowMs - state.pausedAtMs),
		endsAtMs: nowMs + state.remainingSeconds * 1_000,
	};
	return { ok: true, state: nextState };
}

export function finishTimerEarly(
	state: TimerState,
	nowMs: number,
): TimerTransition {
	if (state.status !== 'running' && state.status !== 'paused') {
		return { ok: false, state, error: 'invalid-state' };
	}

	const pausedDurationMs =
		state.pausedDurationMs +
		(state.status === 'paused' ? Math.max(0, nowMs - state.pausedAtMs) : 0);
	const nextState: FinishedTimerState = {
		status: 'finished',
		sessionId: state.sessionId,
		mode: state.mode,
		durationSeconds: state.durationSeconds,
		startedAtMs: state.startedAtMs,
		pausedDurationMs,
		endedAtMs: nowMs,
		completion: 'early',
	};
	return { ok: true, state: nextState };
}

export function resetTimer(_state: TimerState): TimerState {
	return createIdleState();
}

export function reconcileTimer(state: TimerState, nowMs: number): TimerState {
	if (state.status !== 'running' || getRemainingSeconds(state, nowMs) > 0) {
		return state;
	}
	return completeNormally(state);
}

export function getRemainingSeconds(state: TimerState, nowMs: number): number {
	switch (state.status) {
		case 'idle':
			return PRESET_SECONDS['focus-25'];
		case 'running':
			return Math.max(0, Math.ceil((state.endsAtMs - nowMs) / 1_000));
		case 'paused':
			return state.remainingSeconds;
		case 'finished':
			return 0;
	}
}

function resolveDurationSeconds(input: StartTimerInput): number | null {
	const seconds =
		input.mode === 'custom' ? input.durationSeconds : PRESET_SECONDS[input.mode];
	return typeof seconds === 'number' &&
		Number.isSafeInteger(seconds) &&
		seconds > 0
		? seconds
		: null;
}

function completeNormally(state: RunningTimerState): FinishedTimerState {
	return {
		status: 'finished',
		sessionId: state.sessionId,
		mode: state.mode,
		durationSeconds: state.durationSeconds,
		startedAtMs: state.startedAtMs,
		pausedDurationMs: state.pausedDurationMs,
		endedAtMs: state.endsAtMs,
		completion: 'normal',
	};
}
