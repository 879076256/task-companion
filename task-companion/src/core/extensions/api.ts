import type { ReviewEvent } from '../reviews/model';
import type { ExecutionSession } from '../sessions/model';
import type { TimerMode, TimerState, TimerTransition } from '../timer/model';
import type { ExperienceTemplate } from '../templates/model';
import type { HomeReminderTodayLabel } from '../dashboard/home-reminders';
import type { TaskPriority } from '../tasks/task-rules';
import type {
	ExtensionEventMap,
	ExtensionEventName,
} from './events';

export const TASK_COMPANION_API_VERSION = '1.1.0' as const;

export interface HomeReminderApiItem {
	id: string;
	text: string;
	displayText: string;
	sourcePath: string;
	lineNumber: number;
	priority: TaskPriority | null;
	recurring: boolean;
	start: string | null;
	scheduled: string | null;
	due: string | null;
	today: { rank: number; label: HomeReminderTodayLabel } | null;
}

export interface HomeReminderApiSnapshot {
	date: string;
	daily: HomeReminderApiItem[];
	today: HomeReminderApiItem[];
	important: HomeReminderApiItem[];
	pending: HomeReminderApiItem[];
	failureCount: number;
}

export interface TaskCompanionApiV1 {
	apiVersion: typeof TASK_COMPANION_API_VERSION;
	tasks: {
		getCurrentId(): string | null;
		getCurrentSubtaskId(): string | null;
		homeReminders(date?: string): Promise<HomeReminderApiSnapshot>;
	};
	timer: {
		getState(): TimerState;
		start(mode: TimerMode, durationSeconds?: number): TimerTransition;
		pause(): TimerTransition;
		resume(): TimerTransition;
		finish(): TimerTransition;
	};
	sessions: {
		history(taskId: string | null): Promise<ExecutionSession[]>;
	};
	reviews: {
		list(): Promise<ReviewEvent[]>;
	};
	templates: {
		list(): Promise<ExperienceTemplate[]>;
		suggest(taskTitle: string): Promise<ExperienceTemplate[]>;
		apply(taskId: string, templateId: string): Promise<number>;
	};
	ui: {
		openTaskPicker(): void;
		openReviewQueue(): void;
		openSessionHistory(): void;
	};
	events: {
		on<K extends ExtensionEventName>(
			name: K,
			listener: (payload: ExtensionEventMap[K]) => void,
		): () => void;
	};
}
