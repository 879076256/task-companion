import { App, Modal, Notice, Setting } from 'obsidian';
import { TaskScanner } from '../adapters/tasks/task-scanner';
import {
	categoryLabel,
	SelectedTask,
} from '../core/tasks/task-rules';
import { installModalBackButton } from './modal-navigation';

export class TaskSelectionModal extends Modal {
	private readonly listEl: HTMLElement;
	private tasks: SelectedTask[] = [];
	private query = '';
	private removeBackButton: (() => void) | null = null;

	constructor(
		app: App,
		private readonly scanner: TaskScanner,
		private readonly today: string,
		private readonly onOpenSource: (task: SelectedTask) => Promise<void>,
		private readonly onSelect: (task: SelectedTask) => Promise<boolean>,
		private readonly onClosed: () => void,
		private readonly selectLabel = '选择',
	) {
		super(app);
		this.setTitle('选择任务');
		this.listEl = this.contentEl.createDiv({ cls: 'taskcompanion-task-list' });
	}

	onOpen(): void {
		this.removeBackButton = installModalBackButton(this, null);
		new Setting(this.contentEl)
			.setName('搜索')
			.addSearch((search) =>
				search
					.setPlaceholder('任务、日期或来源')
					.onChange((value) => {
						this.query = value.trim().toLocaleLowerCase();
						this.renderTasks();
					}),
			)
			.addButton((button) =>
				button.setButtonText('刷新').onClick(() => {
					this.listEl.setText('正在重新读取任务…');
					void this.loadTasks();
				}),
			);
		this.contentEl.appendChild(this.listEl);
		this.listEl.setText('正在读取任务…');
		void this.loadTasks();
	}

	onClose(): void {
		this.removeBackButton?.();
		this.removeBackButton = null;
		this.contentEl.empty();
		this.onClosed();
	}

	private async loadTasks(): Promise<void> {
		try {
			const result = await this.scanner.select(this.today);
			this.tasks = result.tasks;
			if (result.failures.length > 0) {
				new Notice(
					`Task Companion 跳过了 ${result.failures.length} 个无法安全处理的任务位置。`,
				);
			}
			this.renderTasks();
		} catch {
			this.listEl.setText('任务读取失败；原笔记未被修改。');
		}
	}

	private renderTasks(): void {
		this.listEl.empty();
		const visible = this.tasks.filter(({ task, category }) => {
			if (!this.query) return true;
			return [
				task.text,
				task.sourcePath,
				task.start,
				task.scheduled,
				task.due,
				categoryLabel(category),
			]
				.filter((value): value is string => typeof value === 'string')
				.some((value) => value.toLocaleLowerCase().includes(this.query));
		});

		if (visible.length === 0) {
			this.listEl.setText('没有符合当前规则的任务。');
			return;
		}

		for (const selected of visible) {
			const { task, category } = selected;
			new Setting(this.listEl)
				.setName(removeTrailingBlockId(task.text))
				.setDesc(buildDescription(selected))
				.addButton((button) => {
					button.buttonEl.addClass('taskcompanion-title-trailing-action');
					return button.setButtonText('打开来源').onClick(() => {
						void this.openSource(selected);
					});
				})
				.addButton((button) => {
					button.buttonEl.addClass('taskcompanion-title-trailing-action');
					return button
						.setButtonText(`${this.selectLabel} · ${categoryLabel(category)}`)
						.setCta()
						.onClick(() => {
							void this.selectTask(selected);
						});
				});
		}
	}

	private async openSource(task: SelectedTask): Promise<void> {
		try {
			await this.onOpenSource(task);
			this.close();
		} catch {
			new Notice('Task companion 无法打开任务来源。');
		}
	}

	private async selectTask(task: SelectedTask): Promise<void> {
		try {
			if (await this.onSelect(task)) this.close();
		} catch {
			new Notice('Task companion 无法选择该任务。');
		}
	}
}

function removeTrailingBlockId(text: string): string {
	return text.replace(/\s+\^tc-[0-9a-f]{6}\s*$/u, '');
}

function buildDescription({ task, category }: SelectedTask): string {
	const dates = [
		task.start ? `开始 ${task.start}` : null,
		task.scheduled ? `计划 ${task.scheduled}` : null,
		task.due ? `截止 ${task.due}` : null,
	].filter((value): value is string => value !== null);
	return [categoryLabel(category), ...dates, task.sourcePath].join(' · ');
}
