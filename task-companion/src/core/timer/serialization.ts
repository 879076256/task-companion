import {
	FinishedTimerState,
	PausedTimerState,
	RunningTimerState,
	TimerMode,
	TimerState,
} from './model';
import { createIdleState, reconcileTimer } from './state-machine';

export function restoreTimerState(value: unknown, nowMs: number): TimerState {
	if (!isRecord(value) || typeof value.status !== 'string') {
		return createIdleState();
	}

	if (value.status === 'idle') {
		return createIdleState();
	}

	const session = readSession(value);
	if (session === null) {
		return createIdleState();
	}

	if (value.status === 'running' && isTimestamp(value.endsAtMs)) {
		const state: RunningTimerState = {
			status: 'running',
			...session,
			endsAtMs: value.endsAtMs,
		};
		return reconcileTimer(state, nowMs);
	}

	if (
		value.status === 'paused' &&
		isTimestamp(value.pausedAtMs) &&
		isPositiveInteger(value.remainingSeconds) &&
		value.remainingSeconds <= session.durationSeconds
	) {
		const state: PausedTimerState = {
			status: 'paused',
			...session,
			pausedAtMs: value.pausedAtMs,
			remainingSeconds: value.remainingSeconds,
		};
		return state;
	}

	if (
		value.status === 'finished' &&
		isTimestamp(value.endedAtMs) &&
		(value.completion === 'normal' || value.completion === 'early')
	) {
		const state: FinishedTimerState = {
			status: 'finished',
			...session,
			endedAtMs: value.endedAtMs,
			completion: value.completion,
		};
		return state;
	}

	return createIdleState();
}

function readSession(value: Record<string, unknown>): {
	sessionId: string;
	mode: TimerMode;
	durationSeconds: number;
	startedAtMs: number;
	pausedDurationMs: number;
	subtaskId: string | null;
} | null {
	if (
		typeof value.sessionId !== 'string' ||
		value.sessionId.length === 0 ||
		!isTimerMode(value.mode) ||
		!isPositiveInteger(value.durationSeconds) ||
		!isTimestamp(value.startedAtMs)
	) {
		return null;
	}
	return {
		sessionId: value.sessionId,
		mode: value.mode,
		durationSeconds: value.durationSeconds,
		startedAtMs: value.startedAtMs,
		pausedDurationMs:
			isTimestamp(value.pausedDurationMs) ? value.pausedDurationMs : 0,
		subtaskId:
			typeof value.subtaskId === 'string' && value.subtaskId.length > 0
				? value.subtaskId
				: null,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isTimerMode(value: unknown): value is TimerMode {
	return value === 'focus-25' || value === 'focus-50' || value === 'custom';
}

function isTimestamp(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
