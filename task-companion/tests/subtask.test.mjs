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

const repositoryModule = await loadModule('../src/services/subtask-repository.ts');
const serviceModule = await loadModule('../src/services/subtask-service.ts');
const logModule = await loadModule('../src/core/subtasks/log-codec.ts');
const modelModule = await loadModule('../src/core/subtasks/model.ts');

class MemoryStorage {
	constructor() {
		this.files = new Map();
	}

	async read(path) {
		return this.files.get(path) ?? null;
	}

	async append(path, content) {
		this.files.set(path, `${this.files.get(path) ?? ''}${content}`);
	}
}

function createHarness() {
	const storage = new MemoryStorage();
	const repository = new repositoryModule.SubtaskRepository(storage);
	let sequence = 0;
	const service = new serviceModule.SubtaskService(
		repository,
		() => `generated-${++sequence}`,
	);
	return { storage, service };
}

function session(overrides = {}) {
	return {
		schemaVersion: 2,
		sessionId: 'session',
		taskId: '^tc-aaaaaa',
		subtaskId: null,
		startedAt: '2026-07-16T00:00:00.000Z',
		endedAt: '2026-07-16T00:01:00.000Z',
		activeDurationSeconds: 60,
		pausedDurationSeconds: 0,
		mode: 'custom',
		status: 'completed',
		endedEarly: false,
		completedWork: null,
		nextAction: null,
		blockerReason: null,
		...overrides,
	};
}

test('subtasks remain isolated by stable parent task ID and preserve origin', async () => {
	const { service, storage } = createHarness();
	await service.add('^tc-aaaaaa', 'A first', 'initial', 1_000);
	await service.add('^tc-bbbbbb', 'B during', 'during-execution', 2_000);

	const planA = await service.load('^tc-aaaaaa');
	const planB = await service.load('^tc-bbbbbb');
	assert.deepEqual(planA.subtasks.map(({ title }) => title), ['A first']);
	assert.deepEqual(planB.subtasks.map(({ title }) => title), ['B during']);
	assert.equal(planA.subtasks[0].origin, 'initial');
	assert.equal(planB.subtasks[0].origin, 'during-execution');
	assert.deepEqual([...storage.files.keys()].sort(), [
		'TaskCompanion/Subtasks/tc-aaaaaa.jsonl',
		'TaskCompanion/Subtasks/tc-bbbbbb.jsonl',
	]);
});

test('rename and atomic reorder fold into a stable single-level list', async () => {
	const { service } = createHarness();
	const first = await service.add('^tc-aaaaaa', 'First', 'initial', 1_000);
	const second = await service.add('^tc-aaaaaa', 'Second', 'initial', 2_000);
	await service.rename('^tc-aaaaaa', first.subtaskId, 'Renamed first', 3_000);
	await service.move('^tc-aaaaaa', second.subtaskId, -1, 4_000);

	const plan = await service.load('^tc-aaaaaa');
	assert.deepEqual(plan.subtasks.map(({ title }) => title), [
		'Second',
		'Renamed first',
	]);
	assert.deepEqual(plan.subtasks.map(({ order }) => order), [0, 1]);
});

test('complete, cancel, current-next and reopen keep distinct history states', async () => {
	const { service, storage } = createHarness();
	const completed = await service.add('^tc-aaaaaa', 'Complete me', 'initial', 1_000);
	const cancelled = await service.add('^tc-aaaaaa', 'Cancel me', 'initial', 2_000);
	await service.setCurrentNext('^tc-aaaaaa', completed.subtaskId, 3_000);
	await service.complete('^tc-aaaaaa', completed.subtaskId, 4_000);
	await service.cancel('^tc-aaaaaa', cancelled.subtaskId, 5_000);

	let plan = await service.load('^tc-aaaaaa');
	assert.equal(plan.currentNextSubtaskId, null);
	assert.equal(
		plan.subtasks.find(({ subtaskId }) => subtaskId === completed.subtaskId).status,
		'completed',
	);
	assert.equal(
		plan.subtasks.find(({ subtaskId }) => subtaskId === cancelled.subtaskId).status,
		'cancelled',
	);

	await service.reopen('^tc-aaaaaa', completed.subtaskId, 6_000);
	plan = await service.load('^tc-aaaaaa');
	assert.equal(
		plan.subtasks.find(({ subtaskId }) => subtaskId === completed.subtaskId).status,
		'active',
	);
	const eventTypes = [...storage.files.values()][0]
		.trim()
		.split('\n')
		.map((line) => JSON.parse(line).eventType);
	assert.deepEqual(eventTypes, [
		'created',
		'created',
		'current-next-set',
		'completed',
		'cancelled',
		'reopened',
	]);
});

test('progress separates parent direct time and each subtask time without fake percentage', async () => {
	const { service } = createHarness();
	const first = await service.add('^tc-aaaaaa', 'First', 'initial', 1_000);
	const second = await service.add('^tc-aaaaaa', 'Second', 'initial', 2_000);
	await service.complete('^tc-aaaaaa', first.subtaskId, 3_000);
	await service.cancel('^tc-aaaaaa', second.subtaskId, 4_000);
	const progress = await service.progress('^tc-aaaaaa', [
		session({ sessionId: 'parent', activeDurationSeconds: 120 }),
		session({ sessionId: 'first-1', subtaskId: first.subtaskId, activeDurationSeconds: 60 }),
		session({ sessionId: 'first-2', subtaskId: first.subtaskId, activeDurationSeconds: 30 }),
		session({ sessionId: 'other-task', taskId: '^tc-bbbbbb', activeDurationSeconds: 999 }),
	]);

	assert.equal(progress.completedSubtasks, 1);
	assert.equal(progress.totalSubtasks, 1);
	assert.equal(progress.totalSessionCount, 3);
	assert.equal(progress.totalActiveDurationSeconds, 210);
	assert.equal(progress.parentDirectDurationSeconds, 120);
	assert.equal(
		progress.subtasks.find(({ subtaskId }) => subtaskId === first.subtaskId)
			.activeDurationSeconds,
		90,
	);

	const emptyProgress = await service.progress('^tc-bbbbbb', []);
	assert.equal(emptyProgress.totalSubtasks, 0);
	assert.equal(emptyProgress.completedSubtasks, 0);
});

test('viewable JSONL task dossier fixture folds into current state', async () => {
	const content = await readFile(
		new URL('./fixtures/subtasks-v1.jsonl', import.meta.url),
		'utf8',
	);
	const parsed = logModule.parseSubtaskLog(content);
	assert.deepEqual(parsed.invalidLineNumbers, []);
	assert.equal(parsed.events.length, 2);
	const plan = modelModule.foldSubtaskEvents('^tc-2426d8', parsed.events);
	assert.equal(plan.subtasks.length, 1);
	assert.equal(plan.subtasks[0].title, '准备人工验收清单');
	assert.equal(plan.currentNextSubtaskId, plan.subtasks[0].subtaskId);
});
