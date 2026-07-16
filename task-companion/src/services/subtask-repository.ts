import type { SessionLogStorage } from '../adapters/obsidian/obsidian-session-vault';
import { parseSubtaskLog, serializeSubtaskEvent } from '../core/subtasks/log-codec';
import {
	emptySubtaskPlan,
	foldSubtaskEvents,
	SubtaskEvent,
	SubtaskPlan,
} from '../core/subtasks/model';

export const SUBTASK_LOG_FOLDER = 'TaskCompanion/Subtasks';

export class SubtaskRepository {
	constructor(private readonly storage: SessionLogStorage) {}

	async append(event: SubtaskEvent): Promise<void> {
		const path = pathForTask(event.taskId);
		const current = await this.storage.read(path);
		if (
			current !== null &&
			parseSubtaskLog(current).events.some(
				(candidate) => candidate.eventId === event.eventId,
			)
		) {
			return;
		}
		await this.storage.append(path, serializeSubtaskEvent(event));
	}

	async readPlan(taskId: string): Promise<SubtaskPlan> {
		const content = await this.storage.read(pathForTask(taskId));
		if (content === null) return emptySubtaskPlan(taskId);
		return foldSubtaskEvents(taskId, parseSubtaskLog(content).events);
	}
}

export function pathForTask(taskId: string): string {
	return `${SUBTASK_LOG_FOLDER}/${taskId.slice(1)}.jsonl`;
}
