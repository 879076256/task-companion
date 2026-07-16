import type { ReviewStorage } from '../adapters/obsidian/obsidian-review-vault';
import {
	parseReviewLog,
	serializeReviewEvent,
} from '../core/reviews/log-codec';
import {
	foldReviewEvents,
	ReviewEvent,
} from '../core/reviews/model';

export const REVIEW_FOLDER = 'TaskCompanion/Reviews';
export const REVIEW_INDEX_PATH = `${REVIEW_FOLDER}/index.jsonl`;

export class ReviewRepository {
	constructor(private readonly storage: ReviewStorage) {}

	async append(event: ReviewEvent): Promise<void> {
		const current = await this.storage.read(REVIEW_INDEX_PATH);
		if (
			current !== null &&
			parseReviewLog(current).events.some(
				(candidate) => candidate.eventId === event.eventId,
			)
		) {
			return;
		}
		await this.storage.append(REVIEW_INDEX_PATH, serializeReviewEvent(event));
	}

	async list(): Promise<ReviewEvent[]> {
		const content = await this.storage.read(REVIEW_INDEX_PATH);
		return content === null
			? []
			: foldReviewEvents(parseReviewLog(content).events);
	}

	writeMarkdown(path: string, content: string): Promise<void> {
		return this.storage.write(path, content);
	}
}

export function reviewMarkdownPath(event: ReviewEvent): string {
	const date = event.completedAt.slice(0, 10);
	return `${REVIEW_FOLDER}/${event.completedAt.slice(0, 7)}/${date}-${event.reviewId}.md`;
}
