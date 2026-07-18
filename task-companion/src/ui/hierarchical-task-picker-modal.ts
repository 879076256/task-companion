import { App, Modal, Notice, Setting, setIcon } from 'obsidian';
import type { TaskScanner } from '../adapters/tasks/task-scanner';
import type { SubtaskPlan } from '../core/subtasks/model';
import type { SelectedTask } from '../core/tasks/task-rules';
import type { SubtaskService } from '../services/subtask-service';
import { installModalBackButton } from './modal-navigation';

interface TaskGroup {
	title: string;
	tasks: SelectedTask[];
}

export class HierarchicalTaskPickerModal extends Modal {
	private readonly listEl: HTMLElement;
	private tasks: SelectedTask[] = [];
	private readonly plans = new Map<string, SubtaskPlan>();
	private readonly expandedTaskIds = new Set<string>();
	private query = '';
	private removeBackButton: (() => void) | null = null;

	constructor(
		app: App,
		private readonly scanner: TaskScanner,
		private readonly subtasks: SubtaskService,
		private readonly today: string,
		private readonly onOpenSource: (task: SelectedTask) => Promise<void>,
		private readonly onSelectTask: (task: SelectedTask) => Promise<boolean>,
		private readonly onSelectSubtask: (
			task: SelectedTask,
			subtaskId: string,
		) => Promise<boolean>,
		private readonly onCompleteTask: (task: SelectedTask) => Promise<boolean>,
		private readonly onClosed: () => void,
	) {
		super(app);
		this.setTitle('选择当前任务');
		this.listEl = this.contentEl.createDiv({ cls: 'taskcompanion-hierarchy-list' });
	}

	onOpen(): void {
		this.removeBackButton = installModalBackButton(this, null);
		new Setting(this.contentEl)
			.setName('搜索')
			.addSearch((search) =>
				search.setPlaceholder('任务或子任务').onChange((value) => {
					this.query = value.trim().toLocaleLowerCase();
					this.render();
				}),
			)
			.addButton((button) =>
				button.setButtonText('刷新').onClick(() => void this.load()),
			);
		this.contentEl.appendChild(this.listEl);
		this.listEl.setText('正在读取任务与拆解…');
		void this.load();
	}

	onClose(): void {
		this.removeBackButton?.();
		this.removeBackButton = null;
		this.contentEl.empty();
		this.onClosed();
	}

	private async load(): Promise<void> {
		try {
			const result = await this.scanner.select(this.today);
			this.tasks = result.tasks;
			this.plans.clear();
			await Promise.all(
				this.tasks.map(async ({ task }) => {
					this.plans.set(task.id, await this.subtasks.load(task.id));
				}),
			);
			if (result.failures.length > 0) {
				new Notice(
					`Task Companion 跳过了 ${result.failures.length} 个无法安全处理的任务位置。`,
				);
			}
			this.render();
		} catch {
			this.listEl.setText('任务读取失败；原笔记未被修改。');
		}
	}

	private render(): void {
		this.listEl.empty();
		let visibleCount = 0;
		for (const group of this.groups()) {
			const tasks = group.tasks.filter((selected) => this.matches(selected));
			if (tasks.length === 0) continue;
			visibleCount += tasks.length;
			this.listEl.createEl('h2', {
				text: group.title,
				cls: 'taskcompanion-hierarchy-level-one',
			});
			for (const selected of tasks) this.renderTask(selected);
		}
		if (visibleCount === 0) {
			this.listEl.setText('没有符合当前规则的任务。');
		}
	}

	private renderTask(selected: SelectedTask): void {
		const plan = this.plans.get(selected.task.id);
		const children =
			plan?.subtasks.filter((subtask) => subtask.status === 'active') ?? [];
		const row = this.listEl.createDiv({ cls: 'taskcompanion-hierarchy-task' });
		const heading = row.createDiv({ cls: 'taskcompanion-hierarchy-task-heading' });
		if (children.length > 0) {
			const toggle = heading.createEl('button', {
				cls: 'taskcompanion-disclosure-button',
			});
			toggle.type = 'button';
			setIcon(
				toggle,
				this.expandedTaskIds.has(selected.task.id)
					? 'chevron-down'
					: 'chevron-right',
			);
			toggle.setAttr('aria-label', '展开或收起子任务');
			toggle.addEventListener('click', () => {
				if (this.expandedTaskIds.has(selected.task.id)) {
					this.expandedTaskIds.delete(selected.task.id);
				} else {
					this.expandedTaskIds.add(selected.task.id);
				}
				this.render();
			});
		} else {
			heading.createSpan({ cls: 'taskcompanion-disclosure-spacer' });
		}
		const completion = heading.createEl('input', {
			type: 'checkbox',
			cls: 'taskcompanion-completion-checkbox',
		});
		completion.setAttr(
			'aria-label',
			`完成任务：${removeTrailingTaskId(selected.task.text)}`,
		);
		completion.addEventListener('change', () => {
			if (completion.checked) void this.completeTask(selected, completion);
		});
		const title = heading.createEl('button', {
			text: removeTrailingTaskId(selected.task.text),
			cls: 'taskcompanion-hierarchy-level-two',
		});
		title.type = 'button';
		title.addEventListener('click', () => void this.selectTask(selected));
		this.createIconButton(heading, 'link-2', '打开任务来源', () =>
			this.run(() => this.onOpenSource(selected), true),
		);

		if (!this.expandedTaskIds.has(selected.task.id)) return;
		const childList = row.createDiv({ cls: 'taskcompanion-hierarchy-children' });
		for (const subtask of children) {
			const child = childList.createEl('button', {
				text: subtask.title,
				cls: 'taskcompanion-hierarchy-level-three',
			});
			child.type = 'button';
			child.addEventListener('click', () =>
				void this.selectSubtask(selected, subtask.subtaskId),
			);
		}
	}

	private groups(): TaskGroup[] {
		return [
			{
				title: '今日待办',
				tasks: this.tasks.filter(({ category }) =>
					category === 'today' || category === 'today-important'),
			},
			{
				title: '重点任务',
				tasks: this.tasks.filter(({ category }) =>
					category === 'important' || category === 'today-important'),
			},
			{
				title: '日常任务',
				tasks: this.tasks.filter(({ task }) => task.hasRecurrence),
			},
		];
	}

	private matches(selected: SelectedTask): boolean {
		if (!this.query) return true;
		const childTitles =
			this.plans.get(selected.task.id)?.subtasks.map(({ title }) => title) ?? [];
		return [selected.task.text, ...childTitles].some((value) =>
			value.toLocaleLowerCase().includes(this.query),
		);
	}

	private async selectTask(selected: SelectedTask): Promise<void> {
		await this.run(() => this.onSelectTask(selected), true);
	}

	private async selectSubtask(
		selected: SelectedTask,
		subtaskId: string,
	): Promise<void> {
		await this.run(() => this.onSelectSubtask(selected, subtaskId), true);
	}

	private async completeTask(
		selected: SelectedTask,
		checkbox: HTMLInputElement,
	): Promise<void> {
		checkbox.disabled = true;
		try {
			if (await this.onCompleteTask(selected)) this.close();
			else checkbox.checked = false;
		} catch {
			checkbox.checked = false;
			new Notice('Task companion 无法完成该操作。');
		} finally {
			checkbox.disabled = false;
		}
	}

	private createIconButton(
		container: HTMLElement,
		icon: string,
		accessibleLabel: string,
		action: () => void | Promise<void>,
	): void {
		const button = container.createEl('button', {
			cls: 'taskcompanion-icon-button',
		});
		button.type = 'button';
		setIcon(button, icon);
		button.setAttr('aria-label', accessibleLabel);
		button.setAttr('title', accessibleLabel);
		button.addEventListener('click', () => void action());
	}

	private async run(
		operation: () => Promise<void | boolean>,
		closeOnSuccess: boolean,
	): Promise<void> {
		try {
			const result = await operation();
			if (closeOnSuccess && result !== false) this.close();
		} catch {
			new Notice('Task companion 无法完成该操作。');
		}
	}
}

function removeTrailingTaskId(text: string): string {
	return text.replace(/\s+\^tc-[0-9a-f]{6}\s*$/u, '');
}
