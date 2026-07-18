import type { ReviewEvent, ReviewReflection } from '../reviews/model';
import type { SubtaskPlan } from '../subtasks/model';

export const TEMPLATE_SCHEMA_VERSION = 1;

export interface ExperienceTemplate {
	schemaVersion: typeof TEMPLATE_SCHEMA_VERSION;
	templateId: string;
	version: number;
	name: string;
	taskTitleSamples: string[];
	subtaskTitles: string[];
	reviewCount: number;
	averageSessionCount: number;
	averageActiveDurationSeconds: number;
	commonBlockers: string[];
	checklist: string[];
	principles: string[];
	sourceReviewIds: string[];
	createdAt: string;
	updatedAt: string;
}

export interface ExperienceTemplateDraft {
	name: string;
	checklist: string[];
	principles: string[];
}

export type TemplateEventType = 'created' | 'updated';

export interface TemplateEvent {
	schemaVersion: typeof TEMPLATE_SCHEMA_VERSION;
	eventId: string;
	eventType: TemplateEventType;
	occurredAt: string;
	template: ExperienceTemplate;
}

export function createExperienceTemplate(
	templateId: string,
	review: ReviewEvent,
	reflection: ReviewReflection,
	plan: SubtaskPlan,
	draft: ExperienceTemplateDraft,
	nowMs: number,
): ExperienceTemplate {
	const occurredAt = toIso(nowMs);
	return {
		schemaVersion: TEMPLATE_SCHEMA_VERSION,
		templateId: requireId(templateId),
		version: 1,
		name: requireText(draft.name, 120),
		taskTitleSamples: [requireText(review.taskTitle, 500)],
		subtaskTitles: templateSubtaskTitles(plan),
		reviewCount: 1,
		averageSessionCount: review.stats.sessionCount,
		averageActiveDurationSeconds: review.stats.totalActiveDurationSeconds,
		commonBlockers: normalizeTextList([reflection.reworkOrBlocker], 20, 500),
		checklist: normalizeTextList(draft.checklist, 50, 300),
		principles: normalizeTextList(draft.principles, 50, 500),
		sourceReviewIds: [requireId(review.reviewId)],
		createdAt: occurredAt,
		updatedAt: occurredAt,
	};
}

export function updateExperienceTemplate(
	current: ExperienceTemplate,
	review: ReviewEvent,
	reflection: ReviewReflection,
	plan: SubtaskPlan,
	draft: ExperienceTemplateDraft,
	nowMs: number,
): ExperienceTemplate {
	if (current.sourceReviewIds.includes(review.reviewId)) return current;
	const nextCount = current.reviewCount + 1;
	return {
		...current,
		version: current.version + 1,
		name: requireText(draft.name, 120),
		taskTitleSamples: normalizeTextList(
			[...current.taskTitleSamples, review.taskTitle],
			10,
			500,
		),
		subtaskTitles: mergeOrderedTitles(
			current.subtaskTitles,
			templateSubtaskTitles(plan),
		),
		reviewCount: nextCount,
		averageSessionCount: weightedAverage(
			current.averageSessionCount,
			current.reviewCount,
			review.stats.sessionCount,
		),
		averageActiveDurationSeconds: weightedAverage(
			current.averageActiveDurationSeconds,
			current.reviewCount,
			review.stats.totalActiveDurationSeconds,
		),
		commonBlockers: normalizeTextList(
			[...current.commonBlockers, reflection.reworkOrBlocker],
			20,
			500,
		),
		checklist: normalizeTextList(
			[...current.checklist, ...draft.checklist],
			50,
			300,
		),
		principles: normalizeTextList(
			[...current.principles, ...draft.principles],
			50,
			500,
		),
		sourceReviewIds: [...current.sourceReviewIds, review.reviewId],
		updatedAt: toIso(nowMs),
	};
}

export function foldTemplateEvents(events: TemplateEvent[]): ExperienceTemplate[] {
	const latest = new Map<string, ExperienceTemplate>();
	for (const event of events) {
		const current = latest.get(event.template.templateId);
		if (!current || event.template.version >= current.version) {
			latest.set(event.template.templateId, event.template);
		}
	}
	return [...latest.values()].sort((left, right) =>
		right.updatedAt.localeCompare(left.updatedAt),
	);
}

export function rankTemplateSuggestions(
	taskTitle: string,
	templates: ExperienceTemplate[],
): ExperienceTemplate[] {
	const targetTokens = titleTokens(taskTitle);
	return [...templates].sort((left, right) => {
		const scoreDifference =
			templateScore(right, targetTokens) - templateScore(left, targetTokens);
		return scoreDifference !== 0
			? scoreDifference
			: right.updatedAt.localeCompare(left.updatedAt);
	});
}

export function normalizeTemplateEvent(value: unknown): TemplateEvent | null {
	if (!isRecord(value) || value.schemaVersion !== TEMPLATE_SCHEMA_VERSION) {
		return null;
	}
	const template = normalizeExperienceTemplate(value.template);
	if (
		!template ||
		!isNonEmptyString(value.eventId) ||
		(value.eventType !== 'created' && value.eventType !== 'updated') ||
		!isIsoTimestamp(value.occurredAt)
	) {
		return null;
	}
	return {
		schemaVersion: TEMPLATE_SCHEMA_VERSION,
		eventId: value.eventId,
		eventType: value.eventType,
		occurredAt: value.occurredAt,
		template,
	};
}

export function normalizeExperienceTemplate(
	value: unknown,
): ExperienceTemplate | null {
	if (
		!isRecord(value) ||
		value.schemaVersion !== TEMPLATE_SCHEMA_VERSION ||
		!isNonEmptyString(value.templateId) ||
		!isPositiveInteger(value.version) ||
		!isBoundedText(value.name, 120) ||
		!isTextList(value.taskTitleSamples, 10, 500) ||
		!isTextList(value.subtaskTitles, 100, 200) ||
		!isPositiveInteger(value.reviewCount) ||
		!isNonNegativeInteger(value.averageSessionCount) ||
		!isNonNegativeInteger(value.averageActiveDurationSeconds) ||
		!isTextList(value.commonBlockers, 20, 500) ||
		!isTextList(value.checklist, 50, 300) ||
		!isTextList(value.principles, 50, 500) ||
		!isTextList(value.sourceReviewIds, 1000, 200) ||
		!isIsoTimestamp(value.createdAt) ||
		!isIsoTimestamp(value.updatedAt)
	) {
		return null;
	}
	return value as unknown as ExperienceTemplate;
}

export function normalizeTextLines(value: string): string[] {
	return normalizeTextList(value.split('\n'), 50, 500);
}

function templateSubtaskTitles(plan: SubtaskPlan): string[] {
	return plan.subtasks
		.filter((subtask) => subtask.status !== 'cancelled')
		.sort((left, right) => left.order - right.order)
		.map((subtask) => subtask.title);
}

function mergeOrderedTitles(left: string[], right: string[]): string[] {
	return normalizeTextList([...left, ...right], 100, 200);
}

function normalizeTextList(
	values: Array<string | null>,
	maximumItems: number,
	maximumLength: number,
): string[] {
	const normalized: string[] = [];
	const seen = new Set<string>();
	for (const value of values) {
		const text = value?.trim().replace(/\s+/gu, ' ') ?? '';
		if (text.length === 0 || text.length > maximumLength || seen.has(text)) continue;
		seen.add(text);
		normalized.push(text);
		if (normalized.length >= maximumItems) break;
	}
	return normalized;
}

function weightedAverage(current: number, count: number, next: number): number {
	return Math.round((current * count + next) / (count + 1));
}

function templateScore(template: ExperienceTemplate, target: Set<string>): number {
	let score = 0;
	for (const sample of template.taskTitleSamples) {
		for (const token of titleTokens(sample)) {
			if (target.has(token)) score += 1;
		}
	}
	return score;
}

function titleTokens(value: string): Set<string> {
	const normalized = value.toLocaleLowerCase().replace(/\s+/gu, ' ').trim();
	const tokens = new Set(normalized.match(/[\p{L}\p{N}]{2,}/gu) ?? []);
	const compact = normalized.replace(/[^\p{L}\p{N}]/gu, '');
	for (let index = 0; index < compact.length - 1; index += 1) {
		tokens.add(compact.slice(index, index + 2));
	}
	return tokens;
}

function requireId(value: string): string {
	if (!isNonEmptyString(value)) throw new Error('Template identifier is required.');
	return value;
}

function requireText(value: string, maximumLength: number): string {
	const normalized = value.trim().replace(/\s+/gu, ' ');
	if (normalized.length === 0 || normalized.length > maximumLength) {
		throw new Error('Template text is invalid.');
	}
	return normalized;
}

function toIso(nowMs: number): string {
	if (!Number.isFinite(nowMs) || nowMs < 0) throw new Error('Invalid timestamp.');
	return new Date(nowMs).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

function isBoundedText(value: unknown, maximumLength: number): value is string {
	return isNonEmptyString(value) && value.length <= maximumLength;
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isIsoTimestamp(value: unknown): value is string {
	return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isTextList(
	value: unknown,
	maximumItems: number,
	maximumLength: number,
): value is string[] {
	return (
		Array.isArray(value) &&
		value.length <= maximumItems &&
		value.every((item) => isBoundedText(item, maximumLength))
	);
}
