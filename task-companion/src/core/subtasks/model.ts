export const SUBTASK_SCHEMA_VERSION = 1;

export type SubtaskStatus = 'active' | 'completed' | 'cancelled';
export type SubtaskOrigin = 'initial' | 'during-execution' | 'template';
export type SubtaskEventType =
	| 'created'
	| 'renamed'
	| 'reordered'
	| 'completed'
	| 'cancelled'
	| 'deleted'
	| 'reopened'
	| 'current-next-set';

export interface Subtask {
	subtaskId: string;
	taskId: string;
	title: string;
	status: SubtaskStatus;
	order: number;
	origin: SubtaskOrigin;
	createdAt: string;
	updatedAt: string;
	completedAt: string | null;
	cancelledAt: string | null;
}

export interface SubtaskEvent {
	schemaVersion: typeof SUBTASK_SCHEMA_VERSION;
	eventId: string;
	eventType: SubtaskEventType;
	taskId: string;
	occurredAt: string;
	subtasks: Subtask[];
	currentNextSubtaskId?: string | null;
}

export interface SubtaskPlan {
	taskId: string;
	subtasks: Subtask[];
	currentNextSubtaskId: string | null;
}

export function emptySubtaskPlan(taskId: string): SubtaskPlan {
	return { taskId, subtasks: [], currentNextSubtaskId: null };
}

export function foldSubtaskEvents(
	taskId: string,
	events: SubtaskEvent[],
): SubtaskPlan {
	const byId = new Map<string, Subtask>();
	let currentNextSubtaskId: string | null = null;
	for (const event of events) {
		if (event.taskId !== taskId) continue;
		for (const subtask of event.subtasks) {
			if (event.eventType === 'deleted') byId.delete(subtask.subtaskId);
			else byId.set(subtask.subtaskId, subtask);
		}
		if ('currentNextSubtaskId' in event) {
			currentNextSubtaskId = event.currentNextSubtaskId ?? null;
		}
	}
	const subtasks = [...byId.values()].sort(compareSubtasks);
	const current = subtasks.find(
		(subtask) =>
			subtask.subtaskId === currentNextSubtaskId && subtask.status === 'active',
	);
	return {
		taskId,
		subtasks,
		currentNextSubtaskId: current?.subtaskId ?? null,
	};
}

export function normalizeSubtaskEvent(value: unknown): SubtaskEvent | null {
	if (!isRecord(value)) return null;
	if (
		value.schemaVersion !== SUBTASK_SCHEMA_VERSION ||
		!isNonEmptyString(value.eventId) ||
		!isEventType(value.eventType) ||
		!isTaskId(value.taskId) ||
		!isIsoTimestamp(value.occurredAt) ||
		!Array.isArray(value.subtasks)
	) {
		return null;
	}
	const subtasks = value.subtasks.map(normalizeSubtask);
	if (subtasks.some((subtask) => subtask === null)) return null;
	if (
		'currentNextSubtaskId' in value &&
		value.currentNextSubtaskId !== null &&
		!isNonEmptyString(value.currentNextSubtaskId)
	) {
		return null;
	}
	const event: SubtaskEvent = {
		schemaVersion: SUBTASK_SCHEMA_VERSION,
		eventId: value.eventId,
		eventType: value.eventType,
		taskId: value.taskId,
		occurredAt: value.occurredAt,
		subtasks: subtasks as Subtask[],
	};
	if ('currentNextSubtaskId' in value) {
		event.currentNextSubtaskId = value.currentNextSubtaskId as string | null;
	}
	return event;
}

export function normalizeSubtaskTitle(title: string): string | null {
	const normalized = title.trim().replace(/\s+/gu, ' ');
	return normalized.length > 0 && normalized.length <= 200 ? normalized : null;
}

export function isTaskId(value: unknown): value is string {
	return typeof value === 'string' && /^\^tc-[0-9a-f]{6}$/u.test(value);
}

function normalizeSubtask(value: unknown): Subtask | null {
	if (!isRecord(value)) return null;
	if (
		!isNonEmptyString(value.subtaskId) ||
		!isTaskId(value.taskId) ||
		normalizeSubtaskTitle(String(value.title)) !== value.title ||
		!isStatus(value.status) ||
		!Number.isSafeInteger(value.order) ||
		Number(value.order) < 0 ||
		!isOrigin(value.origin) ||
		!isIsoTimestamp(value.createdAt) ||
		!isIsoTimestamp(value.updatedAt) ||
		!isNullableTimestamp(value.completedAt) ||
		!isNullableTimestamp(value.cancelledAt)
	) {
		return null;
	}
	return value as unknown as Subtask;
}

function compareSubtasks(left: Subtask, right: Subtask): number {
	return left.order - right.order || left.createdAt.localeCompare(right.createdAt);
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

function isNullableTimestamp(value: unknown): value is string | null {
	return value === null || isIsoTimestamp(value);
}

function isStatus(value: unknown): value is SubtaskStatus {
	return value === 'active' || value === 'completed' || value === 'cancelled';
}

function isOrigin(value: unknown): value is SubtaskOrigin {
	return value === 'initial' || value === 'during-execution' || value === 'template';
}

function isEventType(value: unknown): value is SubtaskEventType {
	return (
		value === 'created' ||
		value === 'renamed' ||
		value === 'reordered' ||
		value === 'completed' ||
		value === 'cancelled' ||
		value === 'deleted' ||
		value === 'reopened' ||
		value === 'current-next-set'
	);
}
