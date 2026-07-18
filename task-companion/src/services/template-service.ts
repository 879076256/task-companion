import type { ReviewEvent, ReviewReflection } from '../core/reviews/model';
import type { SubtaskPlan } from '../core/subtasks/model';
import {
	createExperienceTemplate,
	ExperienceTemplate,
	ExperienceTemplateDraft,
	rankTemplateSuggestions,
	TEMPLATE_SCHEMA_VERSION,
	TemplateEvent,
	updateExperienceTemplate,
} from '../core/templates/model';
import { TemplateRepository } from './template-repository';

export class TemplateService {
	constructor(
		private readonly repository: TemplateRepository,
		private readonly idFactory: () => string = () => crypto.randomUUID(),
	) {}

	list(): Promise<ExperienceTemplate[]> {
		return this.repository.list();
	}

	async suggest(taskTitle: string): Promise<ExperienceTemplate[]> {
		return rankTemplateSuggestions(taskTitle, await this.list());
	}

	async saveNew(
		review: ReviewEvent,
		reflection: ReviewReflection,
		plan: SubtaskPlan,
		draft: ExperienceTemplateDraft,
		nowMs: number,
	): Promise<ExperienceTemplate> {
		const template = createExperienceTemplate(
			this.idFactory(),
			review,
			reflection,
			plan,
			draft,
			nowMs,
		);
		await this.append('created', template, nowMs);
		return template;
	}

	async update(
		templateId: string,
		review: ReviewEvent,
		reflection: ReviewReflection,
		plan: SubtaskPlan,
		draft: ExperienceTemplateDraft,
		nowMs: number,
	): Promise<ExperienceTemplate> {
		const current = (await this.list()).find(
			(template) => template.templateId === templateId,
		);
		if (!current) throw new Error('Experience template not found.');
		const template = updateExperienceTemplate(
			current,
			review,
			reflection,
			plan,
			draft,
			nowMs,
		);
		if (template !== current) await this.append('updated', template, nowMs);
		return template;
	}

	private append(
		eventType: TemplateEvent['eventType'],
		template: ExperienceTemplate,
		nowMs: number,
	): Promise<void> {
		return this.repository.append({
			schemaVersion: TEMPLATE_SCHEMA_VERSION,
			eventId: this.idFactory(),
			eventType,
			occurredAt: new Date(nowMs).toISOString(),
			template,
		});
	}
}
