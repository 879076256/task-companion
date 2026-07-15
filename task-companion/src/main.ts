import { Plugin } from 'obsidian';
import { ConsoleLogSink } from './adapters/console-log-sink';
import { PLUGIN_NAME, TEST_COMMAND_ID, TIMER_COMMAND_ID } from './core/plugin-constants';
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

export default class TaskCompanionPlugin extends Plugin {
	settings: TaskCompanionSettings = DEFAULT_SETTINGS;

	private readonly activeModals = new Set<StatusModal>();
	private readonly logger = new ErrorLogger(new ConsoleLogSink());
	private timerService!: TimerService;

	async onload(): Promise<void> {
		try {
			this.settings = normalizeSettings(await this.loadData());
			this.timerService = new TimerService(this.logger);

			// Restore persistent timer state
			const saved = await this.loadData();
			if (saved && typeof saved === 'object' && 'timerState' in saved) {
				this.timerService.restore(
					(saved as Record<string, unknown>).timerState,
					Date.now(),
				);
			}

			// Settings tab
			this.addSettingTab(new TaskCompanionSettingTab(this.app, this));

			// Phase 1 test modal command
			this.addCommand({
				id: TEST_COMMAND_ID,
				name: 'Open test modal',
				callback: () => this.openStatusModal(),
			});

			// Phase 2 timer control modal command
			this.addCommand({
				id: TIMER_COMMAND_ID,
				name: 'Open timer control',
				callback: () => {
					new TimerControlModal(this.app, this.timerService).open();
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
			const data: Record<string, unknown> = { ...this.settings };
			const timerState = this.timerService.serialize();
			if (timerState !== null) {
				data.timerState = timerState;
			}
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
		this.timerService.dispose();
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
}