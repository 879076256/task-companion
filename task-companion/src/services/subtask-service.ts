import type { ExecutionSession } from '../core/sessions/model';
import { buildTaskProgress, TaskProgressSummary } from '../core/subtasks/progress';
import {
	isTaskId,
	normalizeSubtaskTitle,
	SUBTASK_SCHEMA_VERSION,
	Subtask,
	SubtaskEvent,
	SubtaskEventType,
	SubtaskOrigin,
	SubtaskPlan,
} from '../core/subtasks/model';
import { SubtaskRepository } from './subtask-repository';

export type IdFactory = () => string;

export class SubtaskService {
	constructor(
		private readonly repository: SubtaskRepository,
		private readonly idFactory: IdFactory = () => crypto.randomUUID(),
	) {}

	load(taskId: string): Promise<SubtaskPlan> {
		assertTaskId(taskId);
		return this.repository.readPlan(taskId);
	}

	async add(
		taskId: string,
		title: string,
		origin: SubtaskOrigin,
		nowMs: number,
	): Promise<Subtask> {
		assertTaskId(taskId);
		const normalizedTitle = requireTitle(title);
		const plan = await this.load(taskId);
		const timestamp = toIso(nowMs);
		const subtask: Subtask = {
			subtaskId: this.idFactory(),
			taskId,
			title: normalizedTitle,
			status: 'active',
			order: nextOrder(plan),
			origin,
			createdAt: timestamp,
			updatedAt: timestamp,
			completedAt: null,
			cancelledAt: null,
		};
		await this.append('created', taskId, nowMs, [subtask]);
		return subtask;
	}

	async rename(
		taskId: string,
		subtaskId: string,
		title: string,
		nowMs: number,
	): Promise<void> {
		const subtask = await this.requireSubtask(taskId, subtaskId);
		await this.append('renamed', taskId, nowMs, [
			{ ...subtask, title: requireTitle(title), updatedAt: toIso(nowMs) },
		]);
	}

	async move(
		taskId: string,
		subtaskId: string,
		direction: -1 | 1,
		nowMs: number,
	): Promise<void> {
		const plan = await this.load(taskId);
		const index = plan.subtasks.findIndex((item) => item.subtaskId === subtaskId);
		const otherIndex = index + direction;
		if (index < 0) throw new Error('Subtask not found.');
		if (otherIndex < 0 || otherIndex >= plan.subtasks.length) return;
		const current = plan.subtasks[index];
		const other = plan.subtasks[otherIndex];
		if (!current || !other) return;
		const updatedAt = toIso(nowMs);
		await this.append('reordered', taskId, nowMs, [
			{ ...current, order: other.order, updatedAt },
			{ ...other, order: current.order, updatedAt },
		]);
	}

	complete(taskId: string, subtaskId: string, nowMs: number): Promise<void> {
		return this.transition(taskId, subtaskId, 'completed', nowMs);
	}

	cancel(taskId: string, subtaskId: string, nowMs: number): Promise<void> {
		return this.transition(taskId, subtaskId, 'cancelled', nowMs);
	}

	reopen(taskId: string, subtaskId: string, nowMs: number): Promise<void> {
		return this.transition(taskId, subtaskId, 'active', nowMs);
	}

	async setCurrentNext(
		taskId: string,
		subtaskId: string | null,
		nowMs: number,
	): Promise<void> {
		if (subtaskId !== null) {
			const subtask = await this.requireSubtask(taskId, subtaskId);
			if (subtask.status !== 'active') {
				throw new Error('Only an active subtask can be the current next step.');
			}
		}
		await this.append('current-next-set', taskId, nowMs, [], subtaskId);
	}

	async progress(
		taskId: string,
		sessions: ExecutionSession[],
	): Promise<TaskProgressSummary> {
		return buildTaskProgress(await this.load(taskId), sessions);
	}

	private async transition(
		taskId: string,
		subtaskId: string,
		status: Subtask['status'],
		nowMs: number,
	): Promise<void> {
		const plan = await this.load(taskId);
		const subtask = plan.subtasks.find((item) => item.subtaskId === subtaskId);
		if (!subtask) throw new Error('Subtask not found.');
		if (subtask.status === status) return;
		if (status !== 'active' && subtask.status !== 'active') {
			throw new Error('Only an active subtask can be completed or cancelled.');
		}
		const timestamp = toIso(nowMs);
		const eventType: SubtaskEventType =
			status === 'active' ? 'reopened' : status;
		await this.append(
			eventType,
			taskId,
			nowMs,
			[
				{
					...subtask,
					status,
					updatedAt: timestamp,
					completedAt: status === 'completed' ? timestamp : null,
					cancelledAt: status === 'cancelled' ? timestamp : null,
				},
			],
			plan.currentNextSubtaskId === subtaskId && status !== 'active'
				? null
				: undefined,
		);
	}

	private async requireSubtask(taskId: string, subtaskId: string): Promise<Subtask> {
		const subtask = (await this.load(taskId)).subtasks.find(
			(item) => item.subtaskId === subtaskId,
		);
		if (!subtask) throw new Error('Subtask not found.');
		return subtask;
	}

	private append(
		eventType: SubtaskEventType,
		taskId: string,
		nowMs: number,
		subtasks: Subtask[],
		currentNextSubtaskId?: string | null,
	): Promise<void> {
		const event: SubtaskEvent = {
			schemaVersion: SUBTASK_SCHEMA_VERSION,
			eventId: this.idFactory(),
			eventType,
			taskId,
			occurredAt: toIso(nowMs),
			subtasks,
		};
		if (currentNextSubtaskId !== undefined) {
			event.currentNextSubtaskId = currentNextSubtaskId;
		}
		return this.repository.append(event);
	}
}

function nextOrder(plan: SubtaskPlan): number {
	return plan.subtasks.reduce((maximum, subtask) => Math.max(maximum, subtask.order), -1) + 1;
}

function requireTitle(title: string): string {
	const normalized = normalizeSubtaskTitle(title);
	if (!normalized) throw new Error('Subtask title must contain 1–200 characters.');
	return normalized;
}

function assertTaskId(taskId: string): void {
	if (!isTaskId(taskId)) throw new Error('Invalid Task Companion task ID.');
}

function toIso(nowMs: number): string {
	if (!Number.isFinite(nowMs) || nowMs < 0) throw new Error('Invalid timestamp.');
	return new Date(nowMs).toISOString();
}
