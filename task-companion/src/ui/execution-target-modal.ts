import { App, Modal, Notice, Setting } from 'obsidian';
import type { SubtaskPlan } from '../core/subtasks/model';

export class ExecutionTargetModal extends Modal {
	constructor(
		app: App,
		private readonly plan: SubtaskPlan,
		private readonly actionLabel: string,
		private readonly onSelect: (subtaskId: string | null) => Promise<void>,
		private readonly onClosed: () => void,
	) {
		super(app);
		this.setTitle('选择本次执行目标');
	}

	onOpen(): void {
		new Setting(this.contentEl)
			.setName('直接推进母任务')
			.setDesc('本次投入只计入母任务直接投入。')
			.addButton((button) =>
				button
					.setButtonText(this.actionLabel)
					.setCta()
					.onClick(() => void this.select(null)),
			);
		for (const subtask of this.plan.subtasks.filter(
			(candidate) => candidate.status === 'active',
		)) {
			new Setting(this.contentEl)
				.setName(subtask.title)
				.setDesc(
					subtask.subtaskId === this.plan.currentNextSubtaskId
						? '当前下一步'
						: '活动子任务',
				)
				.addButton((button) =>
					button
						.setButtonText(this.actionLabel)
						.onClick(() => void this.select(subtask.subtaskId)),
				);
		}
	}

	onClose(): void {
		this.contentEl.empty();
		this.onClosed();
	}

	private async select(subtaskId: string | null): Promise<void> {
		try {
			await this.onSelect(subtaskId);
			this.close();
		} catch {
			new Notice('Task companion 无法设置本次执行目标。');
		}
	}
}
