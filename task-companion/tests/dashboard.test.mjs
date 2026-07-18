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

const dashboard = await loadModule('../src/core/dashboard/model.ts');
const reviewToday = await loadModule('../src/core/reviews/today.ts');
const dashboardService = await loadModule('../src/services/dashboard-task-service.ts');
const homeReminders = await loadModule('../src/core/dashboard/home-reminders.ts');

function selected(id, category, overrides = {}) {
	return {
		category,
		task: {
			id,
			text: `Task ${id}`,
			raw: `- [ ] Task ${id}`,
			sourcePath: 'Tasks.md',
			lineNumber: 1,
			checked: false,
			cancelled: false,
			priority: null,
			hasRecurrence: false,
			start: null,
			scheduled: null,
			due: null,
			recurrence: null,
			completion: null,
			blockId: id,
			...overrides,
		},
	};
}

test('embedded view config keeps empty status compatibility and accepts only one known view', () => {
	assert.deepEqual(dashboard.parseEmbeddedView(''), { ok: true, view: 'status' });
	assert.deepEqual(dashboard.parseEmbeddedView('view: status'), {
		ok: true,
		view: 'status',
	});
	assert.deepEqual(dashboard.parseEmbeddedView('  view: current  \n'), {
		ok: true,
		view: 'current',
	});
	assert.equal(dashboard.parseEmbeddedView('view: unknown').ok, false);
	assert.equal(dashboard.parseEmbeddedView('view: today\nlimit: 3').ok, false);
	assert.equal(dashboard.parseEmbeddedView('today').ok, false);
});

test('today, important and daily widgets reuse selected-task membership without duplicates', () => {
	const tasks = [
		selected('^tc-111111', 'today'),
		selected('^tc-222222', 'important'),
		selected('^tc-333333', 'today-important'),
		selected('^tc-444444', 'recurring', { hasRecurrence: true }),
		selected('^tc-555555', 'today-important', { hasRecurrence: true }),
	];
	assert.deepEqual(
		dashboard.tasksForView(tasks, 'today').map(({ task }) => task.id),
		['^tc-111111', '^tc-333333', '^tc-555555'],
	);
	assert.deepEqual(
		dashboard.tasksForView(tasks, 'important').map(({ task }) => task.id),
		['^tc-222222', '^tc-333333', '^tc-555555'],
	);
	assert.deepEqual(
		dashboard.tasksForView(tasks, 'daily').map(({ task }) => task.id),
		['^tc-444444', '^tc-555555'],
	);
});

test('all Phase 7 embedded views have stable user-facing titles', () => {
	assert.deepEqual(
		['status', 'current', 'today', 'important', 'daily', 'review'].map(
			(view) => dashboard.embeddedViewTitle(view),
		),
		['专注状态', '当前任务', '今日待办', '重点任务', '日常任务', '任务复盘'],
	);
});

test('simultaneous homepage widgets share one safe scan but later refreshes read again', async () => {
	let calls = 0;
	let release;
	const scanner = {
		async scan() {
			calls += 1;
			await new Promise((resolve) => {
				release = resolve;
			});
			return { tasks: [], failures: [] };
		},
	};
	const service = new dashboardService.DashboardTaskService(scanner);
	const first = service.load('2026-07-16');
	const shared = service.load('2026-07-16');
	assert.equal(first, shared);
	assert.equal(calls, 1);
	release();
	await first;

	const later = service.load('2026-07-16');
	assert.equal(calls, 2);
	release();
	await later;
});

test('task completion notifies every mounted dashboard view and unsubscribe is safe', () => {
	const service = new dashboardService.DashboardTaskService({
		async scan() {
			return { tasks: [], failures: [] };
		},
	});
	let first = 0;
	let second = 0;
	const stopFirst = service.subscribe(() => {
		first += 1;
	});
	service.subscribe(() => {
		second += 1;
	});
	service.notifyChanged();
	stopFirst();
	service.notifyChanged();
	assert.deepEqual({ first, second }, { first: 1, second: 2 });
});

test('dashboard snapshot treats a past scheduled task as an active today reminder', async () => {
	const parsed = selected('^tc-666666', 'today', {
		scheduled: '2026-07-15',
		priority: '🔽',
	}).task;
	const scanner = {
		async scan() {
			return { tasks: [{ id: parsed.id, parsed }], failures: [] };
		},
	};
	const service = new dashboardService.DashboardTaskService(scanner);
	const snapshot = await service.load('2026-07-16');
	assert.equal(snapshot.allTasks[0].id, '^tc-666666');
	assert.equal(snapshot.home.today[0].today.label, '已安排');
	assert.equal(snapshot.tasks[0].category, 'today');
});

test('home reminder groups exactly mirror the four Home-Test lanes', () => {
	const task = (id, text, overrides = {}) => ({
		...selected(id, 'pending', overrides).task,
		text,
		raw: `- [ ] ${text}`,
		hasRecurrence: text.includes('🔁'),
		recurrence: text.includes('🔁') ? text.match(/🔁\s*([^📅⏳🛫➕✅❌]+)/u)?.[1]?.trim() ?? null : null,
		...overrides,
	});
	const active = [
		task('^tc-100001', '过去计划 🔽 ⏳ 2026-07-15', { scheduled: '2026-07-15', priority: '🔽' }),
		task('^tc-100002', '区间执行 🔼 🛫 2026-07-15 📅 2026-07-20', { start: '2026-07-15', due: '2026-07-20', priority: '🔼' }),
		task('^tc-100003', '最高优先级 ⏫', { priority: '⏫' }),
		task('^tc-100004', '稍后推进 ⏬ 📅 2026-08-01', { priority: '⏬', due: '2026-08-01' }),
		task('^tc-100005', '每周任务 🔁 every week', { hasRecurrence: true, recurrence: 'every week' }),
		task('^tc-100006', '🛏️早起 🔁 every day', {
			hasRecurrence: true,
			recurrence: 'every day',
			sourcePath: 'Habits.md',
		}),
		task('^tc-100007', '📖reading 🔁 every day', {
			hasRecurrence: true,
			recurrence: 'every day',
			sourcePath: 'Calendar/Journal/Daily/2026-07-16.md',
		}),
	];
	const completed = [
		{
			...task('Tasks.md:1', '每周任务 🔁 every week ✅ 2026-07-15', {
				hasRecurrence: true,
				recurrence: 'every week',
				checked: true,
				completion: '2026-07-15',
			}),
		},
	];
	const groups = homeReminders.buildHomeReminderGroups(active, completed, '2026-07-16');
	assert.deepEqual(groups.today.map(({ task: item }) => item.id), ['^tc-100001', '^tc-100002']);
	assert.deepEqual(groups.important.map(({ task: item }) => item.id), ['^tc-100003']);
	assert.deepEqual(groups.pending.map(({ task: item }) => item.id), ['^tc-100004']);
	assert.deepEqual(groups.daily.map(({ task: item }) => item.id), ['^tc-100007']);
});

test('pending embedded view is supported and titled consistently', () => {
	assert.deepEqual(dashboard.parseEmbeddedView('view: pending'), {
		ok: true,
		view: 'pending',
	});
	assert.equal(dashboard.embeddedViewTitle('pending'), '待推进任务');
});

test('one processor owns all embedded views and render children explicitly clean up', async () => {
	const [main, embedded, status] = await Promise.all([
		readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
		readFile(new URL('../src/ui/embedded-code-block.ts', import.meta.url), 'utf8'),
		readFile(new URL('../src/ui/status-code-block.ts', import.meta.url), 'utf8'),
	]);
	const registrations = `${main}\n${embedded}\n${status}`.match(
		/registerMarkdownCodeBlockProcessor\(/gu,
	);
	assert.equal(registrations?.length, 1);
	assert.match(embedded, /ctx\.addChild\(child\)/u);
	assert.match(embedded, /class DataViewChild extends MarkdownRenderChild/u);
	assert.match(embedded, /onunload\(\): void/u);
	assert.match(embedded, /removeEventListener\('click'/u);
	assert.match(embedded, /generation === this\.generation/u);
	assert.match(embedded, /timerService\.subscribe/u);
	assert.match(embedded, /sessionService\.subscribe/u);
	assert.match(embedded, /subtaskService\.subscribe/u);
	assert.match(
		embedded,
		/sessionService\.subscribe\(\(taskId\) =>\s*this\.handleSessionDataChange\(taskId\)/u,
	);
	assert.match(embedded, /serviceCleanups\.splice/u);
	assert.match(embedded, /母任务/u);
	assert.match(embedded, /子任务/u);
	assert.match(embedded, /selectedSubtask\.title/u);
	assert.match(embedded, /getRemainingSeconds\(Date\.now\(\)\)/u);
	assert.match(embedded, /toggleTimer\(\)/u);
	assert.match(embedded, /saveTimerPreference/u);
	assert.match(embedded, /text:\s*'确定'/u);
	assert.match(embedded, /custom\.addEventListener\('keydown'/u);
	assert.match(embedded, /event\.key\s*!==\s*'Enter'/u);
	assert.match(embedded, /await this\.actions\.saveTimerPreference/u);
	assert.match(embedded, /panel\.remove\(\)/u);
	assert.match(embedded, /if \(saving\) return/u);
	assert.match(embedded, /taskLoader\.notifyChanged\(\)/u);
	assert.match(embedded, /completeTask/u);
	assert.doesNotMatch(embedded, /renderHeader\(widget, '进行中'\)/u);
	assert.match(embedded, /toggleClass\(\s*'is-running'/u);
	assert.match(embedded, /taskcompanion-current-execution-target/u);
	const unavailableCurrent = embedded.slice(
		embedded.indexOf('private renderUnavailableCurrent'),
		embedded.indexOf('private renderCurrent('),
	);
	assert.match(unavailableCurrent, /taskcompanion-current-unavailable/u);
	assert.match(unavailableCurrent, /'选择任务'/u);
	assert.match(unavailableCurrent, /taskcompanion-current-missing-message/u);
	assert.match(unavailableCurrent, /this\.renderInlineTimer\(card\)/u);
	assert.match(unavailableCurrent, /this\.renderCurrentMetrics\(card, progress\)/u);
	assert.doesNotMatch(unavailableCurrent, /taskcompanion-empty-state/u);
	assert.match(embedded, /sessionService\.history\(taskId\)[\s\S]*?renderMissingCurrent\(progress/u);
	assert.match(
		embedded,
		/if \(this\.view !== 'current'\) \{\s*this\.createButton\([\s\S]*?'刷新'/u,
	);
	const timerContext = embedded.slice(
		embedded.indexOf('private timerContextKey'),
		embedded.indexOf('private updateCurrentTimer'),
	);
	assert.match(timerContext, /getTaskId/u);
	assert.match(timerContext, /getSubtaskId/u);
	assert.doesNotMatch(timerContext, /state\.status|sessionId/u);
	const sessionHandler = embedded.slice(
		embedded.indexOf('private handleSessionDataChange'),
		embedded.indexOf('private timerContextKey'),
	);
	assert.match(sessionHandler, /updateCurrentMetrics\(taskId\)/u);
	assert.match(sessionHandler, /currentInvestmentValueEl\?\.setText/u);
	assert.match(sessionHandler, /currentSessionCountValueEl\?\.setText/u);
	assert.doesNotMatch(sessionHandler, /this\.refresh\(\)|containerEl\.empty/u);
	assert.doesNotMatch(embedded, /打开计时/u);
	assert.doesNotMatch(embedded, /taskDescription/u);
	assert.match(status, /this\.unsubscribe\?\.\(\)/u);
	assert.match(status, /removeEventListener\('click'/u);
	assert.doesNotMatch(embedded, /setInterval|registerInterval|registerEvent/u);
});

test('execution preparation integrates breakdown editing and refreshes in place', async () => {
	const [main, modal, embedded, styles] = await Promise.all([
		readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
		readFile(new URL('../src/ui/execution-target-modal.ts', import.meta.url), 'utf8'),
		readFile(new URL('../src/ui/embedded-code-block.ts', import.meta.url), 'utf8'),
		readFile(new URL('../styles.css', import.meta.url), 'utf8'),
	]);
	assert.match(modal, /this\.setTitle\('执行准备'\)/u);
	assert.doesNotMatch(modal, /编辑任务拆解|onManageSubtasks/u);
	assert.match(modal, /createParentTarget\(\)/u);
	assert.match(modal, /createSubtaskTarget/u);
	assert.match(modal, /taskcompanion-subtask-composer taskcompanion-target-composer/u);
	assert.match(modal, /placeholder: '新增一个可执行的子任务'/u);
	assert.match(modal, /taskcompanion-subtask-more/u);
	assert.match(
		modal,
		/taskcompanion-subtask-more taskcompanion-target-add-button/u,
	);
	assert.match(modal, /setAttr\('aria-label', '添加子任务'\)/u);
	assert.doesNotMatch(modal, /addButton\.createSpan\(\{ text: '添加' \}\)/u);
	assert.match(modal, /\.setTitle\('删除子任务'\)/u);
	assert.match(modal, /this\.plan = await this\.service\.load/u);
	assert.match(modal, /installModalBackButton/u);
	assert.match(styles, /\.taskcompanion-target-option-row \{[^}]*margin-inline-start: calc\(3em \+ 12px\);/u);
	assert.match(
		styles,
		/\.taskcompanion-target-composer \{[^}]*grid-template-columns: minmax\(0, 1fr\) 36px;[^}]*margin-inline-start: calc\(3em \+ 12px\);/u,
	);
	assert.match(styles, /\.taskcompanion-target-add-button \{[^}]*grid-column: auto;/u);
	assert.match(
		styles,
		/\.taskcompanion-target-option-row \.taskcompanion-target-option,\s*\.taskcompanion-target-composer input\[type='text'\] \{[^}]*height: 40px;[^}]*min-height: 40px;[^}]*border-radius: 12px;[^}]*box-shadow: 0 1px 2px/u,
	);
	assert.match(
		styles,
		/\.taskcompanion-target-option-row \.taskcompanion-subtask-more \{\s*grid-column: 2;/u,
	);
	assert.match(
		styles,
		/\.taskcompanion-target-composer input\[type='text'\],[^{]*\.taskcompanion-target-option-row \.taskcompanion-target-title,[^{]*\.taskcompanion-target-option-row \.taskcompanion-target-action \{\s*font-size: var\(--font-ui-small\);/u,
	);
	assert.match(main, /new ExecutionTargetModal\(/u);
	assert.match(main, /execute,\s*this\.subtaskService,/u);
	assert.match(
		main,
		/\(subtask, nowMs\) => this\.completeSubtask\(task\.id, subtask, nowMs\)/u,
	);
	assert.match(main, /\(subtask\) => this\.deleteSubtask\(task\.id, subtask\)/u);
	assert.match(main, /focusTask: \(task\) => this\.selectTask\(task\)/u);
	assert.match(embedded, /this\.actions\.focusTask\(task\)/u);
	assert.doesNotMatch(embedded, /manageSubtasks/u);
	assert.doesNotMatch(main, /afterClosed\?\.\(\)/u);
	assert.doesNotMatch(main, /if \(activeSubtasks\.length === 0\)/u);
});

test('subtask menu always offers permanent deletion and active deletion resets the timer first', async () => {
	const [main, modal] = await Promise.all([
		readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
		readFile(new URL('../src/ui/subtask-manager-modal.ts', import.meta.url), 'utf8'),
	]);
	assert.match(modal, /\.setTitle\('删除子任务'\)/u);
	assert.doesNotMatch(modal, /删除已取消子任务|deleteCancelled/u);
	const deletion = main.slice(
		main.indexOf('private async deleteSubtask'),
		main.indexOf('private async openSubtaskManagerForTaskId'),
	);
	assert.match(deletion, /timerService\.reset\(\)/u);
	assert.match(deletion, /sessionService\.purgeSubtask/u);
	assert.match(deletion, /reviewService\.purgeSubtask/u);
	assert.match(deletion, /subtaskService\.purgeSubtask/u);
});

test('every Task Companion modal installs and cleans up the unified back button', async () => {
	const modalFiles = [
		'execution-target-modal.ts',
		'hierarchical-task-picker-modal.ts',
		'outstanding-subtasks-modal.ts',
		'review-modal.ts',
		'review-queue-modal.ts',
		'script-manager-modal.ts',
		'session-history-modal.ts',
		'session-reflection-modal.ts',
		'status-modal.ts',
		'subtask-manager-modal.ts',
		'task-selection-modal.ts',
		'timer-control-modal.ts',
		'template-decision-modal.ts',
		'template-suggestion-modal.ts',
	];
	for (const file of modalFiles) {
		const source = await readFile(
			new URL(`../src/ui/${file}`, import.meta.url),
			'utf8',
		);
		assert.match(source, /installModalBackButton\(this,/u, file);
		assert.match(source, /removeBackButton\?\.\(\)/u, file);
	}
});

test('Phase 7.2 task picker uses three heading levels and keeps child tasks collapsed', async () => {
	const [picker, main] = await Promise.all([
		readFile(new URL('../src/ui/hierarchical-task-picker-modal.ts', import.meta.url), 'utf8'),
		readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
	]);
	assert.match(picker, /taskcompanion-hierarchy-level-one/u);
	assert.match(picker, /taskcompanion-hierarchy-level-two/u);
	assert.match(picker, /taskcompanion-hierarchy-level-three/u);
	assert.match(picker, /expandedTaskIds/u);
	assert.match(picker, /'link-2'/u);
	assert.match(picker, /type: 'checkbox'/u);
	assert.match(picker, /taskcompanion-completion-checkbox/u);
	assert.match(picker, /'chevron-down'/u);
	assert.doesNotMatch(picker, /🔗|✓|▾|▸/u);
	assert.match(main, /eState: \{ line: requestedLine \}/u);
	assert.match(main, /editor\.setCursor\(from\)/u);
	assert.match(main, /editor\.scrollIntoView/u);
});

test('Phase 7.3 visual system keeps subtasks on one row and normalizes every modal control', async () => {
	const [subtasks, navigation, embedded, styles] = await Promise.all([
		readFile(new URL('../src/ui/subtask-manager-modal.ts', import.meta.url), 'utf8'),
		readFile(new URL('../src/ui/modal-navigation.ts', import.meta.url), 'utf8'),
		readFile(new URL('../src/ui/embedded-code-block.ts', import.meta.url), 'utf8'),
		readFile(new URL('../styles.css', import.meta.url), 'utf8'),
	]);
	assert.match(subtasks, /taskcompanion-subtask-row/u);
	assert.match(subtasks, /new Menu\(\)/u);
	assert.match(subtasks, /showAtMouseEvent/u);
	assert.match(subtasks, /title\.addEventListener\('blur'/u);
	assert.doesNotMatch(subtasks, /new Setting\(/u);
	assert.match(navigation, /addClass\('taskcompanion-modal'\)/u);
	assert.match(styles, /\.taskcompanion-modal \.modal-close-button,\n\.taskcompanion-modal-back-button/u);
	assert.match(styles, /\.taskcompanion-subtask-row \{/u);
	assert.match(styles, /grid-template-columns: 24px minmax\(0, 1fr\) 24px 32px/u);
	assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/u);
	assert.match(styles, /\.taskcompanion-modal \.taskcompanion-title-trailing-action/u);
	assert.match(styles, /\.taskcompanion-metrics > button\.taskcompanion-metric/u);
	assert.match(styles, /\.taskcompanion-modal \.taskcompanion-modal-back-button/u);
	assert.match(styles, /background-color: var\(--tc-fill\) !important/u);
	assert.match(styles, /button\.taskcompanion-task-title-button/u);
	assert.match(styles, /\.taskcompanion-inline-time-button\.is-running/u);
	assert.match(styles, /color: var\(--text-error\) !important/u);
	assert.match(styles, /\.taskcompanion-current-execution-target/u);
	assert.match(styles, /\.taskcompanion-current-execution-row\.is-child/u);
	assert.match(styles, /\.taskcompanion-current-execution-row\.is-unavailable/u);
	assert.match(styles, /\.taskcompanion-current-missing-message/u);
	assert.match(
		styles,
		/grid-template-columns: auto minmax\(0, 1fr\) 64px/u,
	);
	assert.match(styles, /justify-content: flex-start;\s*text-align: left;/u);
	assert.match(
		styles,
		/\.taskcompanion-current-execution-row\.is-child strong \{[^}]*text-align: left;/u,
	);
	assert.match(
		styles,
		/\.taskcompanion-current-execution-row \.taskcompanion-current-title-button \{[^}]*font-size: 0\.85rem;/u,
	);
	assert.match(
		styles,
		/\.taskcompanion-current-execution-row\.is-child strong \{[^}]*font-size: 0\.85rem;/u,
	);
	assert.match(embedded, /executionTarget\.createDiv/u);
	assert.match(embedded, /taskcompanion-current-execution-row is-parent/u);
	assert.match(embedded, /taskcompanion-current-execution-row is-child/u);
	assert.match(embedded, /taskcompanion-child-actions/u);
	assert.match(embedded, /'circle-check', '完成子任务'/u);
	assert.match(embedded, /'circle-check', '完成母任务'/u);
	assert.match(embedded, /this\.actions\.completeCurrentParent\(task\)/u);
	assert.match(embedded, /this\.actions\.completeCurrentTarget\(task\)/u);
	assert.match(embedded, /text: currentExecutionTaskTitle\(task\.text\)/u);
	assert.match(embedded, /(?:➕\|🛫\|⏳\|📅\|✅\|❌)/u);
	assert.match(embedded, /text: removeTrailingTaskId\(selected\.task\.text\)/u);
	assert.doesNotMatch(embedded, /taskcompanion-current-subtask is-execution-target/u);
	assert.match(styles, /\.taskcompanion-completion-checkbox/u);
	assert.match(
		styles,
		/\.taskcompanion-widget \.taskcompanion-card-list button\.taskcompanion-task-title-button/u,
	);
	assert.match(styles, /appearance: none !important/u);
	assert.match(embedded, /'settings-2'/u);
	assert.match(embedded, /'rotate-ccw'/u);
	assert.doesNotMatch(embedded, /⚙️|⏹|↺|🔗/u);
});

test('confirmed completion owns review eligibility while timer endings save silently', async () => {
	const [
		main,
		embedded,
		picker,
		reviewQueue,
		sessionReflection,
		history,
		reviewModal,
		styles,
	] = await Promise.all([
		readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
		readFile(new URL('../src/ui/embedded-code-block.ts', import.meta.url), 'utf8'),
		readFile(new URL('../src/ui/hierarchical-task-picker-modal.ts', import.meta.url), 'utf8'),
		readFile(new URL('../src/ui/review-queue-modal.ts', import.meta.url), 'utf8'),
		readFile(new URL('../src/ui/session-reflection-modal.ts', import.meta.url), 'utf8'),
		readFile(new URL('../src/ui/session-history-modal.ts', import.meta.url), 'utf8'),
		readFile(new URL('../src/ui/review-modal.ts', import.meta.url), 'utf8'),
		readFile(new URL('../styles.css', import.meta.url), 'utf8'),
	]);
	assert.match(embedded, /completeCurrentTarget/u);
	assert.match(embedded, /createCompletionCheckbox\(card, false/u);
	assert.match(embedded, /createCompletionCheckbox\(card, true/u);
	assert.match(embedded, /reopenReview/u);
	assert.match(picker, /type: 'checkbox'/u);
	assert.doesNotMatch(picker, /'circle-check'/u);
	assert.match(reviewQueue, /checkbox\.checked = true/u);
	assert.match(main, /session\.mode !== 'quick'/u);
	assert.match(main, /finalizeSession\(session\.sessionId, EMPTY_SESSION_REFLECTION\)/u);
	assert.match(main, /openCompletionReflection/u);
	assert.match(main, /taskScanner\.reopen/u);
	assert.match(sessionReflection, /注意事项（可选）/u);
	assert.match(history, /注意事项：/u);
	assert.match(embedded, /'今日已完成'/u);
	assert.match(embedded, /openReviewQueue\('today'\)/u);
	assert.doesNotMatch(embedded, /打开完整复盘队列/u);
	assert.match(
		embedded,
		/const metric = container\.createDiv\(\{ cls: 'taskcompanion-metric' \}\)/u,
	);
	assert.doesNotMatch(
		embedded,
		/container\.createEl\('button', \{ cls: 'taskcompanion-metric/u,
	);
	assert.match(
		styles,
		/taskcompanion-review-summary[\s\S]*taskcompanion-metric\.is-clickable:hover[\s\S]*taskcompanion-metric-label[\s\S]*color: var\(--interactive-accent\)/u,
	);
	assert.match(
		styles,
		/taskcompanion-review-summary \.taskcompanion-metric\.is-clickable \{\s*cursor: pointer;/u,
	);
	assert.match(main, /this\.openTemplateDecision\(review, reflection\)/u);
	assert.match(reviewModal, /this\.close\(\);\s*this\.onSaved\(savedReflection\)/u);
});

test('today completed review count uses local completion day and one latest row per target', () => {
	const now = new Date(2026, 6, 17, 12, 0, 0);
	const base = {
		schemaVersion: 2,
		eventId: 'event-1',
		reviewId: 'review-1',
		taskId: '^tc-aabbcc',
		taskTitle: '逾期任务',
		targetType: 'task',
		subtaskId: null,
		parentTaskTitle: null,
		sourcePath: 'Tasks.md',
		sourceLineNumber: 1,
		occurredAt: new Date(2026, 6, 17, 8, 0, 0).toISOString(),
		completedAt: new Date(2026, 6, 17, 8, 0, 0).toISOString(),
		reviewStatus: 'pending',
		stats: {},
		reviewText: null,
		wentWell: null,
		reworkOrBlocker: null,
		nextAdjustment: null,
		markdownPath: null,
	};
	const duplicateParent = {
		...base,
		eventId: 'event-2',
		reviewId: 'review-2',
		occurredAt: new Date(2026, 6, 17, 9, 0, 0).toISOString(),
		completedAt: new Date(2026, 6, 17, 9, 0, 0).toISOString(),
	};
	const yesterdayChild = {
		...base,
		eventId: 'event-3',
		reviewId: 'review-3',
		targetType: 'subtask',
		subtaskId: 'child-1',
		parentTaskTitle: '逾期任务',
		completedAt: new Date(2026, 6, 16, 9, 0, 0).toISOString(),
	};
	const result = reviewToday.reviewsCompletedOnLocalDay(
		[base, duplicateParent, yesterdayChild],
		now,
	);
	assert.equal(result.length, 1);
	assert.equal(result[0].reviewId, 'review-2');
});

test('repository test homepage composes every supported Phase 7 view once', async () => {
	const content = await readFile(
		new URL('../../test-vault/Task Companion Home.md', import.meta.url),
		'utf8',
	);
	const sources = [...content.matchAll(/```taskcompanion\n([\s\S]*?)```/gu)].map(
		(match) => match[1],
	);
	const parsed = sources.map((source) => dashboard.parseEmbeddedView(source));
	assert.equal(parsed.every(({ ok }) => ok), true);
	assert.deepEqual(
		parsed.map((result) => result.view),
		['current', 'today', 'important', 'daily', 'pending', 'review'],
	);
	assert.match(content, /当前任务与专注/u);
	assert.doesNotMatch(content, /view: status/u);
	assert.match(content, /不是正式主页副本/u);
});
