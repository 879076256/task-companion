import { MarkdownView, Modal, Notice, Plugin, TFile } from 'obsidian';
import { ConsoleLogSink } from './adapters/console-log-sink';
import { ObsidianSessionVault } from './adapters/obsidian/obsidian-session-vault';
import { ObsidianSubtaskVault } from './adapters/obsidian/obsidian-subtask-vault';
import { ObsidianTaskVault } from './adapters/obsidian/obsidian-task-vault';
import { ObsidianReviewVault } from './adapters/obsidian/obsidian-review-vault';
import { ObsidianScriptVault } from './adapters/obsidian/obsidian-script-vault';
import { TaskScanner } from './adapters/tasks/task-scanner';
import {
	PLUGIN_NAME,
	COMPLETE_TASK_COMMAND_ID,
	MANAGE_SUBTASKS_COMMAND_ID,
	MANAGE_CONTROLLED_SCRIPTS_COMMAND_ID,
	QUICK_PROGRESS_COMMAND_ID,
	RETRY_SESSION_WRITES_COMMAND_ID,
	RETRY_REVIEW_WRITES_COMMAND_ID,
	REVIEW_QUEUE_COMMAND_ID,
	SELECT_TASK_COMMAND_ID,
	SESSION_HISTORY_COMMAND_ID,
	TEST_COMMAND_ID,
	TIMER_COMMAND_ID,
} from './core/plugin-constants';
import {
	TASK_COMPANION_API_VERSION,
	TaskCompanionApiV1,
} from './core/extensions/api';
import {
	ExtensionEventBus,
	ExtensionEventEnvelope,
	ExtensionEventMap,
	ExtensionEventName,
} from './core/extensions/events';
import {
	createQuickExecutionSession,
	ExecutionSession,
	SessionReflection,
} from './core/sessions/model';
import type { ReviewEvent } from './core/reviews/model';
import { createSubtaskReviewEvent } from './core/reviews/subtask-review';
import type { Subtask } from './core/subtasks/model';
import type { FinishedTimerState, TimerState } from './core/timer/model';
import { resolvePomodoroCompletion } from './core/timer/pomodoro-cycle';
import type { ParsedTask, SelectedTask } from './core/tasks/task-rules';
import { buildHomeReminderGroups } from './core/dashboard/home-reminders';
import { resolveTaskSelectionAction } from './core/tasks/task-selection';
import { ErrorLogger } from './services/error-logger';
import { DashboardTaskService } from './services/dashboard-task-service';
import { SessionRepository } from './services/session-repository';
import { SessionService } from './services/session-service';
import { ReviewRepository } from './services/review-repository';
import { ReviewService } from './services/review-service';
import { SubtaskRepository } from './services/subtask-repository';
import { SubtaskService } from './services/subtask-service';
import { TimerService } from './services/timer-service';
import { TemplateRepository } from './services/template-repository';
import { TemplateService } from './services/template-service';
import { ControlledScriptService } from './services/controlled-script-service';
import {
	OutstandingSubtaskResolution,
	TaskCompletionService,
} from './services/task-completion-service';
import {
	DEFAULT_SETTINGS,
	normalizeSettings,
	TaskCompanionSettings,
} from './settings/model';
import { TaskCompanionSettingTab } from './settings/settings-tab';
import { StatusModal } from './ui/status-modal';
import { ExecutionTargetModal } from './ui/execution-target-modal';
import { HierarchicalTaskPickerModal } from './ui/hierarchical-task-picker-modal';
import { OutstandingSubtasksModal } from './ui/outstanding-subtasks-modal';
import { ReviewModal } from './ui/review-modal';
import { ReviewQueueModal } from './ui/review-queue-modal';
import { SessionHistoryModal } from './ui/session-history-modal';
import { SessionReflectionModal } from './ui/session-reflection-modal';
import { SubtaskManagerModal } from './ui/subtask-manager-modal';
import { TimerControlModal } from './ui/timer-control-modal';
import { TimerCompletionNotifier } from './ui/timer-completion-notifier';
import { registerEmbeddedCodeBlocks } from './ui/embedded-code-block';
import { TaskSelectionModal } from './ui/task-selection-modal';
import { TemplateDecisionModal } from './ui/template-decision-modal';
import { TemplateSuggestionModal } from './ui/template-suggestion-modal';
import { ScriptManagerModal } from './ui/script-manager-modal';

const EMPTY_SESSION_REFLECTION: SessionReflection = {
	completedWork: null,
	nextAction: null,
	blockerReason: null,
};

export default class TaskCompanionPlugin extends Plugin {
	settings: TaskCompanionSettings = DEFAULT_SETTINGS;
	public api: TaskCompanionApiV1 | null = null;

	private readonly activeModals = new Set<Modal>();
	private readonly logger = new ErrorLogger(new ConsoleLogSink());
	private timerService: TimerService | null = null;
	private timerCompletionNotifier: TimerCompletionNotifier | null = null;
	private taskScanner: TaskScanner | null = null;
	private dashboardTaskService: DashboardTaskService | null = null;
	private sessionService: SessionService | null = null;
	private subtaskService: SubtaskService | null = null;
	private reviewService: ReviewService | null = null;
	private completionService: TaskCompletionService | null = null;
	private templateService: TemplateService | null = null;
	private controlledScriptService: ControlledScriptService | null = null;
	private readonly extensionEvents = new ExtensionEventBus();
	private saveChain: Promise<void> = Promise.resolve();
	private unloading = false;

	async onload(): Promise<void> {
		this.unloading = false;
		try {
			const saved: unknown = await this.loadData();
			this.settings = normalizeSettings(saved);
			this.timerService = new TimerService(this.logger);
			this.timerCompletionNotifier = new TimerCompletionNotifier(
				this.app,
				(scope, error) => this.logger.capture(scope, error),
			);
			this.taskScanner = new TaskScanner(new ObsidianTaskVault(this.app.vault));
			this.dashboardTaskService = new DashboardTaskService(this.taskScanner);
			this.sessionService = new SessionService(
				new SessionRepository(new ObsidianSessionVault(this.app.vault)),
				(pending) => this.savePluginData(pending),
			);
			this.subtaskService = new SubtaskService(
				new SubtaskRepository(new ObsidianSubtaskVault(this.app.vault)),
			);
			this.reviewService = new ReviewService(
				new ReviewRepository(new ObsidianReviewVault(this.app.vault)),
				() =>
					this.savePluginData(this.sessionService?.getPending() ?? []),
			);
			this.templateService = new TemplateService(
				new TemplateRepository(new ObsidianReviewVault(this.app.vault)),
			);
			this.controlledScriptService = new ControlledScriptService(
				new ObsidianScriptVault(this.app.vault),
				{
					notice: (message) => new Notice(message),
					openView: (view) => {
						if (view === 'task-picker') this.openCurrentTaskPicker();
						else if (view === 'review-queue') this.openReviewQueue();
						else this.openSessionHistory();
					},
				},
			);
			try {
				await this.controlledScriptService.initialize();
			} catch (error) {
				this.logger.capture('controlled script initialization', error);
				new Notice('受控扩展未能初始化；核心任务功能仍可使用。');
			}
			this.reviewService.setEligibilityChecker((review) =>
				this.isReviewEligible(review),
			);
			this.completionService = new TaskCompletionService(
				this.taskScanner,
				this.sessionService,
				this.subtaskService,
				this.reviewService,
			);
			// Restore task identity before timer state so an expired timer can be logged.
			if (isRecord(saved)) {
				this.sessionService.restorePending(saved.pendingSessionWrites);
				this.reviewService.restorePending(
					saved.pendingReviewEventWrites,
					saved.pendingReviewMarkdownWrites,
				);
				this.timerService.restoreTaskId(saved.selectedTaskId);
				this.timerService.restoreSubtaskId(saved.selectedSubtaskId);
			}
			if (this.sessionService.getPending().length > 0) {
				new Notice('Task companion 有待写入会话，正在重试。');
				await this.retryPendingSessions(false);
			}
			if (
				this.reviewService.getPendingEvents().length > 0 ||
				this.reviewService.getPendingMarkdown().length > 0
			) {
				new Notice('Task companion 有待写入复盘，正在重试。');
				await this.retryPendingReviews(false);
			}
			this.timerService.onSessionCompleted((session) => {
				void this.handleCompletedSession(session);
			});
			this.timerService.onTimerCompleted((state) => {
				this.handleCompletedTimer(state);
			});
			if (isRecord(saved)) {
				this.timerService.restore(
					saved.timerState,
					Date.now(),
				);
			}
			this.timerService.onPersistenceRequested(() => {
				void this.saveSettings();
			});
			// Live extension events begin only after recovery; startup retries are not replayed.
			this.installExtensionHooks();
			this.api = this.createPublicApi();

			// Settings tab
			this.addSettingTab(new TaskCompanionSettingTab(this.app, this));

			// Phase 1 test modal command
			this.addCommand({
				id: TEST_COMMAND_ID,
				name: 'Open test modal',
				callback: () => this.openStatusModal(),
			});

			this.addCommand({
				id: MANAGE_SUBTASKS_COMMAND_ID,
				name: 'Manage subtasks',
				callback: () => {
					const taskId = this.timerService?.getTaskId() ?? null;
					if (!taskId) {
						new Notice('请先选择一个母任务。');
						return;
					}
					void this.openSubtaskManagerForTaskId(taskId);
				},
			});

			this.addCommand({
				id: MANAGE_CONTROLLED_SCRIPTS_COMMAND_ID,
				name: 'Manage controlled extensions',
				callback: () => this.openScriptManager(),
			});

			this.addCommand({
				id: COMPLETE_TASK_COMMAND_ID,
				name: 'Complete task',
				callback: () => this.openTaskSelectionModal('complete'),
			});

			this.addCommand({
				id: REVIEW_QUEUE_COMMAND_ID,
				name: 'Open review queue',
				callback: () => this.openReviewQueue(),
			});

			this.addCommand({
				id: RETRY_REVIEW_WRITES_COMMAND_ID,
				name: 'Retry pending review writes',
				callback: () => {
					void this.retryPendingReviews(true);
				},
			});

			this.addCommand({
				id: QUICK_PROGRESS_COMMAND_ID,
				name: 'Record quick progress',
				callback: () => this.openTaskSelectionModal('quick'),
			});

			this.addCommand({
				id: SESSION_HISTORY_COMMAND_ID,
				name: 'Open session history',
				callback: () => this.openSessionHistory(),
			});

			this.addCommand({
				id: RETRY_SESSION_WRITES_COMMAND_ID,
				name: 'Retry pending session writes',
				callback: () => {
					void this.retryPendingSessions(true);
				},
			});

			this.addCommand({
				id: SELECT_TASK_COMMAND_ID,
				name: 'Select task for timer',
				callback: () => this.openCurrentTaskPicker(),
			});

			// Phase 2 timer control modal command
			this.addCommand({
				id: TIMER_COMMAND_ID,
				name: 'Open timer control',
				callback: () => this.openCurrentTimerControl(),
			});

			registerEmbeddedCodeBlocks(
				this,
				{
					taskScanner: this.taskScanner,
					dashboardTaskService: this.dashboardTaskService,
					timerService: this.timerService,
					sessionService: this.sessionService,
					subtaskService: this.subtaskService,
					reviewService: this.reviewService,
				},
				{
					openTimer: () => this.openCurrentTimerControl(),
					openTaskPicker: () => this.openCurrentTaskPicker(),
					openTaskSource: (task) => this.openTaskSource(task),
					focusTask: (task) => this.selectTask(task),
					completeTask: (task) => this.beginTaskCompletion(task),
					completeCurrentParent: (task) =>
						this.completeCurrentParent(task),
					completeCurrentTarget: (task) => this.completeCurrentTarget(task),
					reopenReview: (review) => this.reopenReview(review),
					openSessionHistory: () => this.openSessionHistory(),
					openReviewQueue: (scope) => this.openReviewQueue(scope),
					openReview: (review) => this.openReview(review),
					getTimerPreference: () => ({
						mode: this.settings.preferredTimerMode,
						customMinutes: this.settings.customTimerMinutes,
					}),
					saveTimerPreference: async (mode, customMinutes) => {
						this.settings.preferredTimerMode = mode;
						this.settings.customTimerMinutes = customMinutes;
						await this.saveSettings();
					},
				},
			);
		} catch (error) {
			this.logger.capture('plugin load', error);
		}
	}

	async saveSettings(): Promise<void> {
		try {
			await this.savePluginData(this.sessionService?.getPending() ?? []);
		} catch (error) {
			this.logger.capture('settings save', error);
		}
	}

	onunload(): void {
		this.unloading = true;
		for (const modal of Array.from(this.activeModals)) {
			modal.close();
		}
		this.activeModals.clear();
		this.timerService?.dispose();
		this.timerCompletionNotifier?.dispose();
		this.timerCompletionNotifier = null;
		this.extensionEvents.clear();
		this.api = null;
	}

	private openStatusModal(): void {
		const modal = new StatusModal(
			this.app,
			PLUGIN_NAME,
			this.settings.showTechnicalDetails,
			() => this.activeModals.delete(modal),
		);
		this.activeModals.add(modal);
		modal.open();
	}

	private openCurrentTimerControl(): void {
		const taskId = this.timerService?.getTaskId() ?? null;
		if (!taskId) {
			new Notice('请先选择任务，再开始计时。');
			this.openTaskSelectionModal();
			return;
		}
		void this.openTimerModal(taskId, taskId);
	}

	private openTaskSelectionModal(
		intent: 'timer' | 'quick' | 'complete' = 'timer',
	): void {
		if (!this.taskScanner) return;
		const modal = new TaskSelectionModal(
			this.app,
			this.taskScanner,
			formatLocalDate(new Date()),
			(task) => this.openTaskSource(task),
			(task) => {
				if (intent === 'quick') return this.recordQuickProgress(task);
				if (intent === 'complete') return this.beginTaskCompletion(task);
				return this.selectTask(task);
			},
			() => this.activeModals.delete(modal),
			intent === 'quick' ? '快速推进' : intent === 'complete' ? '完成任务' : '选择',
		);
		this.activeModals.add(modal);
		modal.open();
	}

	private openCurrentTaskPicker(): void {
		if (!this.taskScanner || !this.subtaskService) return;
		const modal = new HierarchicalTaskPickerModal(
			this.app,
			this.taskScanner,
			this.subtaskService,
			formatLocalDate(new Date()),
			(task) => this.openTaskSource(task),
			(task) => this.selectTask(task, () => this.openCurrentTaskPicker()),
			(task, subtaskId) => this.selectSubtaskDirect(task, subtaskId),
			(task) => this.beginTaskCompletion(task),
			() => this.activeModals.delete(modal),
		);
		this.activeModals.add(modal);
		modal.open();
	}

	private async selectSubtaskDirect(
		selected: SelectedTask,
		subtaskId: string,
	): Promise<boolean> {
		if (!this.timerService) return false;
		const state = this.timerService.getState();
		if (state.status === 'running' || state.status === 'paused') {
			if (
				this.timerService.getTaskId() === selected.task.id &&
				this.timerService.getSubtaskId() === subtaskId
			) {
				return true;
			}
			new Notice('请先结束当前计时，再切换执行目标。');
			return false;
		}
		this.timerService.bindTask(selected.task.id);
		this.timerService.bindSubtask(subtaskId);
		await this.saveSettings();
		this.emitExtensionEvent('task-selected', {
			taskId: selected.task.id,
			subtaskId,
			occurredAt: new Date().toISOString(),
		});
		return true;
	}

	private async beginTaskCompletion(
		selected: SelectedTask | ParsedTask,
	): Promise<boolean> {
		if (!this.completionService) return false;
		const task = taskValue(selected);
		const timerState = this.timerService?.getState();
		if (
			this.timerService?.getTaskId() === task.id &&
			(timerState?.status === 'running' || timerState?.status === 'paused')
		) {
			new Notice('请先结束当前任务的计时，再完成该任务。');
			return false;
		}
		try {
			const analysis = await this.completionService.analyze(selected);
			if (analysis.activeSubtasks.length === 0) {
				return this.completeSelectedTask(selected, null);
			}
			return await new Promise<boolean>((resolve) => {
				let completed = false;
				const modal = new OutstandingSubtasksModal(
					this.app,
					analysis.activeSubtasks,
					() =>
						this.openSubtaskManager(task.id, removeTrailingTaskId(task.text)),
					async (resolution) => {
						completed = await this.completeSelectedTask(selected, resolution);
						return completed;
					},
					() => {
						this.activeModals.delete(modal);
						resolve(completed);
					},
				);
				this.activeModals.add(modal);
				modal.open();
			});
		} catch (error) {
			this.logger.capture('task completion analysis', error);
			new Notice('无法读取任务执行档案；原任务未修改。');
			return false;
		}
	}

	private async completeCurrentTarget(task: ParsedTask): Promise<boolean> {
		if (!this.timerService || !this.subtaskService) return false;
		const timerState = this.timerService.getState();
		if (
			this.timerService.getTaskId() === task.id &&
			(timerState.status === 'running' || timerState.status === 'paused')
		) {
			new Notice('请先结束当前任务的计时，再完成执行目标。');
			return false;
		}
		const subtaskId = this.timerService.getSubtaskId();
		if (subtaskId) {
			try {
				const subtask = (await this.subtaskService.load(task.id)).subtasks.find(
					(candidate) =>
						candidate.subtaskId === subtaskId && candidate.status === 'active',
				);
				if (subtask) {
					await this.completeSubtask(task.id, subtask, Date.now());
					await this.openCompletionReflection(task.id, subtask.subtaskId);
					return true;
				}
			} catch (error) {
				this.logger.capture('current subtask completion', error);
				new Notice('子任务完成失败；原状态保持不变。');
				return false;
			}
		}
		const completed = await this.beginTaskCompletion(task);
		if (completed) await this.openCompletionReflection(task.id, null);
		return completed;
	}

	private async completeCurrentParent(task: ParsedTask): Promise<boolean> {
		const completed = await this.beginTaskCompletion(task);
		if (completed) await this.openCompletionReflection(task.id, null);
		return completed;
	}

	private async completeSelectedTask(
		selected: SelectedTask | ParsedTask,
		resolution: OutstandingSubtaskResolution | null,
	): Promise<boolean> {
		if (!this.completionService) return false;
		try {
			const result = await this.completionService.complete(
				selected,
				resolution,
				Date.now(),
			);
			const task = taskValue(selected);
			if (this.timerService?.getTaskId() === task.id) {
				this.timerService.clearTask();
				await this.saveSettings();
			}
			if (result.reviewIndexWritePending) {
				new Notice('任务已完成；待复盘记录写入失败，已保留待重试。');
			} else {
				new Notice('任务已完成，并已加入待复盘队列。');
			}
			this.emitExtensionEvent('task-completed', {
				taskId: task.id,
				subtaskId: null,
				occurredAt: new Date().toISOString(),
			});
			return true;
		} catch (error) {
			this.logger.capture('task completion', error);
			new Notice('任务完成失败；原任务保持未完成。');
			return false;
		}
	}

	private async openTimerModal(
		taskLabel: string | null,
		taskId: string | null,
	): Promise<void> {
		if (!this.timerService) return;
		let nextAction: string | null = null;
		let executionTargetLabel: string | null = this.timerService.getSubtaskId()
			? '已绑定子任务'
			: '母任务';
		let progress = null;
		if (taskId && this.sessionService) {
			try {
				const sessions = await this.sessionService.history(taskId);
				if (this.subtaskService) {
					progress = await this.subtaskService.progress(taskId, sessions);
					nextAction = progress.currentNextTitle;
					const selectedSubtaskId = this.timerService.getSubtaskId();
					const selectedSubtask = progress.subtasks.find(
						(subtask) => subtask.subtaskId === selectedSubtaskId,
					);
					if (selectedSubtask?.status === 'active') {
						executionTargetLabel = selectedSubtask.title;
					} else if (selectedSubtaskId !== null) {
						this.timerService.bindSubtask(null);
						await this.saveSettings();
					}
				}
				if (!nextAction) {
					nextAction = await this.sessionService.getCurrentNextAction(taskId);
				}
			} catch (error) {
				this.logger.capture('current next action read', error);
				new Notice('当前下一步读取失败；仍可继续计时。');
			}
		}
		const modal = new TimerControlModal(
			this.app,
			this.timerService,
			taskLabel,
			nextAction,
			executionTargetLabel,
			progress,
			taskId
				? () =>
						this.openSubtaskManager(taskId, taskLabel ?? '当前任务')
				: null,
			() => this.activeModals.delete(modal),
		);
		this.activeModals.add(modal);
		modal.open();
	}

	private async openTaskSource(selected: SelectedTask | ParsedTask): Promise<void> {
		const task = 'task' in selected ? selected.task : selected;
		await this.openSourceAt(task.sourcePath, task.lineNumber);
	}

	private async selectTask(
		selected: SelectedTask | ParsedTask,
		onBack: (() => void) | null = null,
	): Promise<boolean> {
		if (!this.timerService) return false;
		const task = taskValue(selected);
		const state = this.timerService.getState();
		const action = resolveTaskSelectionAction(
			state.status,
			this.timerService.getTaskId(),
			task.id,
		);
		if (action === 'reject-switch') {
			new Notice('请先结束当前计时，再选择其他任务。');
			return false;
		}
		if (action === 'open-current') {
			if (state.status === 'running' || state.status === 'paused') {
				new Notice('该任务正在计时，可直接在“当前任务”卡片操作。');
			} else {
				await this.chooseExecutionTarget(selected, 'timer', onBack);
			}
			return true;
		}
		this.timerService.bindTask(task.id);
		await this.chooseExecutionTarget(selected, 'timer', onBack);
		return true;
	}

	private async recordQuickProgress(selected: SelectedTask): Promise<boolean> {
		await this.chooseExecutionTarget(selected, 'quick');
		return true;
	}

	private async recordQuickProgressForTarget(
		selected: SelectedTask | ParsedTask,
		subtaskId: string | null,
	): Promise<void> {
		const task = taskValue(selected);
		const session = createQuickExecutionSession(
			task.id,
			Date.now(),
			crypto.randomUUID(),
			subtaskId,
		);
		await this.handleCompletedSession(session);
	}

	private async chooseExecutionTarget(
		selected: SelectedTask | ParsedTask,
		intent: 'timer' | 'quick',
		onBack: (() => void) | null = null,
	): Promise<void> {
		if (!this.subtaskService || !this.timerService) return;
		const task = taskValue(selected);
		const plan = await this.subtaskService.load(task.id);
		const execute = async (subtaskId: string | null): Promise<void> => {
			this.emitExtensionEvent('task-selected', {
				taskId: task.id,
				subtaskId,
				occurredAt: new Date().toISOString(),
			});
			if (intent === 'quick') {
				await this.recordQuickProgressForTarget(selected, subtaskId);
				return;
			}
			this.timerService?.bindSubtask(subtaskId);
			await this.saveSettings();
			new Notice('执行目标已设置，点击当前任务卡片中的时间即可开始。');
		};
		const modal = new ExecutionTargetModal(
			this.app,
			removeTrailingTaskId(task.text),
			plan,
			intent === 'quick' ? '快速推进' : '选择',
			execute,
			this.subtaskService,
			() => {
				const state = this.timerService?.getState();
				return state?.status === 'running' || state?.status === 'paused';
			},
			(subtask, nowMs) => this.completeSubtask(task.id, subtask, nowMs),
			(subtask) => this.deleteSubtask(task.id, subtask),
			this.templateService
				? () => {
						modal.close();
						void this.openTemplateSuggestions(selected, intent, onBack);
					}
				: null,
			onBack,
			() => this.activeModals.delete(modal),
		);
		this.activeModals.add(modal);
		modal.open();
	}

	private openSubtaskManager(
		taskId: string,
		taskTitle = '当前任务',
		onBack: (() => void) | null = null,
	): void {
		if (!this.subtaskService || !this.sessionService) return;
		const modal = new SubtaskManagerModal(
			this.app,
			taskId,
			taskTitle,
			this.subtaskService,
			() => this.sessionService?.history(taskId) ?? Promise.resolve([]),
			() => {
				const state = this.timerService?.getState();
				return state?.status === 'running' || state?.status === 'paused';
			},
			(subtask, nowMs) => this.completeSubtask(taskId, subtask, nowMs),
			(subtask) => this.deleteSubtask(taskId, subtask),
			onBack,
			() => this.activeModals.delete(modal),
		);
		this.activeModals.add(modal);
		modal.open();
	}

	private async deleteSubtask(taskId: string, subtask: Subtask): Promise<void> {
		if (
			!this.timerService ||
			!this.sessionService ||
			!this.reviewService ||
			!this.subtaskService
		) {
			throw new Error('Task Companion services are unavailable.');
		}
		const isCurrentTarget =
			this.timerService.getTaskId() === taskId &&
			this.timerService.getSubtaskId() === subtask.subtaskId;
		if (isCurrentTarget) {
			const state = this.timerService.getState();
			if (state.status === 'running' || state.status === 'paused') {
				this.timerService.reset();
			}
			this.timerService.bindSubtask(null);
			await this.saveSettings();
		}
		try {
			await this.sessionService.purgeSubtask(taskId, subtask.subtaskId);
			await this.reviewService.purgeSubtask(taskId, subtask.subtaskId);
			await this.subtaskService.purgeSubtask(taskId, subtask.subtaskId);
			await this.saveSettings();
			new Notice('子任务及其执行记录已删除。');
		} catch (error) {
			this.logger.capture('subtask permanent deletion', error);
			throw error;
		}
	}

	private async openSubtaskManagerForTaskId(taskId: string): Promise<void> {
		try {
			const task = (await this.taskScanner?.scan())?.tasks.find(
				(candidate) => candidate.id === taskId,
			)?.parsed;
			this.openSubtaskManager(
				taskId,
				task ? removeTrailingTaskId(task.text) : '当前任务',
			);
		} catch (error) {
			this.logger.capture('subtask parent read', error);
			new Notice('无法读取当前母任务。');
		}
	}

	private async completeSubtask(
		taskId: string,
		subtask: Subtask,
		nowMs: number,
	): Promise<boolean> {
		if (!this.subtaskService || !this.sessionService || !this.reviewService) {
			return false;
		}
		const timerState = this.timerService?.getState();
		if (
			this.timerService?.getTaskId() === taskId &&
			this.timerService.getSubtaskId() === subtask.subtaskId &&
			(timerState?.status === 'running' || timerState?.status === 'paused')
		) {
			throw new Error('Finish the active timer before completing its subtask.');
		}
		const parentTask = (await this.taskScanner?.scan())?.tasks.find(
			(candidate) => candidate.id === taskId,
		)?.parsed;
		if (!parentTask) throw new Error('Parent task is unavailable.');
		const [sessions, plan, alreadyPending] = await Promise.all([
			this.sessionService.history(taskId),
			this.subtaskService.load(taskId),
			this.reviewService.hasPendingSubtask(taskId, subtask.subtaskId),
		]);
		const event = alreadyPending
			? null
			: createSubtaskReviewEvent(parentTask, subtask, sessions, plan, nowMs);
		if (event) await this.reviewService.prepareEvent(event);
		try {
			await this.subtaskService.complete(taskId, subtask.subtaskId, nowMs);
		} catch (error) {
			if (event) await this.reviewService.discardPrepared(event.eventId);
			throw error;
		}
		if (
			this.timerService?.getTaskId() === taskId &&
			this.timerService.getSubtaskId() === subtask.subtaskId
		) {
			this.timerService.bindSubtask(null);
			await this.saveSettings();
		}
		if (!event) return true;
		try {
			await this.reviewService.commitPrepared(event.eventId);
			new Notice('子任务已完成，已加入复盘列表。');
		} catch (error) {
			this.logger.capture('subtask review queue append', error);
			new Notice('子任务已完成；复盘记录已保留待重试。');
		}
		return true;
	}

	private async isReviewEligible(review: ReviewEvent): Promise<boolean> {
		if (review.targetType === 'task') {
			if (!this.taskScanner) return false;
			try {
				return await this.taskScanner.isCompleted({
					id: review.taskId,
					sourcePath: review.sourcePath,
				});
			} catch {
				return false;
			}
		}
		if (!review.subtaskId || !this.subtaskService) return false;
		try {
			return (await this.subtaskService.load(review.taskId)).subtasks.some(
				(subtask) =>
					subtask.subtaskId === review.subtaskId &&
					subtask.status === 'completed',
			);
		} catch {
			return false;
		}
	}

	private async handleCompletedSession(session: ExecutionSession): Promise<void> {
		if (!this.sessionService) return;
		try {
			await this.sessionService.prepare(session);
		} catch (error) {
			this.logger.capture('pending session save', error);
			new Notice('会话暂未写入；已保留在内存待写队列，请稍后重试。');
		}
		if (session.mode !== 'quick') {
			await this.finalizeSession(session.sessionId, EMPTY_SESSION_REFLECTION);
			return;
		}
		this.openSessionReflection(session);
	}

	private handleCompletedTimer(state: FinishedTimerState): void {
		if (!this.timerService) return;
		const decision = resolvePomodoroCompletion(
			state,
			this.settings.completedPomodoros,
		);
		if (!decision) return;
		this.settings.completedPomodoros = decision.completedPomodoros;
		const transition = this.timerService.start(
			decision.next.mode,
			Date.now(),
			decision.next.durationSeconds,
			decision.next.purpose,
		);
		if (!transition.ok) {
			new Notice('本轮计时已完成，但下一阶段未能自动开始。');
			void this.saveSettings();
			return;
		}
		if (decision.completedStage === 'focus') {
			const breakMinutes = (decision.next.durationSeconds ?? 0) / 60;
			this.timerCompletionNotifier?.notify(
				'专注完成',
				`第 ${decision.completedPomodoros} 次专注完成，已自动开始 ${breakMinutes} 分钟休息。`,
			);
		} else {
			this.timerCompletionNotifier?.notify(
				'休息结束',
				'已自动开始下一轮 25 分钟专注。',
			);
		}
		void this.saveSettings();
	}

	private async openCompletionReflection(
		taskId: string,
		subtaskId: string | null,
	): Promise<void> {
		if (!this.sessionService) return;
		const session = createQuickExecutionSession(
			taskId,
			Date.now(),
			crypto.randomUUID(),
			subtaskId,
		);
		try {
			await this.sessionService.prepare(session);
		} catch (error) {
			this.logger.capture('completion reflection pending save', error);
			new Notice('完成记录暂未写入；已保留待重试。');
		}
		this.openSessionReflection(session, '本次执行已结束');
	}

	private openSessionReflection(
		session: ExecutionSession,
		titleOverride: string | null = null,
	): void {
		const modal = new SessionReflectionModal(
			this.app,
			session,
			(reflection) => this.finalizeSession(session.sessionId, reflection),
			() => this.activeModals.delete(modal),
			titleOverride,
		);
		this.activeModals.add(modal);
		modal.open();
	}

	private async finalizeSession(
		sessionId: string,
		reflection: SessionReflection,
	): Promise<void> {
		if (!this.sessionService) return;
		try {
			await this.sessionService.finalize(sessionId, reflection);
		} catch (error) {
			this.logger.capture('session log append', error);
			new Notice('会话写入失败，完整记录仍在待写队列中。可运行重试命令。');
		}
	}

	private openSessionHistory(): void {
		if (!this.sessionService) return;
		const taskId = this.timerService?.getTaskId() ?? null;
		const modal = new SessionHistoryModal(
			this.app,
			taskId,
			() => this.sessionService?.history(taskId) ?? Promise.resolve([]),
			() => this.activeModals.delete(modal),
		);
		this.activeModals.add(modal);
		modal.open();
	}

	private openReviewQueue(scope: 'all' | 'today' = 'all'): void {
		if (!this.reviewService) return;
		const modal = new ReviewQueueModal(
			this.app,
			this.reviewService,
			(review) => this.openReviewSource(review),
			(review) => this.openReview(review, () => this.openReviewQueue(scope)),
			(review) => this.openReviewMarkdown(review),
			(review) => this.reopenReview(review),
			scope,
			() => this.activeModals.delete(modal),
		);
		this.activeModals.add(modal);
		modal.open();
	}

	private async reopenReview(review: ReviewEvent): Promise<boolean> {
		if (
			review.reviewStatus !== 'pending' ||
			!this.reviewService ||
			!this.taskScanner ||
			!this.subtaskService
		) {
			return false;
		}
		try {
			if (review.targetType === 'task') {
				await this.taskScanner.reopen({
					id: review.taskId,
					sourcePath: review.sourcePath,
				});
			} else if (review.subtaskId) {
				await this.subtaskService.reopen(
					review.taskId,
					review.subtaskId,
					Date.now(),
				);
			} else {
				return false;
			}
			this.reviewService.notifyEligibilityChanged();
			new Notice('已撤销完成，任务已恢复为未完成。');
			return true;
		} catch (error) {
			this.logger.capture('review completion reopen', error);
			new Notice('撤销完成失败；原任务状态未改变。');
			return false;
		}
	}

	private openReview(
		review: ReviewEvent,
		onBack: (() => void) | null = null,
	): void {
		if (!this.reviewService || review.reviewStatus !== 'pending') return;
		const modal = new ReviewModal(
			this.app,
			review,
			async (reflection) => {
				const path = await this.reviewService?.saveReview(
					review,
					reflection,
					Date.now(),
				);
				if (path) {
					new Notice(`复盘已保存：${path}`);
				}
			},
			(reflection) => {
				if (review.targetType === 'task') {
					void this.openTemplateDecision(review, reflection);
				}
			},
			onBack,
			() => this.activeModals.delete(modal),
		);
		this.activeModals.add(modal);
		modal.open();
	}

	private async openReviewSource(review: ReviewEvent): Promise<void> {
		await this.openSourceAt(review.sourcePath, review.sourceLineNumber);
	}

	private async openSourceAt(path: string, lineNumber: number): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error('Task source is unavailable.');
		const requestedLine = Math.max(0, lineNumber - 1);
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file, { active: true, eState: { line: requestedLine } });
		if (!(leaf.view instanceof MarkdownView)) return;
		const editor = leaf.view.editor;
		const line = Math.min(requestedLine, Math.max(0, editor.lineCount() - 1));
		const from = { line, ch: 0 };
		const to = { line, ch: editor.getLine(line).length };
		editor.setCursor(from);
		editor.scrollIntoView({ from, to }, true);
	}

	private async openReviewMarkdown(review: ReviewEvent): Promise<void> {
		if (!review.markdownPath) throw new Error('Review Markdown is unavailable.');
		const file = this.app.vault.getAbstractFileByPath(review.markdownPath);
		if (!(file instanceof TFile)) throw new Error('Review Markdown is unavailable.');
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	private async retryPendingSessions(showSuccess: boolean): Promise<void> {
		if (!this.sessionService) return;
		try {
			const count = await this.sessionService.retryAll();
			if (showSuccess) new Notice(`已写入 ${count} 条待处理会话。`);
		} catch (error) {
			this.logger.capture('pending session retry', error);
			new Notice('会话重试仍失败；记录继续保留在待写队列中。');
		}
	}

	private async retryPendingReviews(showSuccess: boolean): Promise<void> {
		if (!this.reviewService) return;
		try {
			const result = await this.reviewService.retryAll();
			if (showSuccess) {
				new Notice(
					`已重试 ${result.events} 条队列记录和 ${result.markdown} 份复盘。`,
				);
			}
		} catch (error) {
			this.logger.capture('pending review retry', error);
			new Notice('复盘重试仍失败；内容继续保留在待写队列中。');
		}
	}

	private savePluginData(pendingSessionWrites: ExecutionSession[]): Promise<void> {
		const data: Record<string, unknown> = { ...this.settings };
		const timerState = this.timerService?.serialize() ?? null;
		if (timerState !== null) data.timerState = timerState;
		const selectedTaskId = this.timerService?.getTaskId() ?? null;
		if (selectedTaskId) data.selectedTaskId = selectedTaskId;
		const selectedSubtaskId = this.timerService?.getSubtaskId() ?? null;
		if (selectedSubtaskId) data.selectedSubtaskId = selectedSubtaskId;
		if (pendingSessionWrites.length > 0) {
			data.pendingSessionWrites = pendingSessionWrites;
		}
		const pendingReviewEventWrites =
			this.reviewService?.getPendingEvents() ?? [];
		if (pendingReviewEventWrites.length > 0) {
			data.pendingReviewEventWrites = pendingReviewEventWrites;
		}
		const pendingReviewMarkdownWrites =
			this.reviewService?.getPendingMarkdown() ?? [];
		if (pendingReviewMarkdownWrites.length > 0) {
			data.pendingReviewMarkdownWrites = pendingReviewMarkdownWrites;
		}
		const operation = this.saveChain.then(() => this.saveData(data));
		this.saveChain = operation.catch(() => undefined);
		return operation;
	}

	private installExtensionHooks(): void {
		if (
			!this.timerService ||
			!this.sessionService ||
			!this.subtaskService ||
			!this.reviewService
		) {
			return;
		}
		let previous: TimerState = this.timerService.getState();
		this.register(
			this.timerService.subscribe((state) => {
				this.emitTimerTransition(previous, state);
				previous = state;
			}),
		);
		this.register(
			this.sessionService.onSaved((session) =>
				this.emitExtensionEvent('session-saved', {
					taskId: session.taskId,
					subtaskId: session.subtaskId,
					sessionId: session.sessionId,
					occurredAt: session.endedAt,
				}),
			),
		);
		this.register(
			this.subtaskService.onEvent((event) => {
				if (event.eventType !== 'created' && event.eventType !== 'completed') return;
				for (const subtask of event.subtasks) {
					this.emitExtensionEvent(
						event.eventType === 'created' ? 'subtask-created' : 'subtask-completed',
						{
							taskId: event.taskId,
							subtaskId: subtask.subtaskId,
							occurredAt: event.occurredAt,
						},
					);
				}
			}),
		);
		this.register(
			this.reviewService.onEvent((event) =>
				this.emitExtensionEvent(
					event.reviewStatus === 'pending' ? 'review-created' : 'review-completed',
					{
						taskId: event.taskId,
						subtaskId: event.subtaskId,
						reviewId: event.reviewId,
						targetType: event.targetType,
						occurredAt: event.occurredAt,
					},
				),
			),
		);
	}

	private emitTimerTransition(previous: TimerState, state: TimerState): void {
		const taskId = this.timerService?.getTaskId();
		if (!taskId || state.status === 'idle') return;
		const base = {
			taskId,
			subtaskId: state.subtaskId,
			sessionId: state.sessionId,
			mode: state.mode,
			occurredAt: new Date().toISOString(),
		};
		if (state.status === 'running' && previous.status === 'paused') {
			this.emitExtensionEvent('timer-resumed', base);
		} else if (state.status === 'running' && previous.status !== 'running') {
			this.timerCompletionNotifier?.primeAudio();
			this.emitExtensionEvent('timer-started', base);
		} else if (state.status === 'paused' && previous.status === 'running') {
			this.emitExtensionEvent('timer-paused', base);
		} else if (
			state.status === 'finished' &&
			(previous.status === 'running' || previous.status === 'paused')
		) {
			this.emitExtensionEvent('timer-finished', {
				...base,
				endedEarly: state.completion === 'early',
			});
		}
	}

	private emitExtensionEvent<K extends ExtensionEventName>(
		name: K,
		payload: ExtensionEventMap[K],
	): void {
		this.extensionEvents.emit(name, payload);
		const envelope = { name, payload } as ExtensionEventEnvelope<K>;
		void this.controlledScriptService?.handle(envelope).catch((error: unknown) => {
			this.logger.capture('controlled script event', error);
		});
	}

	private createPublicApi(): TaskCompanionApiV1 | null {
		if (
			!this.timerService ||
			!this.sessionService ||
			!this.reviewService ||
			!this.templateService ||
			!this.subtaskService ||
			!this.dashboardTaskService ||
			!this.taskScanner
		) {
			return null;
		}
		const timer = this.timerService;
		const sessions = this.sessionService;
		const reviews = this.reviewService;
		const templates = this.templateService;
		const subtasks = this.subtaskService;
		const scanner = this.taskScanner;
		return {
			apiVersion: TASK_COMPANION_API_VERSION,
			tasks: {
				getCurrentId: () => timer.getTaskId(),
				getCurrentSubtaskId: () => timer.getSubtaskId(),
				homeReminders: async (date = formatLocalDate(new Date())) => {
					const snapshot = await scanner.snapshotReadonly();
					const home = buildHomeReminderGroups(
						snapshot.tasks,
						snapshot.historyTasks,
						date,
					);
					const mapItem = (item: typeof home.today[number]) => ({
						id: item.task.id,
						text: item.task.text,
						displayText: item.displayText,
						sourcePath: item.task.sourcePath,
						lineNumber: item.task.lineNumber,
						priority: item.priority,
						recurring: item.recurring,
						start: item.start,
						scheduled: item.scheduled,
						due: item.due,
						today: item.today,
					});
					return {
						date,
						daily: home.daily.map(mapItem),
						today: home.today.map(mapItem),
						important: home.important.map(mapItem),
						pending: home.pending.map(mapItem),
						failureCount: snapshot.failures.length,
					};
				},
			},
			timer: {
				getState: () => timer.getState(),
				start: (mode, durationSeconds) => {
					if (!timer.getTaskId()) {
						return { ok: false, state: timer.getState(), error: 'invalid-state' };
					}
					return timer.start(mode, Date.now(), durationSeconds);
				},
				pause: () => timer.pause(Date.now()),
				resume: () => timer.resume(Date.now()),
				finish: () => timer.finishEarly(Date.now()),
			},
			sessions: { history: (taskId) => sessions.history(taskId) },
			reviews: { list: () => reviews.list() },
			templates: {
				list: () => templates.list(),
				suggest: (taskTitle) => templates.suggest(taskTitle),
				apply: async (taskId, templateId) => {
					const template = (await templates.list()).find(
						(candidate) => candidate.templateId === templateId,
					);
					if (!template) throw new Error('Experience template not found.');
					return (
						await subtasks.addMany(
							taskId,
							template.subtaskTitles,
							'template',
							Date.now(),
						)
					).length;
				},
			},
			ui: {
				openTaskPicker: () => this.openCurrentTaskPicker(),
				openReviewQueue: () => this.openReviewQueue(),
				openSessionHistory: () => this.openSessionHistory(),
			},
			events: { on: (name, listener) => this.extensionEvents.on(name, listener) },
		};
	}

	private async openTemplateDecision(
		review: ReviewEvent,
		reflection: Parameters<ReviewService['saveReview']>[1],
	): Promise<void> {
		if (!this.templateService || !this.subtaskService) return;
		try {
			const [plan, templates] = await Promise.all([
				this.subtaskService.load(review.taskId),
				this.templateService.list(),
			]);
			const modal = new TemplateDecisionModal(
				this.app,
				review,
				reflection,
				plan,
				templates,
				this.templateService,
				() => this.activeModals.delete(modal),
			);
			this.activeModals.add(modal);
			modal.open();
		} catch (error) {
			this.logger.capture('template decision load', error);
			new Notice('复盘已保存，但经验模板暂时无法读取。');
		}
	}

	private async openTemplateSuggestions(
		selected: SelectedTask | ParsedTask,
		intent: 'timer' | 'quick',
		onBack: (() => void) | null,
	): Promise<void> {
		if (!this.templateService || !this.subtaskService) return;
		const task = taskValue(selected);
		try {
			const suggestions = await this.templateService.suggest(
				removeTrailingTaskId(task.text),
			);
			const modal = new TemplateSuggestionModal(
				this.app,
				removeTrailingTaskId(task.text),
				suggestions,
				async (template) => {
					const created = await this.subtaskService?.addMany(
						task.id,
						template.subtaskTitles,
						'template',
						Date.now(),
					);
					window.requestAnimationFrame(() => {
						void this.chooseExecutionTarget(selected, intent, onBack);
					});
					return created?.length ?? 0;
				},
				() => void this.chooseExecutionTarget(selected, intent, onBack),
				() => this.activeModals.delete(modal),
			);
			this.activeModals.add(modal);
			modal.open();
		} catch (error) {
			this.logger.capture('template suggestion load', error);
			new Notice('模板建议暂时无法读取。');
		}
	}

	private openScriptManager(): void {
		if (!this.controlledScriptService) return;
		const modal = new ScriptManagerModal(
			this.app,
			this.controlledScriptService,
			() => this.activeModals.delete(modal),
		);
		this.activeModals.add(modal);
		modal.open();
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function formatLocalDate(date: Date): string {
	return [
		String(date.getFullYear()).padStart(4, '0'),
		String(date.getMonth() + 1).padStart(2, '0'),
		String(date.getDate()).padStart(2, '0'),
	].join('-');
}

function removeTrailingTaskId(text: string): string {
	return text.replace(/\s+\^tc-[0-9a-f]{6}\s*$/u, '');
}

function taskValue(selected: SelectedTask | ParsedTask): ParsedTask {
	return 'task' in selected ? selected.task : selected;
}
