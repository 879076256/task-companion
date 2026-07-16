import { Modal, Notice, Plugin, TFile } from 'obsidian';
import { ConsoleLogSink } from './adapters/console-log-sink';
import { ObsidianTaskVault } from './adapters/obsidian/obsidian-task-vault';
import { TaskScanner } from './adapters/tasks/task-scanner';
import {
	PLUGIN_NAME,
	SELECT_TASK_COMMAND_ID,
	TEST_COMMAND_ID,
	TIMER_COMMAND_ID,
} from './core/plugin-constants';
import type { SelectedTask } from './core/tasks/task-rules';
import { resolveTaskSelectionAction } from './core/tasks/task-selection';
import { ErrorLogger } from './services/error-logger';
import { TimerService } from './services/timer-service';
import {
	DEFAULT_SETTINGS,
	normalizeSettings,
	TaskCompanionSettings,
} from './settings/model';
import { TaskCompanionSettingTab } from './settings/settings-tab';
import { StatusModal } from './ui/status-modal';
import { TimerControlModal } from './ui/timer-control-modal';
import { registerStatusCodeBlock } from './ui/status-code-block';
import { TaskSelectionModal } from './ui/task-selection-modal';

export default class TaskCompanionPlugin extends Plugin {
	settings: TaskCompanionSettings = DEFAULT_SETTINGS;

	private readonly activeModals = new Set<Modal>();
	private readonly logger = new ErrorLogger(new ConsoleLogSink());
	private timerService: TimerService | null = null;
	private taskScanner: TaskScanner | null = null;

	async onload(): Promise<void> {
		try {
			const saved: unknown = await this.loadData();
			this.settings = normalizeSettings(saved);
			this.timerService = new TimerService(this.logger);
			this.taskScanner = new TaskScanner(new ObsidianTaskVault(this.app.vault));

			// Restore persistent timer state
			if (isRecord(saved)) {
				this.timerService.restore(
					saved.timerState,
					Date.now(),
				);
				this.timerService.restoreTaskId(saved.selectedTaskId);
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
				id: SELECT_TASK_COMMAND_ID,
				name: 'Select task for timer',
				callback: () => this.openTaskSelectionModal(),
			});

			// Phase 2 timer control modal command
			this.addCommand({
				id: TIMER_COMMAND_ID,
				name: 'Open timer control',
				callback: () => this.openTimerModal(this.timerService?.getTaskId() ?? null),
			});

			// Phase 2 status code block
			registerStatusCodeBlock(this, this.timerService);
		} catch (error) {
			this.logger.capture('plugin load', error);
		}
	}

	async saveSettings(): Promise<void> {
		try {
			const data: Record<string, unknown> = { ...this.settings };
			const timerState = this.timerService?.serialize() ?? null;
			if (timerState !== null) {
				data.timerState = timerState;
			}
			const selectedTaskId = this.timerService?.getTaskId() ?? null;
			if (selectedTaskId) data.selectedTaskId = selectedTaskId;
			await this.saveData(data);
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

	private openTaskSelectionModal(): void {
		if (!this.taskScanner) return;
		const modal = new TaskSelectionModal(
			this.app,
			this.taskScanner,
			formatLocalDate(new Date()),
			(task) => this.openTaskSource(task),
			(task) => this.selectTask(task),
			() => this.activeModals.delete(modal),
		);
		this.activeModals.add(modal);
		modal.open();
	}

	private openTimerModal(taskLabel: string | null): void {
		if (!this.timerService) return;
		const modal = new TimerControlModal(
			this.app,
			this.timerService,
			taskLabel,
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
			this.openTimerModal(removeTrailingTaskId(selected.task.text));
			return true;
		}
		this.timerService.bindTask(selected.task.id);
		await this.saveSettings();
		this.openTimerModal(removeTrailingTaskId(selected.task.text));
		return true;
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
