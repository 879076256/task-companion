import type { ReviewTargetType } from '../reviews/model';
import type { TimerMode } from '../timer/model';

export const EXTENSION_EVENT_NAMES = [
	'task-selected',
	'timer-started',
	'timer-paused',
	'timer-resumed',
	'timer-finished',
	'session-saved',
	'subtask-created',
	'subtask-completed',
	'task-completed',
	'review-created',
	'review-completed',
] as const;

export type ExtensionEventName = (typeof EXTENSION_EVENT_NAMES)[number];

interface TaskTargetPayload {
	taskId: string;
	subtaskId: string | null;
	occurredAt: string;
}

export interface ExtensionEventMap {
	'task-selected': TaskTargetPayload;
	'timer-started': TaskTargetPayload & { sessionId: string; mode: TimerMode };
	'timer-paused': TaskTargetPayload & { sessionId: string; mode: TimerMode };
	'timer-resumed': TaskTargetPayload & { sessionId: string; mode: TimerMode };
	'timer-finished': TaskTargetPayload & {
		sessionId: string;
		mode: TimerMode;
		endedEarly: boolean;
	};
	'session-saved': TaskTargetPayload & { sessionId: string };
	'subtask-created': TaskTargetPayload;
	'subtask-completed': TaskTargetPayload;
	'task-completed': TaskTargetPayload;
	'review-created': TaskTargetPayload & {
		reviewId: string;
		targetType: ReviewTargetType;
	};
	'review-completed': TaskTargetPayload & {
		reviewId: string;
		targetType: ReviewTargetType;
	};
}

export type ExtensionEventEnvelope<K extends ExtensionEventName = ExtensionEventName> = {
	[Name in K]: { name: Name; payload: ExtensionEventMap[Name] };
}[K];

type EventListener<K extends ExtensionEventName> = (
	payload: ExtensionEventMap[K],
) => void;

export class ExtensionEventBus {
	private readonly listeners = new Map<
		ExtensionEventName,
		Set<(payload: never) => void>
	>();

	on<K extends ExtensionEventName>(name: K, listener: EventListener<K>): () => void {
		const listeners = this.listeners.get(name) ?? new Set();
		listeners.add(listener);
		this.listeners.set(name, listeners);
		return () => listeners.delete(listener);
	}

	emit<K extends ExtensionEventName>(name: K, payload: ExtensionEventMap[K]): void {
		for (const listener of this.listeners.get(name) ?? []) {
			try {
				listener(payload as never);
			} catch {
				// Extension listeners are isolated from task and timer core behavior.
			}
		}
	}

	clear(): void {
		this.listeners.clear();
	}
}

export function isExtensionEventName(value: unknown): value is ExtensionEventName {
	return (
		typeof value === 'string' &&
		(EXTENSION_EVENT_NAMES as readonly string[]).includes(value)
	);
}
