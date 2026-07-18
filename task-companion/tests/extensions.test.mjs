import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

async function loadModule(entryPoint) {
	const result = await build({
		entryPoints: [new URL(entryPoint, import.meta.url).pathname],
		bundle: true,
		format: 'esm',
		platform: 'neutral',
		target: 'es2022',
		write: false,
	});
	return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
}

const events = await loadModule('../src/core/extensions/events.ts');
const scripts = await loadModule('../src/core/extensions/scripts.ts');
const api = await loadModule('../src/core/extensions/api.ts');
const serviceModule = await loadModule('../src/services/controlled-script-service.ts');

class MemoryScriptStorage {
	constructor(files = {}) { this.files = new Map(Object.entries(files)); }
	async read(path) { return this.files.get(path) ?? null; }
	async write(path, content) { this.files.set(path, content); }
	async append(path, content) { this.files.set(path, (this.files.get(path) ?? '') + content); }
	async list(folder) { return [...this.files.keys()].filter((path) => path.startsWith(folder + '/')); }
}

function script(version, permissions = ['ui:notice']) {
	return JSON.stringify({
		schemaVersion: 1,
		scriptId: 'review-reminder',
		name: '复盘提醒',
		version,
		event: 'task-completed',
		permissions,
		actions: [{ type: 'notice', message: '版本 ' + version }],
	});
}

const completedEvent = {
	name: 'task-completed',
	payload: { taskId: '^tc-aabbcc', subtaskId: null, occurredAt: '2026-07-17T08:00:00.000Z' },
};

test('compatible API minor version exposes the readonly homepage snapshot contract', () => {
	assert.equal(api.TASK_COMPANION_API_VERSION, '1.1.0');
});

test('public event names are stable and one broken listener cannot interrupt another', () => {
	assert.deepEqual(events.EXTENSION_EVENT_NAMES, [
		'task-selected', 'timer-started', 'timer-paused', 'timer-resumed',
		'timer-finished', 'session-saved', 'subtask-created', 'subtask-completed',
		'task-completed', 'review-created', 'review-completed',
	]);
	const bus = new events.ExtensionEventBus();
	let calls = 0;
	bus.on('task-completed', () => { throw new Error('listener failure'); });
	bus.on('task-completed', () => { calls += 1; });
	bus.emit('task-completed', completedEvent.payload);
	assert.equal(calls, 1);
	bus.clear();
	bus.emit('task-completed', completedEvent.payload);
	assert.equal(calls, 1);
});

test('controlled scripts are declarative, validate permissions and start disabled', async () => {
	assert.equal(scripts.normalizeControlledScript({ schemaVersion: 1, scriptId: 'x', name: 'x', version: 1, event: 'task-completed', permissions: ['shell'], actions: [] }), null);
	const storage = new MemoryScriptStorage({
		'TaskCompanion/Scripts/review-reminder.v1.json': script(1),
	});
	const notices = [];
	const service = new serviceModule.ControlledScriptService(storage, {
		notice: (message) => notices.push(message),
		openView: () => {},
	});
	await service.initialize();
	assert.equal(service.list()[0].enabled, false);
	await service.handle(completedEvent);
	assert.deepEqual(notices, []);
	await service.enable('review-reminder');
	await service.handle(completedEvent);
	assert.deepEqual(notices, ['版本 1']);
});

test('a failing version rolls back, logs sanitized metadata and leaves core event flow alive', async () => {
	const storage = new MemoryScriptStorage({
		'TaskCompanion/Scripts/review-reminder.v1.json': script(1),
		'TaskCompanion/Scripts/review-reminder.v2.json': script(2, []),
	});
	const notices = [];
	let ids = 0;
	const service = new serviceModule.ControlledScriptService(
		storage,
		{ notice: (message) => notices.push(message), openView: () => {} },
		() => 'error-' + ++ids,
	);
	await service.initialize();
	await service.enable('review-reminder', 2);
	await service.handle(completedEvent);
	const status = service.list()[0];
	assert.equal(status.script.version, 1);
	assert.equal(status.enabled, true);
	assert.match(status.disabledReason, /已回退到 1/u);
	const log = storage.files.get(serviceModule.SCRIPT_ERROR_PATH);
	assert.match(log, /"failedVersion":2/u);
	assert.match(log, /"restoredVersion":1/u);
	assert.doesNotMatch(log, /aabbcc/u);
	assert.equal(notices.length, 1);

	await service.handle(completedEvent);
	assert.equal(notices.at(-1), '版本 1');
});
