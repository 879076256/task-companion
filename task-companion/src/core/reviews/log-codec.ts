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
