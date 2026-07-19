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
const timerServiceModule = await loadTimerModule('../src/services/timer-service.ts');
const pomodoro = await loadTimerModule('../src/core/timer/pomodoro-cycle.ts');

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

test('pomodoro cycle uses a long break after every third completed 25 minute focus', () => {
	for (const [completedPomodoros, expectedSeconds] of [
		[0, 300],
		[1, 300],
		[2, 900],
		[3, 300],
		[4, 300],
		[5, 900],
	]) {
		const decision = pomodoro.resolvePomodoroCompletion({
			status: 'finished',
			sessionId: `focus-${completedPomodoros}`,
			mode: 'focus-25',
			durationSeconds: 1_500,
			startedAtMs: 0,
			pausedDurationMs: 0,
			subtaskId: null,
			endedAtMs: 1_500_000,
			completion: 'normal',
		}, completedPomodoros);
		assert.equal(decision.completedPomodoros, completedPomodoros + 1);
		assert.equal(decision.completedStage, 'focus');
		assert.deepEqual(decision.next, {
			mode: 'custom',
			durationSeconds: expectedSeconds,
			purpose: 'break',
		});
	}
});

test('a completed break returns to 25 minute focus while early or other timers do not chain', () => {
	const breakDecision = pomodoro.resolvePomodoroCompletion({
		status: 'finished',
		sessionId: 'break',
		mode: 'custom',
		durationSeconds: 300,
		startedAtMs: 0,
		pausedDurationMs: 0,
		subtaskId: null,
		endedAtMs: 300_000,
		completion: 'normal',
		purpose: 'break',
	}, 2);
	assert.deepEqual(breakDecision, {
		completedPomodoros: 2,
		completedStage: 'break',
		next: { mode: 'focus-25', purpose: 'focus' },
	});
	assert.equal(pomodoro.resolvePomodoroCompletion({
		status: 'finished',
		sessionId: 'early',
		mode: 'focus-25',
		durationSeconds: 1_500,
		startedAtMs: 0,
		pausedDurationMs: 0,
		subtaskId: null,
		endedAtMs: 1_000,
		completion: 'early',
	}, 2), null);
	assert.equal(pomodoro.resolvePomodoroCompletion({
		status: 'finished',
		sessionId: 'fifty',
		mode: 'focus-50',
		durationSeconds: 3_000,
		startedAtMs: 0,
		pausedDurationMs: 0,
		subtaskId: null,
		endedAtMs: 3_000_000,
		completion: 'normal',
	}, 2), null);
});

test('prepared pomodoro stages wait for an explicit start and survive reloads', () => {
	const prepared = machine.prepareTimer(machine.createIdleState(), {
		mode: 'custom',
		durationSeconds: 300,
		sessionId: 'prepared-break',
		subtaskId: 'subtask-a',
		purpose: 'break',
	});
	assert.equal(prepared.ok, true);
	assert.deepEqual(prepared.state, {
		status: 'ready',
		sessionId: 'prepared-break',
		mode: 'custom',
		durationSeconds: 300,
		subtaskId: 'subtask-a',
		purpose: 'break',
	});
	assert.equal(machine.getRemainingSeconds(prepared.state, 999_999), 300);
	assert.deepEqual(
		serialization.restoreTimerState(prepared.state, 999_999),
		prepared.state,
	);

	const started = machine.startTimer(prepared.state, {
		mode: 'focus-25',
		nowMs: 999_999,
		sessionId: 'ignored',
	});
	assert.equal(started.ok, true);
	assert.equal(started.state.status, 'running');
	assert.equal(started.state.sessionId, 'prepared-break');
	assert.equal(started.state.mode, 'custom');
	assert.equal(started.state.durationSeconds, 300);
	assert.equal(started.state.purpose, 'break');
	assert.equal(started.state.startedAtMs, 999_999);
});

test('break timers emit stage completion but never task execution sessions', () => {
	const service = new timerServiceModule.TimerService({ capture() {} });
	const sessions = [];
	const completions = [];
	service.bindTask('^tc-aabbcc');
	service.onSessionCompleted((session) => sessions.push(session));
	service.onTimerCompleted((state) => completions.push(state));
	service.state = machine.startTimer(machine.createIdleState(), {
		mode: 'custom',
		durationSeconds: 300,
		nowMs: 0,
		sessionId: 'rest',
		purpose: 'break',
	}).state;
	service.state = machine.reconcileTimer(service.state, 300_000);
	service.emitCompleted(service.state);

	assert.equal(completions.length, 1);
	assert.equal(completions[0].purpose, 'break');
	assert.deepEqual(sessions, []);
});

test('timer service prepares the next stage without starting its countdown', () => {
	const service = new timerServiceModule.TimerService({ capture() {} });
	const prepared = service.prepare('custom', 300, 'break');
	assert.equal(prepared.ok, true);
	assert.equal(service.getState().status, 'ready');
	assert.equal(service.getRemainingSeconds(100_000), 300);
	assert.equal(service.serialize().status, 'ready');
	service.dispose();
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

	const resting = machine.startTimer(machine.createIdleState(), {
		mode: 'custom',
		durationSeconds: 300,
		nowMs: 10_000,
		sessionId: 'resting',
		purpose: 'break',
	}).state;
	assert.deepEqual(serialization.restoreTimerState(resting, 20_000), resting);
	assert.equal(serialization.restoreTimerState({
		...running,
		purpose: 'unknown',
	}, 2_000).purpose, undefined);
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

test('completion alert prepares the next manual-start stage and wires modal, chime and background notification', async () => {
	const [main, notifier] = await Promise.all([
		readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
		readFile(new URL('../src/ui/timer-completion-notifier.ts', import.meta.url), 'utf8'),
	]);
	assert.match(main, /onTimerCompleted/u);
	assert.match(main, /resolvePomodoroCompletion/u);
	assert.match(main, /timerService\.prepare/u);
	assert.match(main, /decision\.next\.purpose/u);
	assert.match(main, /专注完成/u);
	assert.match(main, /休息结束/u);
	assert.match(main, /点击时间开始下一轮 25 分钟专注/u);
	assert.match(notifier, /new AudioContext\(\)/u);
	assert.match(notifier, /createOscillator/u);
	assert.match(notifier, /window\.Notification/u);
	assert.match(notifier, /document\.hasFocus\(\)/u);
	assert.match(notifier, /知道了/u);
});

test('current task cumulative investment always uses total minutes', async () => {
	const embedded = await readFile(
		new URL('../src/ui/embedded-code-block.ts', import.meta.url),
		'utf8',
	);
	assert.match(
		embedded,
		/return `\$\{Math\.floor\(Math\.max\(0, seconds\) \/ 60\)\}分钟`;/u,
	);
	assert.doesNotMatch(embedded, /return hours > 0/u);
});

test('timer service notifies homepage listeners when task identity or target changes', () => {
	const service = new timerServiceModule.TimerService({ capture() {} });
	const snapshots = [];
	const unsubscribe = service.subscribe((state) => {
		snapshots.push({
			status: state.status,
			taskId: service.getTaskId(),
			subtaskId: service.getSubtaskId(),
		});
	});

	service.bindTask('^tc-aabbcc');
	service.bindSubtask('subtask-one');
	service.bindSubtask('subtask-one');
	service.clearTask();
	unsubscribe();
	service.bindTask('^tc-bbbbbb');

	assert.deepEqual(snapshots, [
		{ status: 'idle', taskId: '^tc-aabbcc', subtaskId: null },
		{ status: 'idle', taskId: '^tc-aabbcc', subtaskId: 'subtask-one' },
		{ status: 'idle', taskId: null, subtaskId: null },
	]);
});

test('resetting a running subtask timer stops it without emitting a completed session', () => {
	const service = new timerServiceModule.TimerService({ capture() {} });
	const completed = [];
	service.bindTask('^tc-aabbcc');
	service.bindSubtask('delete-me');
	service.onSessionCompleted((session) => completed.push(session));
	service.state = machine.startTimer(machine.createIdleState(), {
		mode: 'focus-25',
		nowMs: 1_000,
		sessionId: 'delete-running',
		subtaskId: 'delete-me',
	}).state;

	service.reset();
	service.bindSubtask(null);

	assert.equal(service.getState().status, 'idle');
	assert.equal(service.getSubtaskId(), null);
	assert.deepEqual(completed, []);
});
