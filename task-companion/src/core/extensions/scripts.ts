import {
	ExtensionEventName,
	isExtensionEventName,
} from './events';

export const CONTROLLED_SCRIPT_SCHEMA_VERSION = 1;
export const CONTROLLED_SCRIPT_STATE_VERSION = 1;

export type ControlledScriptPermission =
	| 'ui:notice'
	| 'ui:open'
	| 'tasks:read-current';

export type ControlledScriptAction =
	| { type: 'notice'; message: string }
	| {
			type: 'open-view';
			view: 'task-picker' | 'review-queue' | 'session-history';
	  };

export interface ControlledScript {
	schemaVersion: typeof CONTROLLED_SCRIPT_SCHEMA_VERSION;
	scriptId: string;
	name: string;
	version: number;
	event: ExtensionEventName;
	permissions: ControlledScriptPermission[];
	actions: ControlledScriptAction[];
}

export interface ControlledScriptSelection {
	activeVersion: number;
	enabled: boolean;
	disabledReason: string | null;
}

export interface ControlledScriptState {
	schemaVersion: typeof CONTROLLED_SCRIPT_STATE_VERSION;
	scripts: Record<string, ControlledScriptSelection>;
}

export interface ControlledScriptError {
	schemaVersion: 1;
	errorId: string;
	scriptId: string;
	failedVersion: number;
	restoredVersion: number | null;
	event: ExtensionEventName;
	occurredAt: string;
	message: string;
}

export const EMPTY_CONTROLLED_SCRIPT_STATE: ControlledScriptState = {
	schemaVersion: CONTROLLED_SCRIPT_STATE_VERSION,
	scripts: {},
};

export function normalizeControlledScript(value: unknown): ControlledScript | null {
	if (!isRecord(value)) return null;
	if (
		value.schemaVersion !== CONTROLLED_SCRIPT_SCHEMA_VERSION ||
		!isSafeId(value.scriptId) ||
		!isBoundedText(value.name, 120) ||
		!isPositiveInteger(value.version) ||
		!isExtensionEventName(value.event) ||
		!Array.isArray(value.permissions) ||
		!value.permissions.every(isPermission) ||
		!Array.isArray(value.actions) ||
		value.actions.length > 20
	) {
		return null;
	}
	const actions = value.actions.map(normalizeAction);
	if (actions.some((action) => action === null)) return null;
	return {
		schemaVersion: CONTROLLED_SCRIPT_SCHEMA_VERSION,
		scriptId: value.scriptId,
		name: value.name,
		version: value.version,
		event: value.event,
		permissions: [...new Set(value.permissions)],
		actions: actions as ControlledScriptAction[],
	};
}

export function normalizeControlledScriptState(
	value: unknown,
): ControlledScriptState {
	if (
		!isRecord(value) ||
		value.schemaVersion !== CONTROLLED_SCRIPT_STATE_VERSION ||
		!isRecord(value.scripts)
	) {
		return cloneState(EMPTY_CONTROLLED_SCRIPT_STATE);
	}
	const scripts: Record<string, ControlledScriptSelection> = {};
	for (const [scriptId, selection] of Object.entries(value.scripts)) {
		if (!isSafeId(scriptId) || !isRecord(selection)) continue;
		if (
			!isPositiveInteger(selection.activeVersion) ||
			typeof selection.enabled !== 'boolean' ||
			!(selection.disabledReason === null ||
				isBoundedText(selection.disabledReason, 300))
		) {
			continue;
		}
		scripts[scriptId] = {
			activeVersion: selection.activeVersion,
			enabled: selection.enabled,
			disabledReason: selection.disabledReason,
		};
	}
	return { schemaVersion: CONTROLLED_SCRIPT_STATE_VERSION, scripts };
}

export function requiredPermission(
	action: ControlledScriptAction,
): ControlledScriptPermission {
	return action.type === 'notice' ? 'ui:notice' : 'ui:open';
}

export function selectPreviousVersion(
	versions: ControlledScript[],
	failedVersion: number,
): ControlledScript | null {
	return (
		versions
			.filter((script) => script.version < failedVersion)
			.sort((left, right) => right.version - left.version)[0] ?? null
	);
}

export function sanitizedScriptError(
	script: ControlledScript,
	event: { name: ExtensionEventName },
	restoredVersion: number | null,
	message: string,
	nowMs: number,
	errorId: string,
): ControlledScriptError {
	return {
		schemaVersion: 1,
		errorId,
		scriptId: script.scriptId,
		failedVersion: script.version,
		restoredVersion,
		event: event.name,
		occurredAt: new Date(nowMs).toISOString(),
		message: message.slice(0, 300),
	};
}

export function cloneState(state: ControlledScriptState): ControlledScriptState {
	return {
		schemaVersion: CONTROLLED_SCRIPT_STATE_VERSION,
		scripts: Object.fromEntries(
			Object.entries(state.scripts).map(([scriptId, selection]) => [
				scriptId,
				{ ...selection },
			]),
		),
	};
}

function normalizeAction(value: unknown): ControlledScriptAction | null {
	if (!isRecord(value) || typeof value.type !== 'string') return null;
	if (value.type === 'notice' && isBoundedText(value.message, 240)) {
		return { type: 'notice', message: value.message };
	}
	if (
		value.type === 'open-view' &&
		(value.view === 'task-picker' ||
			value.view === 'review-queue' ||
			value.view === 'session-history')
	) {
		return { type: 'open-view', view: value.view };
	}
	return null;
}

function isPermission(value: unknown): value is ControlledScriptPermission {
	return (
		value === 'ui:notice' ||
		value === 'ui:open' ||
		value === 'tasks:read-current'
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isSafeId(value: unknown): value is string {
	return typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/u.test(value);
}

function isBoundedText(value: unknown, maximumLength: number): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= maximumLength;
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
