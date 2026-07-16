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
	return import(
		`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
	);
}

const sessionModel = await loadModule('../src/core/sessions/model.ts');
const codec = await loadModule('../src/core/sessions/log-codec.ts');
const repositoryModule = await loadModule('../src/services/session-repository.ts');
const serviceModule = await loadModule('../src/services/session-service.ts');

function makeSession(overrides = {}) {
	return {
		schemaVersion: 1,
		sessionId: 'session-1',
		taskId: '^tc-aabbcc',
		startedAt: '2026-07-16T00:00:00.000Z',
		endedAt: '2026-07-16T00:25:00.000Z',
		activeDurationSeconds: 1_500,
		pausedDurationSeconds: 0,
		mode: 'focus-25',
		status: 'completed',
		endedEarly: false,
		completedWork: null,
		nextAction: null,
		blockerReason: null,
		...overrides,
	};
}

class MemoryStorage {
	constructor() {
		this.files = new Map();
		this.failAppend = false;
	}

	async read(path) {
		return this.files.get(path) ?? null;
	}

	async append(path, content) {
		if (this.failAppend) throw new Error('append failed');
		this.files.set(path, `${this.files.get(path) ?? ''}${content}`);
	}

	async list(folder) {
		return [...this.files.keys()].filter((path) => path.startsWith(`${folder}/`));
	}
}

test('timer and quick progress create complete, unique ExecutionSession records', () => {
	const timed = sessionModel.executionSessionFromTimer(
		{
			status: 'finished',
			sessionId: 'timer-unique',
			mode: 'focus-50',
			durationSeconds: 3_000,
			startedAtMs: 1_000,
			endedAtMs: 3_021_000,
			pausedDurationMs: 20_000,
			completion: 'normal',
		},
		'^tc-aabbcc',
	);
	const quick = sessionModel.createQuickExecutionSession(
		'^tc-aabbcc',
		4_000,
		'quick-unique',
	);

	assert.equal(timed.activeDurationSeconds, 3_000);
	assert.equal(timed.pausedDurationSeconds, 20);
	assert.equal(timed.mode, 'focus-50');
	assert.equal(quick.mode, 'quick');
	assert.equal(quick.activeDurationSeconds, 0);
	assert.notEqual(timed.sessionId, quick.sessionId);
});

test('early completion excludes accumulated paused time', () => {
	const session = sessionModel.executionSessionFromTimer(
		{
			status: 'finished',
			sessionId: 'early',
			mode: 'custom',
			durationSeconds: 900,
			startedAtMs: 10_000,
			endedAtMs: 100_000,
			pausedDurationMs: 30_000,
			completion: 'early',
		},
		'^tc-aabbcc',
	);
	assert.equal(session.activeDurationSeconds, 60);
	assert.equal(session.pausedDurationSeconds, 30);
	assert.equal(session.endedEarly, true);
	assert.equal(session.status, 'ended-early');
});

test('JSONL reader isolates invalid lines and migrates schema version 0', () => {
	const legacy = {
		...makeSession(),
		schemaVersion: 0,
		startedAt: undefined,
		endedAt: undefined,
		startedAtMs: 0,
		endedAtMs: 1_000,
		status: 'early',
		endedEarly: undefined,
	};
	const result = codec.parseSessionLog(
		`${JSON.stringify(legacy)}\nnot-json\n${JSON.stringify(makeSession({ sessionId: 'valid' }))}\n`,
	);
	assert.equal(result.sessions.length, 2);
	assert.equal(result.sessions[0].schemaVersion, 1);
	assert.equal(result.sessions[0].endedEarly, true);
	assert.deepEqual(result.invalidLineNumbers, [2]);
});

test('write failure retains the full pending session and retry is idempotent', async () => {
	const storage = new MemoryStorage();
	storage.failAppend = true;
	const repository = new repositoryModule.SessionRepository(storage);
	let persisted = [];
	const service = new serviceModule.SessionService(repository, async (pending) => {
		persisted = structuredClone(pending);
	});
	const session = makeSession();
	await service.prepare(session);
	await assert.rejects(
		service.finalize(session.sessionId, {
			completedWork: '完成测试',
			nextAction: '继续验收',
			blockerReason: null,
		}),
	);
	assert.equal(persisted.length, 1);
	assert.equal(persisted[0].nextAction, '继续验收');

	storage.failAppend = false;
	assert.equal(await service.retryAll(), 1);
	assert.equal(persisted.length, 0);
	await repository.append({ ...session, completedWork: 'ignored duplicate' });
	const lines = [...storage.files.values()][0].trim().split('\n');
	assert.equal(lines.length, 1);
});

test('history and current next action stay isolated by stable task ID', async () => {
	const storage = new MemoryStorage();
	const repository = new repositoryModule.SessionRepository(storage);
	await repository.append(
		makeSession({ sessionId: 'a', taskId: '^tc-aaaaaa', nextAction: 'A next' }),
	);
	await repository.append(
		makeSession({ sessionId: 'b', taskId: '^tc-bbbbbb', nextAction: 'B next' }),
	);

	assert.deepEqual(
		(await repository.readByTask('^tc-aaaaaa')).map(({ sessionId }) => sessionId),
		['a'],
	);
	assert.equal(await repository.getCurrentNextAction('^tc-aaaaaa'), 'A next');
	assert.equal(await repository.getCurrentNextAction('^tc-bbbbbb'), 'B next');
});
