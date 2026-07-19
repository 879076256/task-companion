import type { FinishedTimerState, TimerMode, TimerPurpose } from './model';

export interface PomodoroNextTimer {
	mode: TimerMode;
	durationSeconds?: number;
	purpose: TimerPurpose;
}

export interface PomodoroCompletionDecision {
	completedPomodoros: number;
	completedStage: TimerPurpose;
	next: PomodoroNextTimer;
}

const SHORT_BREAK_SECONDS = 5 * 60;
const LONG_BREAK_SECONDS = 15 * 60;

export function resolvePomodoroCompletion(
	state: FinishedTimerState,
	completedPomodoros: number,
): PomodoroCompletionDecision | null {
	if (state.completion !== 'normal') return null;
	const safeCompleted = normalizeCompletedPomodoros(completedPomodoros);
	if (state.purpose === 'break') {
		return {
			completedPomodoros: safeCompleted,
			completedStage: 'break',
			next: { mode: 'focus-25', purpose: 'focus' },
		};
	}
	if (state.mode !== 'focus-25') return null;
	const nextCompleted = safeCompleted + 1;
	return {
		completedPomodoros: nextCompleted,
		completedStage: 'focus',
		next: {
			mode: 'custom',
			durationSeconds:
				nextCompleted % 3 === 0 ? LONG_BREAK_SECONDS : SHORT_BREAK_SECONDS,
			purpose: 'break',
		},
	};
}

function normalizeCompletedPomodoros(value: number): number {
	return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
