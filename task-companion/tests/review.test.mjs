import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { build } from 'esbuild';

async function loadModule(entryPoint) {
	const result = await build({
		entryPoints: [new URL(entryPoint, import.meta.url).pathname],
		bundle: true,
		format: 'esm',
		platform: 'neutral',
		target: 'es2021',
		write: false,
	});
	return import(
		`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
	);
}

const statsModule = await loadModule('../src/core/reviews/stats.ts');
const codecModule = await loadModule('../src/core/reviews/log-codec.ts');
const markdownModule = await loadModule('../src/core/reviews/markdown.ts');
const repositoryModule = await loadModule('../src/services/review-repository.ts');
const reviewServiceModule = await loadModule('../src/services/review-service.ts');
const completionModule = await loadModule('../src/services/task-completion-service.ts');

class MemoryReviewStorage {
	constructor() {
		this.files = new Map();
		this.failAppend = false;
		this.failWrite = false;
	}

	async read(path) {
		return this.files.get(path) ?? null;
	}

	async append(path, content) {
		if (this.failAppend) throw new Error('append failed');
		this.files.set(path, `${this.files.get(path) ?? ''}${content}`);
	}

	async write(path, content) {
		if (this.failWrite) throw new Error('write failed');
		this.files.set(path, content);
	}
}

function session(overrides = {}) {
	return {
		schemaVersion: 2,
		sessionId: 'session-1',
		taskId: '^tc-aabbcc',
		subtaskId: null,
		startedAt: '2026-07-14T08:00:00.000Z',
		endedAt: '2026-07-14T08:25:00.000Z',
		activeDurationSeconds: 1_500,
		pausedDurationSeconds: 60,
		mode: 'focus-25',
		status: 'completed',
		endedEarly: false,
		completedWork: '完成第一步',
		nextAction: null,
		blockerReason: null,
		...overrides,
	};
}

function subtask(overrides = {}) {
	return {
		subtaskId: 'subtask-1',
		taskId: '^tc-aabbcc',
		title: '第一步',
		status: 'completed',
		order: 0,
		origin: 'initial',
		createdAt: '2026-07-13T08:00:00.000Z',
		updatedAt: '2026-07-14T08:00:00.000Z',
		completedAt: '2026-07-14T08:00:00.000Z',
		cancelledAt: null,
		...overrides,
	};
}

function plan(subtasks = []) {
	return { taskId: '^tc-aabbcc', subtasks, currentNextSubtaskId: null };
}

function reviewEvent(overrides = {}) {
	return {
		schemaVersion: 1,
		eventId: 'event-pending',
		reviewId: 'review-1',
		taskId: '^tc-aabbcc',
		taskTitle: '测试任务',
		sourcePath: 'Tasks.md',
		sourceLineNumber: 1,
		occurredAt: '2026-07-16T08:00:00.000Z',
		completedAt: '2026-07-16T08:00:00.000Z',
		reviewStatus: 'pending',
		stats: statsModule.buildReviewStats([], plan([]), '2026-07-16T08:00:00.000Z'),
		reviewText: null,
		wentWell: null,
		reworkOrBlocker: null,
		nextAdjustment: null,
		markdownPath: null,
		...overrides,
	};
}

function selectedTask() {
	return {
		task: {
			id: '^tc-aabbcc',
			text: '测试任务 ⏫ ^tc-aabbcc',
			raw: '- [ ] 测试任务 ⏫ ^tc-aabbcc',
			sourcePath: 'Tasks.md',
			lineNumber: 1,
			checked: false,
			cancelled: false,
			priority: '⏫',
			hasRecurrence: false,
			start: null,
			scheduled: null,
			due: null,
			blockId: '^tc-aabbcc',
		},
		category: 'important',
	};
}

test('review statistics cover span, active days, pauses, subtasks, longest step and last progress', () => {
	const subtasks = [
		subtask(),
		subtask({
			subtaskId: 'subtask-2',
			title: '第二步',
			status: 'active',
			origin: 'during-execution',
			order: 1,
			completedAt: null,
		}),
		subtask({
			subtaskId: 'subtask-3',
			title: '取消步骤',
			status: 'cancelled',
			order: 2,
			completedAt: null,
			cancelledAt: '2026-07-15T08:00:00.000Z',
		}),
	];
	const sessions = [
		session({ subtaskId: 'subtask-1' }),
		session({
			sessionId: 'session-2',
			subtaskId: 'subtask-2',
			startedAt: '2026-07-15T08:00:00.000Z',
			endedAt: '2026-07-15T08:30:00.000Z',
			activeDurationSeconds: 1_800,
			pausedDurationSeconds: 120,
			endedEarly: true,
			status: 'ended-early',
			completedWork: '推进第二步',
		}),
	];
	const stats = statsModule.buildReviewStats(
		sessions,
		plan(subtasks),
		'2026-07-16T08:00:00.000Z',
	);
	assert.equal(stats.taskSpanSeconds, 3 * 86_400);
	assert.equal(stats.activeDayCount, 2);
	assert.equal(stats.sessionCount, 2);
	assert.equal(stats.totalActiveDurationSeconds, 3_300);
	assert.equal(stats.totalPausedDurationSeconds, 180);
	assert.equal(stats.endedEarlySessionCount, 1);
	assert.equal(stats.initialSubtaskCount, 2);
	assert.equal(stats.addedDuringExecutionCount, 1);
	assert.equal(stats.completedSubtaskCount, 1);
	assert.equal(stats.cancelledSubtaskCount, 1);
	assert.equal(stats.longestStepTitle, '第二步');
	assert.equal(stats.lastProgress, '推进第二步');
	assert.deepEqual(stats.outstandingSubtasks, ['第二步']);
});

test('only a task with sessions or subtask history has an execution archive', () => {
	assert.equal(statsModule.hasExecutionArchive([], plan([])), false);
	assert.equal(statsModule.hasExecutionArchive([session()], plan([])), true);
	assert.equal(statsModule.hasExecutionArchive([], plan([subtask()])), true);
});

test('review Markdown failure keeps a retryable queue and completed status is appended only after success', async () => {
	const storage = new MemoryReviewStorage();
	const repository = new repositoryModule.ReviewRepository(storage);
	let persisted = { events: [], markdown: [] };
	let id = 0;
	const service = new reviewServiceModule.ReviewService(
		repository,
		async (events, markdown) => {
			persisted = structuredClone({ events, markdown });
		},
		() => `generated-${++id}`,
	);
	const pending = reviewEvent();
	await service.prepareEvent(pending);
	await service.commitPrepared(pending.eventId);
	storage.failWrite = true;
	await assert.rejects(
		service.saveReview(
			pending,
			{
				reviewText: '关键经验',
				wentWell: '分解清楚',
				reworkOrBlocker: null,
				nextAdjustment: '提前验证',
			},
			Date.parse('2026-07-16T09:00:00.000Z'),
		),
	);
	assert.equal(persisted.markdown.length, 1);
	assert.equal((await service.list())[0].reviewStatus, 'pending');

	storage.failWrite = false;
	assert.deepEqual(await service.retryAll(), { events: 0, markdown: 1 });
	assert.equal(persisted.markdown.length, 0);
	const completed = (await service.list())[0];
	assert.equal(completed.reviewStatus, 'completed');
	assert.match(storage.files.get(completed.markdownPath), /# 任务复盘：测试任务/u);
	assert.match(storage.files.get(completed.markdownPath), /关键经验/u);
});

test('a failed pre-completion queue save leaves no stale in-memory review', async () => {
	const storage = new MemoryReviewStorage();
	const repository = new repositoryModule.ReviewRepository(storage);
	const service = new reviewServiceModule.ReviewService(
		repository,
		async () => {
			throw new Error('data.json unavailable');
		},
	);
	await assert.rejects(service.prepareEvent(reviewEvent()));
	assert.deepEqual(service.getPendingEvents(), []);
	assert.deepEqual(await service.list(), []);
});

test('simple completion skips review, while archive completion remains complete when review index append fails', async () => {
	const scanner = { completed: false, async complete() { this.completed = true; } };
	const sessionsService = { current: [], async history() { return this.current; } };
	const subtasksService = {
		current: plan([]),
		async load() { return this.current; },
		async cancel() {},
	};
	const reviews = {
		prepared: [],
		async prepareEvent(event) { this.prepared.push(event); },
		async commitPrepared() {},
		async discardPrepared() {},
	};
	let id = 0;
	const service = new completionModule.TaskCompletionService(
		scanner,
		sessionsService,
		subtasksService,
		reviews,
		() => `generated-${++id}`,
	);
	const simple = await service.complete(selectedTask(), null, Date.parse('2026-07-16T08:00:00.000Z'));
	assert.deepEqual(simple, { reviewQueued: false, reviewIndexWritePending: false });
	assert.equal(reviews.prepared.length, 0);

	scanner.completed = false;
	sessionsService.current = [session()];
	reviews.commitPrepared = async () => { throw new Error('index failed'); };
	const archived = await service.complete(selectedTask(), null, Date.parse('2026-07-16T09:00:00.000Z'));
	assert.equal(scanner.completed, true);
	assert.equal(archived.reviewQueued, true);
	assert.equal(archived.reviewIndexWritePending, true);
	assert.equal(reviews.prepared.length, 1);
});

test('unfinished subtasks require an explicit resolution and cancel-all is reflected in review stats', async () => {
	const active = subtask({ status: 'active', completedAt: null });
	const scanner = { async complete() {} };
	const sessionsService = { async history() { return [session()]; } };
	const subtasksService = {
		current: plan([active]),
		async load() { return this.current; },
		async cancel(_taskId, subtaskId, nowMs) {
			this.current = plan([
				{ ...active, subtaskId, status: 'cancelled', cancelledAt: new Date(nowMs).toISOString() },
			]);
		},
	};
	const reviews = {
		prepared: [],
		async prepareEvent(event) { this.prepared.push(event); },
		async commitPrepared() {},
		async discardPrepared() {},
	};
	const service = new completionModule.TaskCompletionService(
		scanner,
		sessionsService,
		subtasksService,
		reviews,
		() => crypto.randomUUID(),
	);
	await assert.rejects(service.complete(selectedTask(), null, 1_000));
	await service.complete(selectedTask(), 'cancel', 2_000);
	assert.equal(reviews.prepared[0].stats.cancelledSubtaskCount, 1);
	assert.deepEqual(reviews.prepared[0].stats.outstandingSubtasks, []);
});

test('the viewable JSONL review fixture parses without invalid lines', async () => {
	const content = await readFile(
		new URL('./fixtures/review-v1.jsonl', import.meta.url),
		'utf8',
	);
	const result = codecModule.parseReviewLog(content);
	assert.deepEqual(result.invalidLineNumbers, []);
	assert.equal(result.events[0].reviewStatus, 'pending');
	assert.equal(result.events[0].stats.sessionCount, 2);
});

test('the checked-in readable review sample exactly matches the Markdown renderer', async () => {
	const [logContent, expected] = await Promise.all([
		readFile(new URL('./fixtures/review-v1.jsonl', import.meta.url), 'utf8'),
		readFile(new URL('./fixtures/review-sample.md', import.meta.url), 'utf8'),
	]);
	const pending = codecModule.parseReviewLog(logContent).events[0];
	const completed = {
		...pending,
		eventId: 'review-event-completed',
		reviewStatus: 'completed',
		reviewText: '完成分流与待写恢复策略清晰，人工操作路径可以继续精简。',
		wentWell: '先保留待复盘意图，再完成原任务。',
		reworkOrBlocker: '没有阻塞。',
		nextAdjustment: '在下一阶段统一入口文案。',
		markdownPath: 'TaskCompanion/Reviews/2026-07/2026-07-16-review-fixture.md',
	};
	assert.equal(markdownModule.buildReviewMarkdown(completed), expected);
});
