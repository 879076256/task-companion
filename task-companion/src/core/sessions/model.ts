import type { FinishedTimerState, TimerMode } from '../timer/model';

export const SESSION_SCHEMA_VERSION = 2;

export type ExecutionMode = TimerMode | 'quick';
export type ExecutionStatus = 'completed' | 'ended-early';

export interface ExecutionSession {
	schemaVersion: typeof SESSION_SCHEMA_VERSION;
	sessionId: string;
	taskId: string;
	subtaskId: string | null;
	startedAt: string;
	endedAt: string;
	activeDurationSeconds: number;
	pausedDurationSeconds: number;
	mode: ExecutionMode;
	status: ExecutionStatus;
	endedEarly: boolean;
	completedWork: string | null;
	nextAction: string | null;
	blockerReason: string | null;
}

export interface SessionReflection {
	completedWork: string | null;
	nextAction: string | null;
	blockerReason: string | null;
}

export function executionSessionFromTimer(
	state: FinishedTimerState,
	taskId: string,
): ExecutionSession {
	const wallDurationMs = Math.max(0, state.endedAtMs - state.startedAtMs);
	const activeDurationSeconds =
		state.completion === 'normal'
			? state.durationSeconds
			: Math.max(
					0,
					Math.floor((wallDurationMs - state.pausedDurationMs) / 1_000),
				);
	return {
		schemaVersion: SESSION_SCHEMA_VERSION,
		sessionId: state.sessionId,
		taskId,
		subtaskId: state.subtaskId,
		startedAt: new Date(state.startedAtMs).toISOString(),
		endedAt: new Date(state.endedAtMs).toISOString(),
		activeDurationSeconds,
		pausedDurationSeconds: Math.floor(state.pausedDurationMs / 1_000),
		mode: state.mode,
		status: state.completion === 'early' ? 'ended-early' : 'completed',
		endedEarly: state.completion === 'early',
		completedWork: null,
		nextAction: null,
		blockerReason: null,
	};
}

export function createQuickExecutionSession(
	taskId: string,
	nowMs: number,
	sessionId: string,
	subtaskId: string | null = null,
): ExecutionSession {
	const timestamp = new Date(nowMs).toISOString();
	return {
		schemaVersion: SESSION_SCHEMA_VERSION,
		sessionId,
		taskId,
		subtaskId,
		startedAt: timestamp,
		endedAt: timestamp,
		activeDurationSeconds: 0,
		pausedDurationSeconds: 0,
		mode: 'quick',
		status: 'completed',
		endedEarly: false,
		completedWork: null,
		nextAction: null,
		blockerReason: null,
	};
}

export function applySessionReflection(
	session: ExecutionSession,
	reflection: SessionReflection,
): ExecutionSession {
	return {
		...session,
		completedWork: normalizeOptionalText(reflection.completedWork),
		nextAction: normalizeOptionalText(reflection.nextAction),
		blockerReason: normalizeOptionalText(reflection.blockerReason),
	};
}

export function normalizeExecutionSession(value: unknown): ExecutionSession | null {
	if (!isRecord(value)) return null;
	const migrated = migrateLegacySession(value);
	if (
		migrated.schemaVersion !== SESSION_SCHEMA_VERSION ||
		!isNonEmptyString(migrated.sessionId) ||
		!/^\^tc-[0-9a-f]{6}$/u.test(String(migrated.taskId)) ||
		!isNullableSubtaskId(migrated.subtaskId) ||
		!isIsoTimestamp(migrated.startedAt) ||
		!isIsoTimestamp(migrated.endedAt) ||
		!isNonNegativeInteger(migrated.activeDurationSeconds) ||
		!isNonNegativeInteger(migrated.pausedDurationSeconds) ||
		!isExecutionMode(migrated.mode) ||
		!isExecutionStatus(migrated.status) ||
		typeof migrated.endedEarly !== 'boolean' ||
		!isOptionalText(migrated.completedWork) ||
		!isOptionalText(migrated.nextAction) ||
		!isOptionalText(migrated.blockerReason)
	) {
		return null;
	}
	return migrated as unknown as ExecutionSession;
}

function migrateLegacySession(value: Record<string, unknown>): Record<string, unknown> {
	const versionOne =
		value.schemaVersion === 0
			? {
					...value,
					schemaVersion: 1,
					startedAt:
						typeof value.startedAtMs === 'number'
							? new Date(value.startedAtMs).toISOString()
							: value.startedAt,
					endedAt:
						typeof value.endedAtMs === 'number'
							? new Date(value.endedAtMs).toISOString()
							: value.endedAt,
					status: value.status === 'early' ? 'ended-early' : 'completed',
					endedEarly: value.status === 'early',
					completedWork: value.completedWork ?? null,
					nextAction: value.nextAction ?? null,
					blockerReason: value.blockerReason ?? null,
				}
			: value;
	return versionOne.schemaVersion === 1
		? {
				...versionOne,
				schemaVersion: SESSION_SCHEMA_VERSION,
				subtaskId: null,
			}
		: versionOne;
}

function normalizeOptionalText(value: string | null): string | null {
	const normalized = value?.trim() ?? '';
	return normalized.length > 0 ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
	return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isNonNegativeInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isExecutionMode(value: unknown): value is ExecutionMode {
	return (
		value === 'focus-25' ||
		value === 'focus-50' ||
		value === 'custom' ||
		value === 'quick'
	);
}

function isExecutionStatus(value: unknown): value is ExecutionStatus {
	return value === 'completed' || value === 'ended-early';
}

function isOptionalText(value: unknown): value is string | null {
	return value === null || typeof value === 'string';
}

function isNullableSubtaskId(value: unknown): value is string | null {
	return value === null || (typeof value === 'string' && value.length > 0);
}
