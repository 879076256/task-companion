import { App, Modal } from 'obsidian';
import { installModalBackButton } from './modal-navigation';

export class StatusModal extends Modal {
	private removeBackButton: (() => void) | null = null;

	constructor(
		app: App,
		private readonly pluginName: string,
		private readonly showTechnicalDetails: boolean,
		private readonly onClosed: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.removeBackButton = installModalBackButton(this, null);
		this.setTitle(this.pluginName);
		this.contentEl.createEl('p', {
			text: 'Task Companion 1.0.1 已正常加载。',
		});
		if (this.showTechnicalDetails) {
			this.contentEl.createEl('p', { text: 'Plugin ID: task-companion' });
		}
	}

	onClose(): void {
		this.removeBackButton?.();
		this.removeBackButton = null;
		this.contentEl.empty();
		this.onClosed();
	}
}
