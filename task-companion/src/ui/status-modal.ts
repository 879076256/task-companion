import { App, Modal } from 'obsidian';

export class StatusModal extends Modal {
	constructor(
		app: App,
		private readonly pluginName: string,
		private readonly showTechnicalDetails: boolean,
		private readonly onClosed: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(this.pluginName);
		this.contentEl.createEl('p', {
			text: 'The phase 1 plugin skeleton is loaded.',
		});
		if (this.showTechnicalDetails) {
			this.contentEl.createEl('p', { text: 'Plugin ID: task-companion' });
		}
	}

	onClose(): void {
		this.contentEl.empty();
		this.onClosed();
	}
}
