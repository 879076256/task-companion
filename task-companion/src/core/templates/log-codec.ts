import {
	foldTemplateEvents,
	normalizeTemplateEvent,
	TemplateEvent,
} from './model';

export interface TemplateLogParseResult {
	events: TemplateEvent[];
	invalidLineNumbers: number[];
}

export function serializeTemplateEvent(event: TemplateEvent): string {
	return `${JSON.stringify(event)}\n`;
}

export function parseTemplateLog(content: string): TemplateLogParseResult {
	const events: TemplateEvent[] = [];
	const invalidLineNumbers: number[] = [];
	for (const [index, line] of content.split('\n').entries()) {
		if (line.trim().length === 0) continue;
		try {
			const event = normalizeTemplateEvent(JSON.parse(line) as unknown);
			if (event) events.push(event);
			else invalidLineNumbers.push(index + 1);
		} catch {
			invalidLineNumbers.push(index + 1);
		}
	}
	return { events, invalidLineNumbers };
}

export function readTemplates(content: string) {
	return foldTemplateEvents(parseTemplateLog(content).events);
}
