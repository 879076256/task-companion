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
