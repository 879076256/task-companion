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

const { TaskScanner } = await loadModule('../src/adapters/tasks/task-scanner.ts');

class FakeVault {
	constructor(files) {
		this.files = new Map(Object.entries(files));
		this.failReads = new Set();
		this.failWrites = new Set();
	}

	listMarkdownPaths() {
		return [...this.files.keys()];
	}

	async read(path) {
		if (this.failReads.has(path)) throw new Error('read failed');
		return this.files.get(path);
	}

	async process(path, transform) {
		if (this.failWrites.has(path)) throw new Error('write failed');
		this.files.set(path, transform(this.files.get(path)));
	}
}

function sequentialIds(...values) {
	return (existing) => {
		const next = values.shift();
		assert.equal(existing.has(next), false);
		return next;
	};
}

test('scanner adds stable IDs only to active formal tasks', async () => {
	const vault = new FakeVault({
		'Tasks.md': [
			'- [ ] 今日任务 🔼 ⏳ 2026-07-16',
			'- [ ] 普通复选框',
			'- [x] 已完成 ⏫',
			'- [-] 已取消 ⏬',
			'- [ ] 已有 ID ⏫ ^tc-aabbcc',
		].join('\n'),
	});
	const scanner = new TaskScanner(
		vault,
		sequentialIds('^tc-112233'),
	);

	const result = await scanner.scan();
	assert.deepEqual(result.tasks.map(({ id }) => id), ['^tc-aabbcc', '^tc-112233']);
	assert.equal(result.failures.length, 0);
	assert.match(vault.files.get('Tasks.md'), /今日任务 🔼 ⏳ 2026-07-16 \^tc-112233/u);
	assert.match(vault.files.get('Tasks.md'), /普通复选框\n/u);
});

test('conflicting block IDs and write failures leave original text unchanged', async () => {
	const original = '- [ ] 冲突任务 ⏫ ^other-id\n- [ ] 可写任务 🔼 ⏳ 2026-07-16';
	const vault = new FakeVault({ 'Conflict.md': original });
	vault.failWrites.add('Conflict.md');
	const scanner = new TaskScanner(vault, sequentialIds('^tc-334455'));

	const result = await scanner.scan();
	assert.equal(vault.files.get('Conflict.md'), original);
	assert.deepEqual(
		result.failures.map(({ lineNumber, reason }) => [lineNumber, reason]),
		[
			[1, 'conflicting-block-id'],
			[2, 'write-conflict'],
		],
	);
});

test('one unreadable file does not block another file and task selection stays isolated', async () => {
	const vault = new FakeVault({
		'Broken.md': '- [ ] broken ⏫',
		'Valid.md': '- [ ] 今日且重点 ⏫ ⏳ 2026-07-16',
	});
	vault.failReads.add('Broken.md');
	const scanner = new TaskScanner(vault, sequentialIds('^tc-556677'));

	const result = await scanner.select('2026-07-16');
	assert.equal(result.tasks.length, 1);
	assert.equal(result.tasks[0].task.sourcePath, 'Valid.md');
	assert.equal(result.tasks[0].category, 'today-important');
	assert.deepEqual(result.failures, [
		{ path: 'Broken.md', lineNumber: null, reason: 'read-failed' },
	]);
});

test('new IDs cannot collide with an existing ID in a later file', async () => {
	const vault = new FakeVault({
		'A-new.md': '- [ ] 需要新 ID 🔼 ⏳ 2026-07-16',
		'Z-existing.md': '- [ ] 已有 ID ⏫ ^tc-abcdef',
	});
	const scanner = new TaskScanner(vault, (existing) => {
		assert.equal(existing.has('^tc-abcdef'), true);
		return '^tc-123456';
	});

	const result = await scanner.scan();
	assert.deepEqual(result.tasks.map(({ id }) => id).sort(), [
		'^tc-123456',
		'^tc-abcdef',
	]);
	assert.equal(result.failures.length, 0);
});

test('plugin entry wires scanner, source opening and timer binding without sessions', async () => {
	const main = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
	assert.match(main, /new TaskScanner\(/u);
	assert.match(main, /openTaskSource/u);
	assert.match(main, /timerService\.bindTask\(selected\.task\.id\)/u);
	assert.match(main, /action === 'open-current'/u);
	assert.match(main, /请先结束当前计时/u);
	assert.equal(main.includes('ExecutionSession'), false);
});
