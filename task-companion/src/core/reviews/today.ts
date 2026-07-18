import type { ReviewEvent } from './model';

/** Keeps one latest completion per parent/subtask target for the requested local day. */
export function reviewsCompletedOnLocalDay(
	reviews: readonly ReviewEvent[],
	now: Date,
): ReviewEvent[] {
	const latestByTarget = new Map<string, ReviewEvent>();
	for (const review of reviews) {
		const completedAt = new Date(review.completedAt);
		if (!isSameLocalDay(completedAt, now)) continue;
		const key = `${review.taskId}\u0000${review.subtaskId ?? ''}`;
		const existing = latestByTarget.get(key);
		if (!existing || compareRecency(review, existing) > 0) {
			latestByTarget.set(key, review);
		}
	}
	return [...latestByTarget.values()].sort((left, right) =>
		right.completedAt.localeCompare(left.completedAt),
	);
}

function isSameLocalDay(left: Date, right: Date): boolean {
	return (
		!Number.isNaN(left.getTime()) &&
		left.getFullYear() === right.getFullYear() &&
		left.getMonth() === right.getMonth() &&
		left.getDate() === right.getDate()
	);
}

function compareRecency(left: ReviewEvent, right: ReviewEvent): number {
	return (
		left.completedAt.localeCompare(right.completedAt) ||
		left.occurredAt.localeCompare(right.occurredAt)
	);
}
