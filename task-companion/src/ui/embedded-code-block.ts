import {
	MarkdownPostProcessorContext,
	MarkdownRenderChild,
	Notice,
	Plugin,
	setIcon,
} from 'obsidian';
import type { TaskScanner } from '../adapters/tasks/task-scanner';
import {
	embeddedViewTitle,
	EmbeddedView,
	parseEmbeddedView,
} from '../core/dashboard/model';
import { reminderItemsAsSelected } from '../core/dashboard/home-reminders';
import type { ReviewEvent } from '../core/reviews/model';
import { reviewsCompletedOnLocalDay } from '../core/reviews/today';
import type { TimerMode } from '../core/timer/model';
import type {
	ParsedTask,
	SelectedTask,
} from '../core/tasks/task-rules';
import type { ReviewService } from '../services/review-service';
import { DashboardTaskService } from '../services/dashboard-task-service';
import type { SessionService } from '../services/session-service';
import type { SubtaskService } from '../services/subtask-service';
import type { TimerService } from '../services/timer-service';
import { StatusViewChild } from './status-code-block';

export interface EmbeddedServices {
	taskScanner: TaskScanner;
	dashboardTaskService: DashboardTaskService;
	timerService: TimerService;
	sessionService: SessionService;
	subtaskService: SubtaskService;
	reviewService: ReviewService;
}

export interface EmbeddedActions {
	openTimer(): void;
	openTaskPicker(): void;
	openTaskSource(task: SelectedTask | ParsedTask): Promise<void>;
	focusTask(task: SelectedTask | ParsedTask): Promise<boolean>;
	completeTask(task: SelectedTask | ParsedTask): Promise<boolean>;
	completeCurrentParent(task: ParsedTask): Promise<boolean>;
	completeCurrentTarget(task: ParsedTask): Promise<boolean>;
	reopenReview(review: ReviewEvent): Promise<boolean>;
	openSessionHistory(): void;
	openReviewQueue(scope?: 'all' | 'today'): void;
	openReview(review: ReviewEvent): void;
	getTimerPreference(): { mode: TimerMode; customMinutes: number };
	saveTimerPreference(mode: TimerMode, customMinutes: number): Promise<void>;
}

type CurrentProgress = Awaited<ReturnType<SubtaskService['progress']>>;

export function registerEmbeddedCodeBlocks(
	plugin: Plugin,
	services: EmbeddedServices,
	actions: EmbeddedActions,
): void {
	const taskLoader = services.dashboardTaskService;
	plugin.registerMarkdownCodeBlockProcessor(
		'taskcompanion',
		(
			source: string,
			el: HTMLElement,
			ctx: MarkdownPostProcessorContext,
		) => {
			const config = parseEmbeddedView(source);
			if (!config.ok) {
				el.createDiv({
					cls: 'taskcompanion-widget taskcompanion-widget-error',
					text: config.message,
				});
				return;
			}
			const child: MarkdownRenderChild =
				config.view === 'status'
					? new StatusViewChild(
							el,
							services.timerService,
							() => actions.openTimer(),
						)
					: new DataViewChild(el, config.view, services, actions, taskLoader);
			ctx.addChild(child);
		},
	);
}

class DataViewChild extends MarkdownRenderChild {
	private disposed = false;
	private generation = 0;
	private renderCleanups: Array<() => void> = [];
	private serviceCleanups: Array<() => void> = [];
	private currentContextKey: string | null = null;
	private currentTimerStatusEl: HTMLElement | null = null;
	private currentTimerValueEl: HTMLElement | null = null;
	private currentInvestmentValueEl: HTMLElement | null = null;
	private currentSubtaskValueEl: HTMLElement | null = null;
	private currentSessionCountValueEl: HTMLElement | null = null;
	private currentMetricUpdateGeneration = 0;

	constructor(
		containerEl: HTMLElement,
		private readonly view: Exclude<EmbeddedView, 'status'>,
		private readonly services: EmbeddedServices,
		private readonly actions: EmbeddedActions,
		private readonly taskLoader: DashboardTaskService,
	) {
		super(containerEl);
	}

	onload(): void {
		this.serviceCleanups.push(
			this.taskLoader.subscribe(() => void this.refresh()),
		);
		if (this.view === 'current') {
			this.serviceCleanups.push(
				this.services.timerService.subscribe(() => this.handleTimerChange()),
				this.services.sessionService.subscribe((taskId) =>
					this.handleSessionDataChange(taskId),
				),
				this.services.subtaskService.subscribe((taskId) =>
					this.handleTaskDataChange(taskId),
				),
			);
		}
		if (this.view === 'review') {
			this.serviceCleanups.push(
				this.services.reviewService.subscribe(() => void this.refresh()),
				this.services.subtaskService.subscribe(() => void this.refresh()),
			);
		}
		void this.refresh();
	}

	onunload(): void {
		this.disposed = true;
		this.generation += 1;
		for (const cleanup of this.serviceCleanups.splice(0)) cleanup();
		this.clearRender();
	}

	private async refresh(): Promise<void> {
		const generation = ++this.generation;
		this.renderLoading();
		try {
			if (this.view === 'review') {
				const reviews = await this.services.reviewService.list();
				if (!this.isCurrent(generation)) return;
				this.renderReviews(reviews);
				return;
			}
			if (this.view === 'current') {
				this.currentContextKey = this.timerContextKey();
				await this.loadCurrent(generation);
				return;
			}
			const result = await this.taskLoader.load(
				formatLocalDate(new Date()),
			);
			if (!this.isCurrent(generation)) return;
			this.renderTasks(
				reminderItemsAsSelected(result.home[this.view], this.view),
				result.failures.length,
			);
		} catch {
			if (this.isCurrent(generation)) this.renderFailure();
		}
	}

	private async loadCurrent(generation: number): Promise<void> {
		const taskId = this.services.timerService.getTaskId();
		if (!taskId) {
			if (this.isCurrent(generation)) this.renderNoCurrent();
			return;
		}
		const result = await this.taskLoader.load(
			formatLocalDate(new Date()),
		);
		const task = result.allTasks.find((candidate) => candidate.id === taskId);
		if (!task) {
			let progress: CurrentProgress | null = null;
			try {
				const sessions = await this.services.sessionService.history(taskId);
				progress = await this.services.subtaskService.progress(taskId, sessions);
			} catch {
				// A missing source must not remove the still-usable timer controls.
			}
			if (this.isCurrent(generation)) {
				this.renderMissingCurrent(progress, result.failures.length);
			}
			return;
		}
		const sessions = await this.services.sessionService.history(taskId);
		const progress = await this.services.subtaskService.progress(taskId, sessions);
		if (!this.isCurrent(generation)) return;
		this.renderCurrent(task, progress, result.failures.length);
	}

	private renderLoading(): void {
		this.renderShell('正在读取本地档案…');
	}

	private renderFailure(): void {
		this.renderShell('组件读取失败；原任务和档案均未修改。', true);
	}

	private renderNoCurrent(): void {
		this.renderUnavailableCurrent('尚未选择当前任务。', null, 0);
	}

	private renderMissingCurrent(
		progress: CurrentProgress | null,
		failureCount: number,
	): void {
		this.renderUnavailableCurrent(
			'原任务已不可用，请重新选择。',
			progress,
			failureCount,
		);
	}

	private renderUnavailableCurrent(
		message: string,
		progress: CurrentProgress | null,
		failureCount: number,
	): void {
		this.clearRender();
		const widget = this.createWidget();
		widget.addClass('taskcompanion-current-unavailable');
		const tools = this.renderHeader(widget, null);
		this.createButton(tools, '选择任务', () => this.actions.openTaskPicker());
		const card = widget.createDiv({ cls: 'taskcompanion-current-card' });
		const executionTarget = card.createDiv({
			cls: 'taskcompanion-current-execution-target',
		});
		const row = executionTarget.createDiv({
			cls: 'taskcompanion-current-execution-row is-parent is-unavailable',
		});
		row.createSpan({ cls: 'taskcompanion-level-label', text: '母任务' });
		row.createEl('strong', {
			cls: 'taskcompanion-current-missing-message',
			text: message,
		});
		this.renderInlineTimer(card);
		this.renderCurrentMetrics(card, progress);
		this.renderFailureCount(widget, failureCount);
	}

	private renderCurrent(
		task: ParsedTask,
		progress: CurrentProgress,
		failureCount: number,
	): void {
		this.clearRender();
		const widget = this.createWidget();
		const tools = this.renderHeader(widget, null);
		this.createButton(tools, '选择任务', () => this.actions.openTaskPicker());
		const card = widget.createDiv({ cls: 'taskcompanion-current-card' });
		const selectedSubtaskId = this.services.timerService.getSubtaskId();
		const selectedSubtask = progress.subtasks.find(
			(subtask) => subtask.subtaskId === selectedSubtaskId,
		);
		const executionTarget = card.createDiv({
			cls: 'taskcompanion-current-execution-target',
		});
		const parentRow = executionTarget.createDiv({
			cls: 'taskcompanion-current-execution-row is-parent',
		});
		parentRow.createSpan({ cls: 'taskcompanion-level-label', text: '母任务' });
		const title = parentRow.createEl('button', {
			text: currentExecutionTaskTitle(task.text),
			cls: 'taskcompanion-current-title-button',
		});
		title.type = 'button';
		this.bindButton(title, () => this.actions.focusTask(task));
		const titleActions = parentRow.createDiv({ cls: 'taskcompanion-inline-icons' });
		this.createIconButton(titleActions, 'link-2', '打开任务来源', () =>
			this.actions.openTaskSource(task),
		);
		this.createIconButton(titleActions, 'circle-check', '完成母任务', () =>
			this.completeCurrentParentAndRefresh(task),
		);
		if (selectedSubtask?.status === 'active') {
			const child = executionTarget.createDiv({
				cls: 'taskcompanion-current-execution-row is-child',
			});
			child.createSpan({ cls: 'taskcompanion-level-label', text: '子任务' });
			child.createEl('strong', { text: selectedSubtask.title });
			const childActions = child.createDiv({
				cls: 'taskcompanion-inline-icons taskcompanion-child-actions',
			});
			const sourcePlaceholder = childActions.createSpan({
				cls: 'taskcompanion-icon-placeholder',
			});
			sourcePlaceholder.setAttr('aria-hidden', 'true');
			this.createIconButton(childActions, 'circle-check', '完成子任务', () =>
				this.completeCurrentAndRefresh(task),
			);
		}

		this.renderInlineTimer(card);
		this.renderCurrentMetrics(card, progress);
		this.renderFailureCount(widget, failureCount);
	}

	private renderInlineTimer(card: HTMLElement): void {
		const timer = card.createDiv({ cls: 'taskcompanion-inline-timer' });
		this.currentTimerStatusEl = timer.createSpan({ cls: 'taskcompanion-timer-status' });
		this.currentTimerValueEl = timer.createEl('button', {
			cls: 'taskcompanion-inline-time-button',
		});
		(this.currentTimerValueEl as HTMLButtonElement).type = 'button';
		this.bindButton(this.currentTimerValueEl as HTMLButtonElement, () =>
			this.toggleTimer(),
		);
		const timerTools = timer.createDiv({ cls: 'taskcompanion-timer-tools' });
		this.createIconButton(timerTools, 'settings-2', '设置专注模式', () =>
			this.toggleTimerSettings(card),
		);
		this.createIconButton(timerTools, 'square', '结束本次计时', () =>
			this.finishTimer(),
		);
		this.createIconButton(timerTools, 'rotate-ccw', '重置计时器', () =>
			this.services.timerService.reset(),
		);
		this.updateCurrentTimer();
	}

	private renderCurrentMetrics(
		card: HTMLElement,
		progress: CurrentProgress | null,
	): void {
		const metrics = card.createDiv({ cls: 'taskcompanion-metrics' });
		this.currentInvestmentValueEl = this.createMetric(
			metrics,
			'投入',
			formatDuration(progress?.totalActiveDurationSeconds ?? 0),
		);
		if ((progress?.totalSubtasks ?? 0) > 0) {
			this.currentSubtaskValueEl = this.createMetric(
				metrics,
				'子任务',
				`${progress?.completedSubtasks ?? 0} / ${progress?.totalSubtasks ?? 0}`,
			);
		}
		this.currentSessionCountValueEl = this.createMetric(
			metrics,
			'执行记录',
			`${progress?.totalSessionCount ?? 0} 次`,
			() => this.actions.openSessionHistory(),
		);
	}

	private renderTasks(tasks: SelectedTask[], failureCount: number): void {
		this.clearRender();
		const widget = this.createWidget();
		this.renderHeader(widget, `${tasks.length} 项`);
		if (tasks.length === 0) {
			widget.createEl('p', {
				cls: 'taskcompanion-empty-state',
				text: '当前没有符合此组件规则的任务。',
			});
		}
		const list = widget.createDiv({ cls: 'taskcompanion-card-list' });
		for (const selected of tasks) this.renderTaskCard(list, selected);
		this.renderFailureCount(widget, failureCount);
	}

	private renderTaskCard(container: HTMLElement, selected: SelectedTask): void {
		const card = container.createDiv({ cls: 'taskcompanion-task-card' });
		this.createCompletionCheckbox(card, false, `完成任务：${removeTrailingTaskId(selected.task.text)}`, () =>
			this.completeAndRefresh(selected),
		);
		const content = card.createDiv({ cls: 'taskcompanion-task-content' });
		const title = content.createEl('button', {
			text: removeTrailingTaskId(selected.task.text),
			cls: 'taskcompanion-task-title-button',
		});
		title.type = 'button';
		this.bindButton(title, () => this.actions.focusTask(selected));
		const actions = card.createDiv({ cls: 'taskcompanion-card-actions' });
		this.createIconButton(actions, 'link-2', '打开任务来源', () =>
			this.actions.openTaskSource(selected),
		);
	}

	private renderReviews(reviews: ReviewEvent[]): void {
		this.clearRender();
		const pending = reviews.filter((review) => review.reviewStatus === 'pending');
		const todayCompleted = reviewsCompletedOnLocalDay(reviews, new Date());
		const widget = this.createWidget();
		this.renderHeader(widget, `待复盘 ${pending.length}`);
		const summary = widget.createDiv({ cls: 'taskcompanion-review-summary' });
		this.createMetric(summary, '待复盘', `${pending.length}`);
		this.createMetric(summary, '今日已完成', `${todayCompleted.length}`, () =>
			this.actions.openReviewQueue('today'),
		);
		if (pending.length === 0) {
			widget.createEl('p', {
				cls: 'taskcompanion-empty-state',
				text: '当前没有待复盘任务。',
			});
		}
		const list = widget.createDiv({ cls: 'taskcompanion-card-list' });
		for (const review of pending.slice(0, 5)) {
			const card = list.createDiv({ cls: 'taskcompanion-task-card' });
			this.createCompletionCheckbox(card, true, `撤销完成：${review.taskTitle}`, () =>
				this.reopenReviewAndRefresh(review),
			);
			const content = card.createDiv({ cls: 'taskcompanion-task-content' });
			const title = content.createEl('button', {
				text: `${review.targetType === 'subtask' ? '子任务' : '母任务'}：${review.taskTitle}`,
				cls: 'taskcompanion-task-title-button',
			});
			title.type = 'button';
			this.bindButton(title, () => this.actions.openReview(review));
			const actions = card.createDiv({ cls: 'taskcompanion-card-actions' });
			this.createIconButton(actions, 'link-2', '打开任务来源', () =>
				this.actions.openTaskSource({
					id: review.taskId,
					text: review.taskTitle,
					raw: '',
					sourcePath: review.sourcePath,
					lineNumber: review.sourceLineNumber,
					checked: true,
					cancelled: false,
					priority: null,
					hasRecurrence: false,
					start: null,
					scheduled: null,
					due: null,
					recurrence: null,
					completion: null,
					blockId: review.taskId,
				}),
			);
		}
	}

	private renderShell(message: string, error = false): void {
		this.clearRender();
		const widget = this.createWidget();
		this.renderHeader(widget, null);
		widget.createEl('p', {
			cls: error ? 'taskcompanion-error-state' : 'taskcompanion-loading-state',
			text: message,
		});
	}

	private createWidget(): HTMLElement {
		return this.containerEl.createDiv({ cls: 'taskcompanion-widget' });
	}

	private renderHeader(widget: HTMLElement, badgeText: string | null): HTMLElement {
		const header = widget.createDiv({ cls: 'taskcompanion-widget-header' });
		header.createEl('h3', { text: embeddedViewTitle(this.view) });
		const tools = header.createDiv({ cls: 'taskcompanion-widget-tools' });
		if (badgeText) tools.createSpan({ cls: 'taskcompanion-badge', text: badgeText });
		if (this.view !== 'current') {
			this.createButton(
				tools,
				'刷新',
				() => this.refresh(),
				false,
				'taskcompanion-refresh-button',
			);
		}
		return tools;
	}

	private createMetric(
		container: HTMLElement,
		label: string,
		value: string,
		action?: () => void,
	): HTMLElement {
		const metric = container.createDiv({ cls: 'taskcompanion-metric' });
		if (action) {
			metric.addClass('is-clickable');
			metric.setAttr('role', 'button');
			metric.setAttr('tabindex', '0');
			const activate = (): void => {
				try {
					action();
				} catch {
					new Notice('Task companion 组件操作失败。');
				}
			};
			const handleKeydown = (event: KeyboardEvent): void => {
				if (event.key !== 'Enter' && event.key !== ' ') return;
				event.preventDefault();
				activate();
			};
			metric.addEventListener('click', activate);
			metric.addEventListener('keydown', handleKeydown);
			this.renderCleanups.push(() => {
				metric.removeEventListener('click', activate);
				metric.removeEventListener('keydown', handleKeydown);
			});
		}
		metric.createSpan({ cls: 'taskcompanion-metric-label', text: label });
		return metric.createEl('strong', { text: value });
	}

	private createIconButton(
		container: HTMLElement,
		icon: string,
		accessibleLabel: string,
		action: () => void | boolean | Promise<void | boolean>,
	): HTMLButtonElement {
		const button = container.createEl('button', {
			cls: 'taskcompanion-icon-button',
		});
		button.type = 'button';
		setIcon(button, icon);
		button.setAttr('aria-label', accessibleLabel);
		button.setAttr('title', accessibleLabel);
		this.bindButton(button, action);
		return button;
	}

	private bindButton(
		button: HTMLButtonElement,
		action: () => void | boolean | Promise<void | boolean>,
	): void {
		const listener = (): void => {
			try {
				void Promise.resolve(action()).catch(() => {
					new Notice('Task companion 组件操作失败。');
				});
			} catch {
				new Notice('Task companion 组件操作失败。');
			}
		};
		button.addEventListener('click', listener);
		this.renderCleanups.push(() => button.removeEventListener('click', listener));
	}

	private createButton(
		container: HTMLElement,
		label: string,
		action: () => void | boolean | Promise<void | boolean>,
		primary = false,
		extraClass = '',
	): HTMLButtonElement {
		const button = container.createEl('button', {
			text: label,
			cls: [
				'taskcompanion-button',
				primary ? 'taskcompanion-button-primary' : '',
				extraClass,
			]
				.filter(Boolean)
				.join(' '),
		});
		button.type = 'button';
		this.bindButton(button, action);
		return button;
	}

	private createCompletionCheckbox(
		container: HTMLElement,
		checked: boolean,
		accessibleLabel: string,
		action: () => void | boolean | Promise<void | boolean>,
	): HTMLInputElement {
		const checkbox = container.createEl('input', {
			type: 'checkbox',
			cls: 'taskcompanion-completion-checkbox',
		});
		checkbox.checked = checked;
		checkbox.setAttr('aria-label', accessibleLabel);
		checkbox.setAttr('title', accessibleLabel);
		const listener = (): void => {
			if (checkbox.checked === checked) return;
			checkbox.disabled = true;
			void Promise.resolve(action())
				.then((succeeded) => {
					if (succeeded === false) checkbox.checked = checked;
				})
				.catch(() => {
					checkbox.checked = checked;
					new Notice('Task companion 组件操作失败。');
				})
				.finally(() => {
					checkbox.disabled = false;
				});
		};
		checkbox.addEventListener('change', listener);
		this.renderCleanups.push(() => checkbox.removeEventListener('change', listener));
		return checkbox;
	}

	private async completeAndRefresh(
		task: SelectedTask | ParsedTask,
	): Promise<boolean> {
		const completed = await this.actions.completeTask(task);
		if (completed) this.taskLoader.notifyChanged();
		return completed;
	}

	private async completeCurrentAndRefresh(task: ParsedTask): Promise<boolean> {
		const completed = await this.actions.completeCurrentTarget(task);
		if (completed) this.taskLoader.notifyChanged();
		return completed;
	}

	private async completeCurrentParentAndRefresh(
		task: ParsedTask,
	): Promise<boolean> {
		const completed = await this.actions.completeCurrentParent(task);
		if (completed) this.taskLoader.notifyChanged();
		return completed;
	}

	private async reopenReviewAndRefresh(review: ReviewEvent): Promise<boolean> {
		const reopened = await this.actions.reopenReview(review);
		if (reopened) this.taskLoader.notifyChanged();
		return reopened;
	}

	private toggleTimer(): void {
		const timer = this.services.timerService;
		const state = timer.getState();
		if (state.status === 'running') {
			timer.pause(Date.now());
			return;
		}
		if (state.status === 'paused') {
			timer.resume(Date.now());
			return;
		}
		const preference = this.actions.getTimerPreference();
		const duration =
			preference.mode === 'custom' ? preference.customMinutes * 60 : undefined;
		timer.start(preference.mode, Date.now(), duration);
	}

	private finishTimer(): void {
		const state = this.services.timerService.getState();
		if (state.status === 'running' || state.status === 'paused') {
			this.services.timerService.finishEarly(Date.now());
		}
	}

	private toggleTimerSettings(card: HTMLElement): void {
		const existing = card.querySelector('.taskcompanion-inline-timer-settings');
		if (existing) {
			existing.remove();
			return;
		}
		const preference = this.actions.getTimerPreference();
		const panel = card.createDiv({ cls: 'taskcompanion-inline-timer-settings' });
		const mode = panel.createEl('select');
		for (const [value, label] of [
			['focus-25', '25 分钟'],
			['focus-50', '50 分钟'],
			['custom', '自由计时'],
		] as const) {
			mode.createEl('option', { value, text: label });
		}
		mode.value = preference.mode;
		const customRow = panel.createDiv({ cls: 'taskcompanion-custom-duration-row' });
		customRow.createSpan({ text: '自由时长（分钟）' });
		const custom = customRow.createEl('input', { type: 'number' });
		custom.min = '1';
		custom.max = '1440';
		custom.value = String(preference.customMinutes);
		const confirm = panel.createEl('button', {
			cls: 'taskcompanion-button taskcompanion-button-primary taskcompanion-timer-confirm-button',
			text: '确定',
		});
		confirm.type = 'button';
		const updateVisibility = (): void => {
			customRow.toggleClass('is-hidden', mode.value !== 'custom');
		};
		let saving = false;
		const setSaving = (next: boolean): void => {
			saving = next;
			mode.disabled = next;
			custom.disabled = next;
			confirm.disabled = next;
			confirm.setText(next ? '保存中…' : '确定');
		};
		const save = async (): Promise<void> => {
			if (saving) return;
			const minutes = Number(custom.value);
			if (
				mode.value === 'custom' &&
				(!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 1_440)
			) {
				new Notice('请输入 1–1440 之间的整数分钟。');
				custom.focus();
				custom.select();
				return;
			}
			setSaving(true);
			try {
				await this.actions.saveTimerPreference(
					mode.value as TimerMode,
					mode.value === 'custom' ? minutes : preference.customMinutes,
				);
				this.updateCurrentTimer();
				panel.remove();
			} catch {
				new Notice('计时设置保存失败，请重试。');
				if (panel.isConnected) setSaving(false);
			}
		};
		mode.addEventListener('change', () => {
			updateVisibility();
		});
		custom.addEventListener('keydown', (event) => {
			if (event.key !== 'Enter') return;
			event.preventDefault();
			void save();
		});
		confirm.addEventListener('click', () => void save());
		updateVisibility();
	}

	private renderFailureCount(widget: HTMLElement, count: number): void {
		if (count === 0) return;
		widget.createEl('p', {
			cls: 'taskcompanion-partial-warning',
			text: `已跳过 ${count} 个无法安全处理的任务位置。`,
		});
	}

	private clearRender(): void {
		for (const cleanup of this.renderCleanups.splice(0)) cleanup();
		this.currentTimerStatusEl = null;
		this.currentTimerValueEl = null;
		this.currentInvestmentValueEl = null;
		this.currentSubtaskValueEl = null;
		this.currentSessionCountValueEl = null;
		this.currentMetricUpdateGeneration += 1;
		this.containerEl.empty();
	}

	private handleTimerChange(): void {
		if (this.disposed || this.view !== 'current') return;
		this.updateCurrentTimer();
		const contextKey = this.timerContextKey();
		if (contextKey !== this.currentContextKey) {
			this.currentContextKey = contextKey;
			void this.refresh();
		}
	}

	private handleTaskDataChange(taskId: string): void {
		if (
			this.disposed ||
			this.view !== 'current' ||
			this.services.timerService.getTaskId() !== taskId
		) {
			return;
		}
		void this.refresh();
	}

	private handleSessionDataChange(taskId: string): void {
		if (
			this.disposed ||
			this.view !== 'current' ||
			this.services.timerService.getTaskId() !== taskId
		) {
			return;
		}
		void this.updateCurrentMetrics(taskId);
	}

	private async updateCurrentMetrics(taskId: string): Promise<void> {
		const updateGeneration = ++this.currentMetricUpdateGeneration;
		const renderGeneration = this.generation;
		try {
			const sessions = await this.services.sessionService.history(taskId);
			const progress = await this.services.subtaskService.progress(taskId, sessions);
			if (
				updateGeneration !== this.currentMetricUpdateGeneration ||
				!this.isCurrent(renderGeneration) ||
				this.services.timerService.getTaskId() !== taskId
			) {
				return;
			}
			this.currentInvestmentValueEl?.setText(
				formatDuration(progress.totalActiveDurationSeconds),
			);
			this.currentSubtaskValueEl?.setText(
				`${progress.completedSubtasks} / ${progress.totalSubtasks}`,
			);
			this.currentSessionCountValueEl?.setText(
				`${progress.totalSessionCount} 次`,
			);
		} catch {
			// Keep the last visible metrics; a later durable-write notice will retry.
		}
	}

	private timerContextKey(): string {
		return [
			this.services.timerService.getTaskId() ?? '',
			this.services.timerService.getSubtaskId() ?? '',
		].join('|');
	}

	private updateCurrentTimer(): void {
		if (!this.currentTimerStatusEl || !this.currentTimerValueEl) return;
		const state = this.services.timerService.getState();
		const label = state.status === 'idle'
			? '点击时间开始'
			: state.status === 'ready'
				? state.purpose === 'break'
					? '休息已准备 · 点击开始'
					: '专注已准备 · 点击开始'
			: state.status === 'running'
				? state.purpose === 'break'
					? '正在休息 · 点击暂停'
					: '正在专注 · 点击暂停'
				: state.status === 'paused'
					? state.purpose === 'break'
						? '休息已暂停 · 点击继续'
						: '已暂停 · 点击继续'
					: state.purpose === 'break'
						? '休息已结束'
						: '本次已结束 · 点击重新开始';
		this.currentTimerStatusEl.setText(label);
		this.currentTimerValueEl.toggleClass(
			'is-running',
			state.status === 'running',
		);
		const preference = this.actions.getTimerPreference();
		const idleSeconds =
			preference.mode === 'focus-50'
				? 3_000
				: preference.mode === 'custom'
					? preference.customMinutes * 60
					: 1_500;
		this.currentTimerValueEl.setText(
			state.status === 'idle'
				? formatTimer(idleSeconds)
				: formatTimer(this.services.timerService.getRemainingSeconds(Date.now())),
		);
	}

	private isCurrent(generation: number): boolean {
		return !this.disposed && generation === this.generation;
	}
}

function removeTrailingTaskId(text: string): string {
	return text.replace(/\s+\^tc-[0-9a-f]{6}\s*$/u, '');
}

function currentExecutionTaskTitle(text: string): string {
	return removeTrailingTaskId(text)
		.replace(/\s*(?:➕|🛫|⏳|📅|✅|❌)\s*\d{4}-\d{2}-\d{2}/gu, '')
		.replace(/\s{2,}/gu, ' ')
		.trim();
}

function formatDuration(seconds: number): string {
	return `${Math.floor(Math.max(0, seconds) / 60)}分钟`;
}

function formatTimer(seconds: number): string {
	const safeSeconds = Math.max(0, seconds);
	const minutes = Math.floor(safeSeconds / 60);
	const remainder = safeSeconds % 60;
	return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function formatLocalDate(date: Date): string {
	return [
		String(date.getFullYear()).padStart(4, '0'),
		String(date.getMonth() + 1).padStart(2, '0'),
		String(date.getDate()).padStart(2, '0'),
	].join('-');
}
