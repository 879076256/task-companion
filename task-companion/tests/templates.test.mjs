import assert from 'node:assert/strict';
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
	return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
}

const model = await loadModule('../src/core/templates/model.ts');
const codec = await loadModule('../src/core/templates/log-codec.ts');
const repositoryModule = await loadModule('../src/services/template-repository.ts');
const serviceModule = await loadModule('../src/services/template-service.ts');
const subtaskRepositoryModule = await loadModule('../src/services/subtask-repository.ts');
const subtaskServiceModule = await loadModule('../src/services/subtask-service.ts');

class MemoryStorage {
	constructor() { this.files = new Map(); }
	async read(path) { return this.files.get(path) ?? null; }
	async append(path, content) { this.files.set(path, (this.files.get(path) ?? '') + content); }
	async write(path, content) { this.files.set(path, content); }
}

function review(overrides = {}) {
	return {
		schemaVersion: 2,
		eventId: 'review-event',
		reviewId: 'review-id',
		taskId: '^tc-aabbcc',
		taskTitle: '撰写项目周报',
		targetType: 'task',
		subtaskId: null,
		parentTaskTitle: null,
		sourcePath: 'Tasks.md',
		sourceLineNumber: 1,
		occurredAt: '2026-07-17T08:00:00.000Z',
		completedAt: '2026-07-17T08:00:00.000Z',
		reviewStatus: 'pending',
		stats: {
			taskStartedAt: null,
			taskSpanSeconds: 0,
			activeDayCount: 1,
			sessionCount: 3,
			totalActiveDurationSeconds: 1800,
			totalPausedDurationSeconds: 0,
			endedEarlySessionCount: 0,
			initialSubtaskCount: 2,
			addedDuringExecutionCount: 0,
			completedSubtaskCount: 2,
			cancelledSubtaskCount: 0,
			longestStepTitle: '整理数据',
			longestStepActiveDurationSeconds: 1200,
			lastProgress: null,
			outstandingSubtasks: [],
		},
		reviewText: null,
		wentWell: null,
		reworkOrBlocker: null,
		nextAdjustment: null,
		markdownPath: null,
		...overrides,
	};
}

function subtask(title, order, status = 'completed') {
	return {
		subtaskId: 'subtask-' + order,
		taskId: '^tc-aabbcc',
		title,
		status,
		order,
		origin: 'initial',
		createdAt: '2026-07-17T07:00:00.000Z',
		updatedAt: '2026-07-17T08:00:00.000Z',
		completedAt: status === 'completed' ? '2026-07-17T08:00:00.000Z' : null,
		cancelledAt: status === 'cancelled' ? '2026-07-17T08:00:00.000Z' : null,
	};
}

test('experience templates preserve ordered useful steps and aggregate reviewed history', () => {
	const first = model.createExperienceTemplate(
		'template-1',
		review(),
		{ reviewText: null, wentWell: null, reworkOrBlocker: '等待数据', nextAdjustment: null },
		{ taskId: '^tc-aabbcc', subtasks: [subtask('整理数据', 0), subtask('已取消', 1, 'cancelled'), subtask('撰写结论', 2)], currentNextSubtaskId: null },
		{ name: '周报模板', checklist: ['核对数字'], principles: ['先结论后证据'] },
		1_000,
	);
	assert.deepEqual(first.subtaskTitles, ['整理数据', '撰写结论']);
	assert.deepEqual(first.commonBlockers, ['等待数据']);

	const second = model.updateExperienceTemplate(
		first,
		review({ reviewId: 'review-2', taskTitle: '撰写月度项目周报', stats: { ...review().stats, sessionCount: 5, totalActiveDurationSeconds: 3000 } }),
		{ reviewText: null, wentWell: null, reworkOrBlocker: '口径不一致', nextAdjustment: null },
		{ taskId: '^tc-aabbcc', subtasks: [subtask('整理数据', 0), subtask('复核口径', 1)], currentNextSubtaskId: null },
		{ name: '周报模板', checklist: ['复核口径'], principles: [] },
		2_000,
	);
	assert.equal(second.version, 2);
	assert.equal(second.averageSessionCount, 4);
	assert.equal(second.averageActiveDurationSeconds, 2400);
	assert.deepEqual(second.subtaskTitles, ['整理数据', '撰写结论', '复核口径']);
});

test('template JSONL is append-only, idempotent and tolerant of malformed lines', async () => {
	const storage = new MemoryStorage();
	const repository = new repositoryModule.TemplateRepository(storage);
	const template = model.createExperienceTemplate(
		'template-1', review(),
		{ reviewText: null, wentWell: null, reworkOrBlocker: null, nextAdjustment: null },
		{ taskId: '^tc-aabbcc', subtasks: [], currentNextSubtaskId: null },
		{ name: '周报模板', checklist: [], principles: [] }, 1_000,
	);
	const event = { schemaVersion: 1, eventId: 'event-1', eventType: 'created', occurredAt: '1970-01-01T00:00:01.000Z', template };
	await repository.append(event);
	await repository.append(event);
	storage.files.set(repositoryModule.TEMPLATE_INDEX_PATH, storage.files.get(repositoryModule.TEMPLATE_INDEX_PATH) + 'broken\n');
	assert.equal((await repository.list()).length, 1);
	assert.deepEqual(codec.parseTemplateLog(storage.files.get(repositoryModule.TEMPLATE_INDEX_PATH)).invalidLineNumbers, [2]);
});

test('suggestions rank similar task titles first and template application is atomic and deduplicated', async () => {
	const templateStorage = new MemoryStorage();
	let id = 0;
	const templates = new serviceModule.TemplateService(
		new repositoryModule.TemplateRepository(templateStorage),
		() => 'id-' + ++id,
	);
	await templates.saveNew(
		review(),
		{ reviewText: null, wentWell: null, reworkOrBlocker: null, nextAdjustment: null },
		{ taskId: '^tc-aabbcc', subtasks: [subtask('整理数据', 0), subtask('撰写结论', 1)], currentNextSubtaskId: null },
		{ name: '周报模板', checklist: [], principles: [] }, 1_000,
	);
	await templates.saveNew(
		review({ reviewId: 'other-review', taskTitle: '采购办公用品' }),
		{ reviewText: null, wentWell: null, reworkOrBlocker: null, nextAdjustment: null },
		{ taskId: '^tc-aabbcc', subtasks: [], currentNextSubtaskId: null },
		{ name: '采购模板', checklist: [], principles: [] }, 2_000,
	);
	assert.equal((await templates.suggest('准备本周项目周报'))[0].name, '周报模板');

	const subtaskStorage = new MemoryStorage();
	let subtaskId = 0;
	const subtasks = new subtaskServiceModule.SubtaskService(
		new subtaskRepositoryModule.SubtaskRepository(subtaskStorage),
		() => 'subtask-' + ++subtaskId,
	);
	await subtasks.add('^tc-aabbcc', '整理数据', 'initial', 1_000);
	const created = await subtasks.addMany(
		'^tc-aabbcc', ['整理数据', '撰写结论', '撰写结论'], 'template', 2_000,
	);
	assert.deepEqual(created.map(({ title }) => title), ['撰写结论']);
	const lines = subtaskStorage.files.values().next().value.trim().split('\n').map(JSON.parse);
	assert.equal(lines.length, 2);
	assert.equal(lines[1].subtasks.length, 1);
});

test('template UI explains optional checklist and reusable experience in plain language', async () => {
	const decisionSource = await import('node:fs/promises').then(({ readFile }) =>
		readFile(new URL('../src/ui/template-decision-modal.ts', import.meta.url), 'utf8'),
	);
	const suggestionSource = await import('node:fs/promises').then(({ readFile }) =>
		readFile(new URL('../src/ui/template-suggestion-modal.ts', import.meta.url), 'utf8'),
	);
	assert.match(decisionSource, /完成前检查（可选）/u);
	assert.match(decisionSource, /下次沿用的经验（可选）/u);
	assert.match(decisionSource, /数据与来源一致/u);
	assert.match(decisionSource, /先写结论/u);
	assert.match(suggestionSource, /完成前检查：/u);
	assert.match(suggestionSource, /沿用经验：/u);
});
