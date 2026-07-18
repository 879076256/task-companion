import {
	normalizeReviewEvent,
	ReviewEvent,
} from './model';

export interface ReviewLogParseResult {
	events: ReviewEvent[];
	invalidLineNumbers: number[];
}

export function serializeReviewEvent(event: ReviewEvent): string {
	return `${JSON.stringify(event)}\n`;
}

export function parseReviewLog(content: string): ReviewLogParseResult {
	const events: ReviewEvent[] = [];
	const invalidLineNumbers: number[] = [];
	for (const [index, line] of content.split('\n').entries()) {
		if (line.trim().length === 0) continue;
		try {
			const event = normalizeReviewEvent(JSON.parse(line) as unknown);
			if (event) events.push(event);
			else invalidLineNumbers.push(index + 1);
		} catch {
			invalidLineNumbers.push(index + 1);
		}
	}
	return { events, invalidLineNumbers };
}

export function purgeSubtaskReviewsFromLog(
	content: string,
	taskId: string,
	subtaskId: string,
): { content: string; removed: number; markdownPaths: string[] } {
	let removed = 0;
	const markdownPaths = new Set<string>();
	const lines = content.split('\n').filter((line) => {
		if (line.trim().length === 0) return true;
		try {
			const event = normalizeReviewEvent(JSON.parse(line) as unknown);
			if (
				event?.targetType === 'subtask' &&
				event.taskId === taskId &&
				event.subtaskId === subtaskId
			) {
				removed += 1;
				if (event.markdownPath) markdownPaths.add(event.markdownPath);
				return false;
			}
		} catch {
			// Invalid lines are preserved verbatim during a targeted purge.
		}
		return true;
	});
	return { content: lines.join('\n'), removed, markdownPaths: [...markdownPaths] };
}
