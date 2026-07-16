export const REVIEW_SCHEMA_VERSION = 1;

export type ReviewStatus = 'pending' | 'completed';

export interface ReviewStats {
	taskStartedAt: string | null;
	taskSpanSeconds: number;
	activeDayCount: number;
	sessionCount: number;
	totalActiveDurationSeconds: number;
	totalPausedDurationSeconds: number;
	endedEarlySessionCount: number;
	initialSubtaskCount: number;
	addedDuringExecutionCount: number;
	completedSubtaskCount: number;
	cancelledSubtaskCount: number;
	longestStepTitle: string | null;
	longestStepActiveDurationSeconds: number;
	lastProgress: string | null;
	outstandingSubtasks: string[];
}

export interface ReviewEvent {
	schemaVersion: typeof REVIEW_SCHEMA_VERSION;
	eventId: string;
	reviewId: string;
	taskId: string;
	taskTitle: string;
	sourcePath: string;
	sourceLineNumber: number;
	occurredAt: string;
	completedAt: string;
	reviewStatus: ReviewStatus;
	stats: ReviewStats;
	reviewText: string | null;
	wentWell: string | null;
	reworkOrBlocker: string | null;
	nextAdjustment: string | null;
	markdownPath: string | null;
}

export interface ReviewReflection {
	reviewText: string | null;
	wentWell: string | null;
	reworkOrBlocker: string | null;
	nextAdjustment: string | null;
}

export interface PendingReviewMarkdownWrite {
	reviewId: string;
	path: string;
	content: string;
	completedEvent: ReviewEvent;
}

export function foldReviewEvents(events: ReviewEvent[]): ReviewEvent[] {
	const latestByReviewId = new Map<string, ReviewEvent>();
	for (const event of events) latestByReviewId.set(event.reviewId, event);
	return [...latestByReviewId.values()].sort((left, right) =>
		right.completedAt.localeCompare(left.completedAt),
	);
}

export function normalizeReviewEvent(value: unknown): ReviewEvent | null {
	if (!isRecord(value) || !isReviewStats(value.stats)) return null;
	if (
		value.schemaVersion !== REVIEW_SCHEMA_VERSION ||
		!isNonEmptyString(value.eventId) ||
		!isNonEmptyString(value.reviewId) ||
		!isTaskId(value.taskId) ||
		!isNonEmptyString(value.taskTitle) ||
		!isNonEmptyString(value.sourcePath) ||
		!isPositiveInteger(value.sourceLineNumber) ||
		!isIsoTimestamp(value.occurredAt) ||
		!isIsoTimestamp(value.completedAt) ||
		!isReviewStatus(value.reviewStatus) ||
		!isOptionalText(value.reviewText) ||
		!isOptionalText(value.wentWell) ||
		!isOptionalText(value.reworkOrBlocker) ||
		!isOptionalText(value.nextAdjustment) ||
		!isOptionalText(value.markdownPath)
	) {
		return null;
	}
	return value as unknown as ReviewEvent;
}

export function normalizePendingReviewMarkdownWrite(
	value: unknown,
): PendingReviewMarkdownWrite | null {
	if (!isRecord(value)) return null;
	const completedEvent = normalizeReviewEvent(value.completedEvent);
	if (
		!isNonEmptyString(value.reviewId) ||
		!isNonEmptyString(value.path) ||
		typeof value.content !== 'string' ||
		completedEvent === null ||
		completedEvent.reviewStatus !== 'completed' ||
		completedEvent.reviewId !== value.reviewId ||
		completedEvent.markdownPath !== value.path
	) {
		return null;
	}
	return {
		reviewId: value.reviewId,
		path: value.path,
		content: value.content,
		completedEvent,
	};
}

export function normalizeReviewText(value: string | null): string | null {
	const normalized = value?.trim() ?? '';
	return normalized.length > 0 ? normalized : null;
}

function isReviewStats(value: unknown): value is ReviewStats {
	if (!isRecord(value)) return false;
	return (
		(value.taskStartedAt === null || isIsoTimestamp(value.taskStartedAt)) &&
		isNonNegativeInteger(value.taskSpanSeconds) &&
		isNonNegativeInteger(value.activeDayCount) &&
		isNonNegativeInteger(value.sessionCount) &&
		isNonNegativeInteger(value.totalActiveDurationSeconds) &&
		isNonNegativeInteger(value.totalPausedDurationSeconds) &&
		isNonNegativeInteger(value.endedEarlySessionCount) &&
		isNonNegativeInteger(value.initialSubtaskCount) &&
		isNonNegativeInteger(value.addedDuringExecutionCount) &&
		isNonNegativeInteger(value.completedSubtaskCount) &&
		isNonNegativeInteger(value.cancelledSubtaskCount) &&
		isOptionalText(value.longestStepTitle) &&
		isNonNegativeInteger(value.longestStepActiveDurationSeconds) &&
		isOptionalText(value.lastProgress) &&
		Array.isArray(value.outstandingSubtasks) &&
		value.outstandingSubtasks.every(isNonEmptyString)
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

function isTaskId(value: unknown): value is string {
	return typeof value === 'string' && /^\^tc-[0-9a-f]{6}$/u.test(value);
}

function isIsoTimestamp(value: unknown): value is string {
	return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isNonNegativeInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isOptionalText(value: unknown): value is string | null {
	return value === null || typeof value === 'string';
}

function isReviewStatus(value: unknown): value is ReviewStatus {
	return value === 'pending' || value === 'completed';
}
