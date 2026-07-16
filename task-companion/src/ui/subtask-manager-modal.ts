import { App, Modal, Notice, Setting, TextComponent } from 'obsidian';
import type { ExecutionSession } from '../core/sessions/model';
import type { Subtask, SubtaskOrigin } from '../core/subtasks/model';
import type { TaskProgressSummary } from '../core/subtasks/progress';
import { SubtaskService } from '../services/subtask-service';

export class SubtaskManagerModal extends Modal {
	private readonly listEl: HTMLElement;
	private newTitle = '';
	private newTitleInput: TextComponent | null = null;

	constructor(
		app: App,
		private readonly taskId: string,
		private readonly service: SubtaskService,
		private readonly loadSessions: () => Promise<ExecutionSession[]>,
		private readonly isExecutionActive: () => boolean,
		private readonly onClosed: () => void,
	) {
		super(app);
		this.setTitle('一层任务拆解');
		this.listEl = this.contentEl.createDiv({ cls: 'taskcompanion-subtask-list' });
	}

	onOpen(): void {
		new Setting(this.contentEl)
			.setName('新增子任务')
			.setDesc('只创建母任务下的一层步骤。')
			.addText((text) => {
				this.newTitleInput = text;
				return text.setPlaceholder('下一项可执行步骤').onChange((value) => {
					this.newTitle = value;
				});
			})
			.addButton((button) =>
				button.setButtonText('添加').setCta().onClick(() => void this.add()),
			);
		this.contentEl.appendChild(this.listEl);
		this.listEl.setText('正在读取拆解档案…');
		void this.render();
	}

	onClose(): void {
		this.contentEl.empty();
		this.onClosed();
	}

	private async render(): Promise<void> {
		try {
			const progress = await this.service.progress(
				this.taskId,
				await this.loadSessions(),
			);
			this.listEl.empty();
			this.renderSummary(progress);
			if (progress.subtasks.length === 0) {
				this.listEl.createEl('p', { text: '尚未添加子任务，可继续直接推进母任务。' });
				return;
			}
			for (const subtask of progress.subtasks) this.renderSubtask(subtask);
		} catch {
			this.listEl.setText('拆解档案读取失败。');
		}
	}

	private renderSummary(progress: TaskProgressSummary): void {
		const parts = [
			progress.totalSubtasks > 0
				? `子任务 ${progress.completedSubtasks} / ${progress.totalSubtasks}`
				: null,
			`累计 ${progress.totalSessionCount} 次执行`,
			`总投入 ${formatDuration(progress.totalActiveDurationSeconds)}`,
			`母任务直接投入 ${formatDuration(progress.parentDirectDurationSeconds)}`,
			progress.currentNextTitle ? `当前下一步：${progress.currentNextTitle}` : null,
		].filter((value): value is string => value !== null);
		this.listEl.createEl('p', { text: parts.join(' · ') });
	}

	private renderSubtask(subtask: TaskProgressSummary['subtasks'][number]): void {
		let title = subtask.title;
		const setting = new Setting(this.listEl)
			.setName(statusLabel(subtask))
			.setDesc(
				`${originLabel(subtask.origin)} · ${subtask.sessionCount} 次 · ${formatDuration(subtask.activeDurationSeconds)}`,
			)
			.addText((text) =>
				text.setValue(subtask.title).onChange((value) => {
					title = value;
				}),
			)
			.addButton((button) =>
				button.setButtonText('保存名称').onClick(() =>
					void this.mutate(() =>
						this.service.rename(this.taskId, subtask.subtaskId, title, Date.now()),
					),
				),
			)
			.addButton((button) =>
				button.setButtonText('↑').onClick(() =>
					void this.mutate(() =>
						this.service.move(this.taskId, subtask.subtaskId, -1, Date.now()),
					),
				),
			)
			.addButton((button) =>
				button.setButtonText('↓').onClick(() =>
					void this.mutate(() =>
						this.service.move(this.taskId, subtask.subtaskId, 1, Date.now()),
					),
				),
			);

		if (subtask.status === 'active') this.addActiveButtons(setting, subtask);
		else {
			setting.addButton((button) =>
				button.setButtonText('恢复为进行中').onClick(() =>
					void this.mutate(() =>
						this.service.reopen(this.taskId, subtask.subtaskId, Date.now()),
					),
				),
			);
		}
	}

	private addActiveButtons(setting: Setting, subtask: Subtask): void {
		setting
			.addButton((button) =>
				button.setButtonText('设为下一步').onClick(() =>
					void this.mutate(() =>
						this.service.setCurrentNext(
							this.taskId,
							subtask.subtaskId,
							Date.now(),
						),
					),
				),
			)
			.addButton((button) =>
				button.setButtonText('标记完成').onClick(() =>
					void this.mutate(() =>
						this.service.complete(this.taskId, subtask.subtaskId, Date.now()),
					),
				),
			)
			.addButton((button) =>
				button.setButtonText('取消子任务').onClick(() =>
					void this.mutate(() =>
						this.service.cancel(this.taskId, subtask.subtaskId, Date.now()),
					),
				),
			);
	}

	private async add(): Promise<void> {
		const origin: SubtaskOrigin = this.isExecutionActive()
			? 'during-execution'
			: 'initial';
		await this.mutate(() =>
			this.service.add(this.taskId, this.newTitle, origin, Date.now()),
		);
		this.newTitle = '';
		this.newTitleInput?.setValue('');
	}

	private async mutate(operation: () => Promise<unknown>): Promise<void> {
		try {
			await operation();
			await this.render();
		} catch {
			new Notice('Task companion 无法保存这次子任务变更。');
		}
	}
}

function statusLabel(subtask: Subtask): string {
	const labels = { active: '进行中', completed: '已完成', cancelled: '已取消' };
	return `${labels[subtask.status]} · ${subtask.title}`;
}

function originLabel(origin: SubtaskOrigin): string {
	const labels = {
		initial: '最初创建',
		'during-execution': '执行中新增',
		template: '模板加载',
	};
	return labels[origin];
}

function formatDuration(seconds: number): string {
	const hours = Math.floor(seconds / 3_600);
	const minutes = Math.floor((seconds % 3_600) / 60);
	return hours > 0 ? `${hours} 小时 ${minutes} 分钟` : `${minutes} 分钟`;
}
