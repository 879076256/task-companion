import { Modal, Notice, Plugin, TFile } from 'obsidian';
import { ConsoleLogSink } from './adapters/console-log-sink';
import { ObsidianSessionVault } from './adapters/obsidian/obsidian-session-vault';
import { ObsidianTaskVault } from './adapters/obsidian/obsidian-task-vault';
import { TaskScanner } from './adapters/tasks/task-scanner';
import {
	PLUGIN_NAME,
	QUICK_PROGRESS_COMMAND_ID,
	RETRY_SESSION_WRITES_COMMAND_ID,
	SELECT_TASK_COMMAND_ID,
	SESSION_HISTORY_COMMAND_ID,
	TEST_COMMAND_ID,
	TIMER_COMMAND_ID,
} from './core/plugin-constants';
import {
	createQuickExecutionSession,
	ExecutionSession,
	SessionReflection,
} from './core/sessions/model';
import type { SelectedTask } from './core/tasks/task-rules';
import { resolveTaskSelectionAction } from './core/tasks/task-selection';
import { ErrorLogger } from './services/error-logger';
import { SessionRepository } from './services/session-repository';
import { SessionService } from './services/session-service';
import { TimerService } from './services/timer-service';
import {
	DEFAULT_SETTINGS,
	normalizeSettings,
	TaskCompanionSettings,
} from './settings/model';
import { TaskCompanionSettingTab } from './settings/settings-tab';
import { StatusModal } from './ui/status-modal';
import { SessionHistoryModal } from './ui/session-history-modal';
import { SessionReflectionModal } from './ui/session-reflection-modal';
import { TimerControlModal } from './ui/timer-control-modal';
import { registerStatusCodeBlock } from './ui/status-code-block';
import { TaskSelectionModal } from './ui/task-selection-modal';

export default class TaskCompanionPlugin extends Plugin {
	settings: TaskCompanionSettings = DEFAULT_SETTINGS;

	private readonly activeModals = new Set<Modal>();
	private readonly logger = new ErrorLogger(new ConsoleLogSink());
	private timerService: TimerService | null = null;
	private taskScanner: TaskScanner | null = null;
	private sessionService: SessionService | null = null;
	private saveChain: Promise<void> = Promise.resolve();

	async onload(): Promise<void> {
		try {
			const saved: unknown = await this.loadData();
			this.settings = normalizeSettings(saved);
			this.timerService = new TimerService(this.logger);
			this.taskScanner = new TaskScanner(new ObsidianTaskVault(this.app.vault));
			this.sessionService = new SessionService(
				new SessionRepository(new ObsidianSessionVault(this.app.vault)),
				(pending) => this.savePluginData(pending),
			);

			// Restore task identity before timer state so an expired timer can be logged.
			if (isRecord(saved)) {
				this.sessionService.restorePending(saved.pendingSessionWrites);
				this.timerService.restoreTaskId(saved.selectedTaskId);
			}
			if (this.sessionService.getPending().length > 0) {
				new Notice('Task companion 有待写入会话，正在重试。');
				await this.retryPendingSessions(false);
			}
			this.timerService.onSessionCompleted((session) => {
				void this.handleCompletedSession(session);
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

			// Settings tab
			this.addSettingTab(new TaskCompanionSettingTab(this.app, this));

			// Phase 1 test modal command
			this.addCommand({
				id: TEST_COMMAND_ID,
				name: 'Open test modal',
				callback: () => this.openStatusModal(),
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
				callback: () => this.openTaskSelectionModal(),
			});

			// Phase 2 timer control modal command
			this.addCommand({
				id: TIMER_COMMAND_ID,
				name: 'Open timer control',
				callback: () => {
					const taskId = this.timerService?.getTaskId() ?? null;
					if (!taskId) {
						new Notice('请先选择任务，再开始计时。');
						this.openTaskSelectionModal();
						return;
					}
					void this.openTimerModal(taskId, taskId);
				},
			});

			// Phase 2 status code block
			registerStatusCodeBlock(this, this.timerService);
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
		for (const modal of Array.from(this.activeModals)) {
			modal.close();
		}
		this.activeModals.clear();
		this.timerService?.dispose();
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

	private openTaskSelectionModal(intent: 'timer' | 'quick' = 'timer'): void {
		if (!this.taskScanner) return;
		const modal = new TaskSelectionModal(
			this.app,
			this.taskScanner,
			formatLocalDate(new Date()),
			(task) => this.openTaskSource(task),
			(task) =>
				intent === 'quick' ? this.recordQuickProgress(task) : this.selectTask(task),
			() => this.activeModals.delete(modal),
			intent === 'quick' ? '快速推进' : '选择',
		);
		this.activeModals.add(modal);
		modal.open();
	}

	private async openTimerModal(
		taskLabel: string | null,
		taskId: string | null,
	): Promise<void> {
		if (!this.timerService) return;
		let nextAction: string | null = null;
		if (taskId && this.sessionService) {
			try {
				nextAction = await this.sessionService.getCurrentNextAction(taskId);
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
			() => this.activeModals.delete(modal),
		);
		this.activeModals.add(modal);
		modal.open();
	}

	private async openTaskSource({ task }: SelectedTask): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(task.sourcePath);
		if (!(file instanceof TFile)) throw new Error('Task source is unavailable.');
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	private async selectTask(selected: SelectedTask): Promise<boolean> {
		if (!this.timerService) return false;
		const state = this.timerService.getState();
		const action = resolveTaskSelectionAction(
			state.status,
			this.timerService.getTaskId(),
			selected.task.id,
		);
		if (action === 'reject-switch') {
			new Notice('请先结束当前计时，再选择其他任务。');
			return false;
		}
		if (action === 'open-current') {
			await this.openTimerModal(
				removeTrailingTaskId(selected.task.text),
				selected.task.id,
			);
			return true;
		}
		this.timerService.bindTask(selected.task.id);
		await this.saveSettings();
		await this.openTimerModal(
			removeTrailingTaskId(selected.task.text),
			selected.task.id,
		);
		return true;
	}

	private async recordQuickProgress(selected: SelectedTask): Promise<boolean> {
		const session = createQuickExecutionSession(
			selected.task.id,
			Date.now(),
			crypto.randomUUID(),
		);
		await this.handleCompletedSession(session);
		return true;
	}

	private async handleCompletedSession(session: ExecutionSession): Promise<void> {
		if (!this.sessionService) return;
		try {
			await this.sessionService.prepare(session);
		} catch (error) {
			this.logger.capture('pending session save', error);
			new Notice('会话暂未写入；已保留在内存待写队列，请稍后重试。');
		}
		const modal = new SessionReflectionModal(
			this.app,
			session,
			(reflection) => this.finalizeSession(session.sessionId, reflection),
			() => this.activeModals.delete(modal),
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

	private savePluginData(pendingSessionWrites: ExecutionSession[]): Promise<void> {
		const data: Record<string, unknown> = { ...this.settings };
		const timerState = this.timerService?.serialize() ?? null;
		if (timerState !== null) data.timerState = timerState;
		const selectedTaskId = this.timerService?.getTaskId() ?? null;
		if (selectedTaskId) data.selectedTaskId = selectedTaskId;
		if (pendingSessionWrites.length > 0) {
			data.pendingSessionWrites = pendingSessionWrites;
		}
		const operation = this.saveChain.then(() => this.saveData(data));
		this.saveChain = operation.catch(() => undefined);
		return operation;
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
