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

const rules = await loadModule('../src/core/tasks/task-rules.ts');
const ids = await loadModule('../src/core/tasks/task-id.ts');
const selection = await loadModule('../src/core/tasks/task-selection.ts');
const TODAY = '2026-07-16';

function parse(line, lineNumber = 1) {
	return rules.parseTaskLine(line, 'Phase 3 Tasks.md', lineNumber);
}

test('formal filtering accepts active priority or recurring tasks only', () => {
	const tasks = [
		parse('- [ ] 今日任务 🔼 ⏳ 2026-07-16'),
		parse('- [ ] 循环任务 🔁 every day'),
		parse('- [ ] 普通复选框'),
		parse('- [x] 已完成 ⏫'),
		parse('- [-] 已取消 🔼'),
		parse('- [ ] 明确取消 canceled ⏬'),
	].filter(Boolean);

	assert.deepEqual(
		rules.filterFormalTasks(tasks).map(({ text }) => text),
		['今日任务 🔼 ⏳ 2026-07-16', '循环任务 🔁 every day'],
	);
});

test('today rules cover every confirmed start, scheduled and due branch', () => {
	const cases = [
		['- [ ] 范围内 🔼 🛫 2026-07-15 📅 2026-07-20', true],
		['- [ ] 今日计划 🔼 ⏳ 2026-07-16', true],
		['- [ ] 过去计划仍待处理 🔼 ⏳ 2026-07-15', true],
		['- [ ] 今日截止 🔼 📅 2026-07-16', true],
		['- [ ] 逾期 🔼 📅 2026-07-15', true],
		['- [ ] 已开始 🔼 🛫 2026-07-15', true],
		['- [ ] 未来截止 🔼 📅 2026-07-20', false],
		['- [ ] 无日期 🔼', false],
		['- [ ] 未来开始但今日计划 🔼 🛫 2026-07-20 ⏳ 2026-07-16', true],
		['- [ ] 不一致但已逾期 🔼 🛫 2026-07-20 📅 2026-07-15', true],
	];

	for (const [line, expected] of cases) {
		assert.equal(rules.isTodayTask(parse(line), TODAY), expected, line);
	}
});

test('important and recurring tasks are de-duplicated into one category', () => {
	const tasks = [
		parse('- [ ] 今日且重点 ⏫ ⏳ 2026-07-16 ^tc-a1b2c3', 1),
		parse('- [ ] 仅重点 ⏫ 📅 2026-08-01 ^tc-a1b2c4', 2),
		parse('- [ ] 仅日常 🔁 every day ^tc-a1b2c5', 3),
	];
	assert.deepEqual(
		rules.selectTasks(tasks, TODAY).map(({ task, category }) => [task.id, category]),
		[
			['^tc-a1b2c3', 'today-important'],
			['^tc-a1b2c4', 'important'],
			['^tc-a1b2c5', 'recurring'],
		],
	);
});

test('stable IDs validate, avoid collisions and never replace another block ID', () => {
	assert.equal(ids.isTaskId('^tc-a1b2c3'), true);
	assert.equal(ids.isTaskId('^tc-ABC123'), false);
	assert.equal(ids.extractBlockId('- [ ] task 🔼 ^other-id'), '^other-id');
	assert.equal(ids.appendTaskId('- [ ] task 🔼', '^tc-a1b2c3'), '- [ ] task 🔼 ^tc-a1b2c3');
	assert.equal(ids.appendTaskId('- [ ] task 🔼 ^other-id', '^tc-a1b2c3'), null);

	const values = ['a1b2c3', 'd4e5f6'];
	const generated = ids.generateTaskId(
		new Set(['^tc-a1b2c3']),
		() => values.shift(),
	);
	assert.equal(generated, '^tc-d4e5f6');
});

test('an active timer reopens for its current task but rejects another task', () => {
	assert.equal(
		selection.resolveTaskSelectionAction('running', '^tc-a1b2c3', '^tc-a1b2c3'),
		'open-current',
	);
	assert.equal(
		selection.resolveTaskSelectionAction('paused', '^tc-a1b2c3', '^tc-d4e5f6'),
		'reject-switch',
	);
	assert.equal(
		selection.resolveTaskSelectionAction('finished', '^tc-a1b2c3', '^tc-d4e5f6'),
		'bind-new',
	);
});
