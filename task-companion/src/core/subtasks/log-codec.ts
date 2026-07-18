import { normalizeSubtaskEvent, SubtaskEvent } from './model';

export interface SubtaskLogReadResult {
	events: SubtaskEvent[];
	invalidLineNumbers: number[];
}

export function serializeSubtaskEvent(event: SubtaskEvent): string {
	return `${JSON.stringify(event)}\n`;
}

export function parseSubtaskLog(text: string): SubtaskLogReadResult {
	const events: SubtaskEvent[] = [];
	const invalidLineNumbers: number[] = [];
	for (const [index, line] of text.split(/\r?\n/u).entries()) {
		if (line.trim().length === 0) continue;
		try {
			const event = normalizeSubtaskEvent(JSON.parse(line) as unknown);
			if (event) events.push(event);
			else invalidLineNumbers.push(index + 1);
		} catch {
			invalidLineNumbers.push(index + 1);
		}
	}
	return { events, invalidLineNumbers };
}

export function purgeSubtaskFromLog(
	text: string,
	taskId: string,
	subtaskId: string,
): { content: string; removedReferences: number } {
	let removedReferences = 0;
	const lines = text.split(/\r?\n/u).flatMap((line) => {
		if (line.trim().length === 0) return [line];
		let event: SubtaskEvent | null = null;
		try {
			event = normalizeSubtaskEvent(JSON.parse(line) as unknown);
		} catch {
			// Invalid lines are preserved verbatim during a targeted purge.
		}
		if (!event || event.taskId !== taskId) return [line];

		const keptSubtasks = event.subtasks.filter((subtask) => {
			if (subtask.subtaskId !== subtaskId) return true;
			removedReferences += 1;
			return false;
		});
		const clearsCurrentNext =
			'currentNextSubtaskId' in event &&
			event.currentNextSubtaskId === subtaskId;
		if (clearsCurrentNext) removedReferences += 1;
		if (keptSubtasks.length === event.subtasks.length && !clearsCurrentNext) {
			return [line];
		}

		if (keptSubtasks.length === 0 && !('currentNextSubtaskId' in event)) {
			return [];
		}
		const cleaned: SubtaskEvent = { ...event, subtasks: keptSubtasks };
		if (clearsCurrentNext) cleaned.currentNextSubtaskId = null;
		return [JSON.stringify(cleaned)];
	});
	return { content: lines.join('\n'), removedReferences };
}
