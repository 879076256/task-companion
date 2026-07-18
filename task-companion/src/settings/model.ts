import type { TimerMode } from '../core/timer/model';

export interface TaskCompanionSettings {
	showTechnicalDetails: boolean;
	preferredTimerMode: TimerMode;
	customTimerMinutes: number;
}

export const DEFAULT_SETTINGS: TaskCompanionSettings = {
	showTechnicalDetails: false,
	preferredTimerMode: 'focus-25',
	customTimerMinutes: 25,
};

export function normalizeSettings(value: unknown): TaskCompanionSettings {
	if (typeof value !== 'object' || value === null) {
		return { ...DEFAULT_SETTINGS };
	}

	const candidate = value as Partial<TaskCompanionSettings>;
	return {
		showTechnicalDetails:
			typeof candidate.showTechnicalDetails === 'boolean'
				? candidate.showTechnicalDetails
				: DEFAULT_SETTINGS.showTechnicalDetails,
		preferredTimerMode: isTimerMode(candidate.preferredTimerMode)
			? candidate.preferredTimerMode
			: DEFAULT_SETTINGS.preferredTimerMode,
		customTimerMinutes: isCustomMinutes(candidate.customTimerMinutes)
			? candidate.customTimerMinutes
			: DEFAULT_SETTINGS.customTimerMinutes,
	};
}

function isTimerMode(value: unknown): value is TimerMode {
	return value === 'focus-25' || value === 'focus-50' || value === 'custom';
}

function isCustomMinutes(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 1_440;
}
