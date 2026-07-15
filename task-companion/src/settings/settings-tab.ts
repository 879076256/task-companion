import { App, PluginSettingTab, Setting } from 'obsidian';
import TaskCompanionPlugin from '../main';

export class TaskCompanionSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: TaskCompanionPlugin) {
		super(app, plugin);
	}

	display(): void {
		this.containerEl.empty();

		new Setting(this.containerEl)
			.setName('Show technical details')
			.setDesc('Include the plugin ID in the test modal.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showTechnicalDetails)
					.onChange(async (value) => {
						this.plugin.settings.showTechnicalDetails = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}

