import { Plugin } from 'obsidian';
import { ConsoleLogSink } from './adapters/console-log-sink';
import { PLUGIN_NAME, TEST_COMMAND_ID } from './core/plugin-constants';
import { ErrorLogger } from './services/error-logger';
import {
	DEFAULT_SETTINGS,
	normalizeSettings,
	TaskCompanionSettings,
} from './settings/model';
import { TaskCompanionSettingTab } from './settings/settings-tab';
import { StatusModal } from './ui/status-modal';

export default class TaskCompanionPlugin extends Plugin {
	settings: TaskCompanionSettings = DEFAULT_SETTINGS;

	private readonly activeModals = new Set<StatusModal>();
	private readonly logger = new ErrorLogger(new ConsoleLogSink());

	async onload(): Promise<void> {
		try {
			this.settings = normalizeSettings(await this.loadData());
			this.addSettingTab(new TaskCompanionSettingTab(this.app, this));
			this.addCommand({
				id: TEST_COMMAND_ID,
				name: 'Open test modal',
				callback: () => this.openStatusModal(),
			});
		} catch (error) {
			this.logger.capture('plugin load', error);
		}
	}

	onunload(): void {
		for (const modal of this.activeModals) {
			modal.close();
		}
		this.activeModals.clear();
	}

	async saveSettings(): Promise<void> {
		try {
			await this.saveData(this.settings);
		} catch (error) {
			this.logger.capture('settings save', error);
		}
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
