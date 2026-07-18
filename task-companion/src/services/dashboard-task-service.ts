import type { TaskScanner } from '../adapters/tasks/task-scanner';
import { selectTasks } from '../core/tasks/task-rules';
import type {
	ParsedTask,
	SelectedTask,
} from '../core/tasks/task-rules';
import {
	buildHomeReminderGroups,
	type HomeReminderGroups,
} from '../core/dashboard/home-reminders';

export interface DashboardTaskSnapshot {
	tasks: SelectedTask[];
	allTasks: ParsedTask[];
	home: HomeReminderGroups;
	failures: Awaited<ReturnType<TaskScanner['scan']>>['failures'];
}

/** Coalesces simultaneous homepage component scans without retaining stale results. */
export class DashboardTaskService {
	private readonly inFlight = new Map<string, Promise<DashboardTaskSnapshot>>();
	private readonly listeners = new Set<() => void>();

	constructor(private readonly scanner: TaskScanner) {}

	load(today: string): Promise<DashboardTaskSnapshot> {
		const existing = this.inFlight.get(today);
		if (existing) return existing;
		const operation = this.scanner.scan().then((result) => {
			const allTasks = result.tasks.map(({ parsed }) => parsed);
			return {
				tasks: selectTasks(allTasks, today),
				allTasks,
				home: buildHomeReminderGroups(
					allTasks,
					result.historyTasks ?? [],
					today,
				),
				failures: result.failures,
			};
		}).finally(() => {
			if (this.inFlight.get(today) === operation) this.inFlight.delete(today);
		});
		this.inFlight.set(today, operation);
		return operation;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	notifyChanged(): void {
		for (const listener of this.listeners) {
			try {
				listener();
			} catch {
				// One detached widget must not prevent the others from refreshing.
			}
		}
	}
}
