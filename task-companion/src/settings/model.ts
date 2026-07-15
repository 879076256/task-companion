export interface TaskCompanionSettings {
	showTechnicalDetails: boolean;
}

export const DEFAULT_SETTINGS: TaskCompanionSettings = {
	showTechnicalDetails: false,
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
	};
}

