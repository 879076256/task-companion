import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { build } from 'esbuild';

async function loadTimerModule(entryPoint) {
	const result = await build({
		entryPoints: [new URL(entryPoint, import.meta.url).pathname],
		bundle: true,
		format: 'esm',
		platform: 'neutral',
		target: 'es2021',
		write: false,
	});
	const code = result.outputFiles[0].text;
	return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const machine = await loadTimerModule('../src/core/timer/state-machine.ts');
const serialization = await loadTimerModule('../src/core/timer/serialization.ts');

test('starts a 25 minute timer using an absolute end timestamp', () => {
	const result = machine.startTimer(machine.createIdleState(), {
		mode: 'focus-25',
		nowMs: 1_000,
		sessionId: 'session-1',
	});

	assert.equal(result.ok, true);
	assert.deepEqual(result.state, {
		status: 'running',
		sessionId: 'session-1',
		mode: 'focus-25',
		durationSeconds: 1_500,
		startedAtMs: 1_000,
		pausedDurationMs: 0,
		subtaskId: null,
		endsAtMs: 1_501_000,
	});
	assert.equal(machine.getRemainingSeconds(result.state, 1_601), 1_500);
});

test('pauses with remainingSeconds and resumes from the current timestamp', () => {
	const started = machine.startTimer(machine.createIdleState(), {
		mode: 'focus-50',
		nowMs: 10_000,
		sessionId: 'session-2',
	}).state;
	const paused = machine.pauseTimer(started, 10_500).state;

	assert.equal(paused.status, 'paused');
	assert.equal(paused.remainingSeconds, 3_000);

	const resumed = machine.resumeTimer(paused, 50_000).state;
	assert.equal(resumed.status, 'running');
	assert.equal(resumed.endsAtMs, 3_050_000);
	assert.equal(resumed.pausedDurationMs, 39_500);
});

test('supports custom duration and distinguishes normal and early completion', () => {
	const custom = machine.startTimer(machine.createIdleState(), {
		mode: 'custom',
		durationSeconds: 90,
		nowMs: 0,
		sessionId: 'custom',
	}).state;
	const normal = machine.reconcileTimer(custom, 90_000);

	assert.equal(normal.status, 'finished');
	assert.equal(normal.completion, 'normal');

	const restarted = machine.startTimer(normal, {
		mode: 'focus-25',
		nowMs: 100_000,
		sessionId: 'early',
	}).state;
	const early = machine.finishTimerEarly(restarted, 110_000).state;
	assert.equal(early.status, 'finished');
	assert.equal(early.completion, 'early');
	assert.equal(machine.resetTimer(early).status, 'idle');
});

test('restores running and paused sessions across reloads', () => {
	const running = machine.startTimer(machine.createIdleState(), {
		mode: 'focus-25',
		nowMs: 1_000,
		sessionId: 'running',
	}).state;
	assert.deepEqual(serialization.restoreTimerState(running, 2_000), running);

	const expired = serialization.restoreTimerState(running, 1_501_000);
	assert.equal(expired.status, 'finished');
	assert.equal(expired.completion, 'normal');

	const paused = machine.pauseTimer(running, 2_000).state;
	assert.deepEqual(serialization.restoreTimerState(paused, 999_999), paused);
	assert.deepEqual(serialization.restoreTimerState({ status: 'running' }, 0), {
		status: 'idle',
	});
});

test('rejects duplicate starts while running or paused', () => {
	const running = machine.startTimer(machine.createIdleState(), {
		mode: 'focus-25',
		nowMs: 0,
		sessionId: 'one',
	}).state;
	const duplicate = machine.startTimer(running, {
		mode: 'focus-50',
		nowMs: 1_000,
		sessionId: 'two',
	});

	assert.equal(duplicate.ok, false);
	assert.equal(duplicate.error, 'active-session');
	assert.strictEqual(duplicate.state, running);

	const paused = machine.pauseTimer(running, 1_000).state;
	assert.equal(
		machine.startTimer(paused, {
			mode: 'focus-50',
			nowMs: 2_000,
			sessionId: 'three',
		}).ok,
		false,
	);
});

test('subtask binding is immutable across pause, resume and completion', () => {
	const running = machine.startTimer(machine.createIdleState(), {
		mode: 'custom',
		durationSeconds: 120,
		nowMs: 1_000,
		sessionId: 'bound',
		subtaskId: 'subtask-bound',
	}).state;
	const paused = machine.pauseTimer(running, 31_000).state;
	const resumed = machine.resumeTimer(paused, 61_000).state;
	const finished = machine.finishTimerEarly(resumed, 91_000).state;
	assert.equal(paused.subtaskId, 'subtask-bound');
	assert.equal(resumed.subtaskId, 'subtask-bound');
	assert.equal(finished.subtaskId, 'subtask-bound');
	assert.equal(
		serialization.restoreTimerState(resumed, 70_000).subtaskId,
		'subtask-bound',
	);
});

test('timer control exposes a validated custom minute input', async () => {
	const source = await readFile(
		new URL('../src/ui/timer-control-modal.ts', import.meta.url),
		'utf8',
	);
	assert.match(source, /自由时长（分钟）/u);
	assert.match(source, /minutes >= 1 && minutes <= 1_440/u);
	assert.match(source, /customDuration \* 60/u);
});
