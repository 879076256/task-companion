import type { ReviewStorage } from '../adapters/obsidian/obsidian-review-vault';
import {
	parseTemplateLog,
	serializeTemplateEvent,
} from '../core/templates/log-codec';
import {
	ExperienceTemplate,
	foldTemplateEvents,
	TemplateEvent,
} from '../core/templates/model';

export const TEMPLATE_FOLDER = 'TaskCompanion/Templates';
export const TEMPLATE_INDEX_PATH = `${TEMPLATE_FOLDER}/index.jsonl`;

export class TemplateRepository {
	constructor(private readonly storage: ReviewStorage) {}

	async append(event: TemplateEvent): Promise<void> {
		const current = await this.storage.read(TEMPLATE_INDEX_PATH);
		if (
			current !== null &&
			parseTemplateLog(current).events.some(
				(candidate) => candidate.eventId === event.eventId,
			)
		) {
			return;
		}
		await this.storage.append(TEMPLATE_INDEX_PATH, serializeTemplateEvent(event));
	}

	async list(): Promise<ExperienceTemplate[]> {
		const content = await this.storage.read(TEMPLATE_INDEX_PATH);
		return content === null
			? []
			: foldTemplateEvents(parseTemplateLog(content).events);
	}
}
