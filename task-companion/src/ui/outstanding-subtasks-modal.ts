import { App, Modal, Setting } from 'obsidian';
import type { Subtask } from '../core/subtasks/model';
import type { OutstandingSubtaskResolution } from '../services/task-completion-service';

export class OutstandingSubtasksModal extends Modal {
	constructor(
		app: App,
		private readonly subtasks: Subtask[],
		private readonly onContinueTask: () => void,
		private readonly onComplete: (
			resolution: OutstandingSubtaskResolution,
		) => Promise<boolean>,
		private readonly onClosed: () => void,
	) {
		super(app);
		this.setTitle('仍有未完成子任务');
	}

	onOpen(): void {
		this.contentEl.createEl('p', {
			text: '完成母任务前，请明确处理剩余步骤：',
		});
		const list = this.contentEl.createEl('ul');
		for (const subtask of this.subtasks) list.createEl('li', { text: subtask.title });
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText('返回继续').onClick(() => {
					this.close();
					this.onContinueTask();
				}),
			)
			.addButton((button) =>
				button.setButtonText('取消剩余并完成').onClick(() => {
					void this.complete('cancel');
				}),
			)
			.addButton((button) =>
				button
					.setButtonText('保留记录并完成')
					.setCta()
					.onClick(() => {
						void this.complete('keep');
					}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
		this.onClosed();
	}

	private async complete(resolution: OutstandingSubtaskResolution): Promise<void> {
		if (await this.onComplete(resolution)) this.close();
	}
}
