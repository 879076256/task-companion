import { App, Menu, Modal, Notice, setIcon } from 'obsidian';
import type { ExecutionSession } from '../core/sessions/model';
import type { Subtask, SubtaskOrigin } from '../core/subtasks/model';
import type { TaskProgressSummary } from '../core/subtasks/progress';
import { SubtaskService } from '../services/subtask-service';
import { installModalBackButton } from './modal-navigation';

export class SubtaskManagerModal extends Modal {
	private readonly listEl: HTMLElement;
	private newTitle = '';
	private newTitleInput: HTMLInputElement | null = null;
	private removeBackButton: (() => void) | null = null;

	constructor(
		app: App,
		private readonly taskId: string,
		private readonly taskTitle: string,
		private readonly service: SubtaskService,
		private readonly loadSessions: () => Promise<ExecutionSession[]>,
		private readonly isExecutionActive: () => boolean,
		private readonly onCompleteSubtask: (
			subtask: Subtask,
			nowMs: number,
		) => Promise<unknown>,
		private readonly onDeleteSubtask: (subtask: Subtask) => Promise<unknown>,
		private readonly onBack: (() => void) | null,
		private readonly onClosed: () => void,
	) {
		super(app);
		this.setTitle('一层任务拆解');
		this.listEl = this.contentEl.createDiv({ cls: 'taskcompanion-subtask-list' });
	}

	onOpen(): void {
		this.removeBackButton = installModalBackButton(this, this.onBack);
		this.contentEl.createEl('h3', {
			text: `母任务：${this.taskTitle}`,
			cls: 'taskcompanion-subtask-parent-title',
		});
		const composer = this.contentEl.createDiv({
			cls: 'taskcompanion-subtask-composer',
		});
		this.newTitleInput = composer.createEl('input', {
			type: 'text',
			placeholder: '新增一个可执行的子任务',
		});
		this.newTitleInput.setAttr('aria-label', '新增子任务');
		this.newTitleInput.addEventListener('input', () => {
			this.newTitle = this.newTitleInput?.value ?? '';
		});
		this.newTitleInput.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') void this.add();
		});
		const addButton = composer.createEl('button', {
			cls: 'taskcompanion-subtask-add-button',
		});
		addButton.type = 'button';
		const addIcon = addButton.createSpan();
		setIcon(addIcon, 'plus');
		addButton.createSpan({ text: '添加' });
		addButton.addEventListener('click', () => void this.add());
		this.contentEl.appendChild(this.listEl);
		this.listEl.setText('正在读取拆解档案…');
		void this.render();
	}

	onClose(): void {
		this.removeBackButton?.();
		this.removeBackButton = null;
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
			if (progress.subtasks.length === 0) {
				this.listEl.createEl('p', {
					cls: 'taskcompanion-subtask-empty',
					text: '尚未添加子任务',
				});
				return;
			}
			progress.subtasks.forEach((subtask, index) =>
				this.renderSubtask(
					subtask,
					index,
					progress.subtasks.length,
					progress.currentNextSubtaskId === subtask.subtaskId,
				),
			);
		} catch {
			this.listEl.setText('拆解档案读取失败。');
		}
	}

	private renderSubtask(
		subtask: TaskProgressSummary['subtasks'][number],
		index: number,
		count: number,
		isCurrentNext: boolean,
	): void {
		const row = this.listEl.createDiv({
			cls: `taskcompanion-subtask-row is-${subtask.status}${isCurrentNext ? ' is-current-next' : ''}`,
		});
		row.setAttr(
			'title',
			`${statusLabel(subtask)} · ${originLabel(subtask.origin)} · ${subtask.sessionCount} 次 · ${formatDuration(subtask.activeDurationSeconds)}`,
		);
		const status = row.createSpan({ cls: 'taskcompanion-subtask-status' });
		status.setAttr('aria-label', statusLabel(subtask));
		setIcon(status, statusIcon(subtask));
		const title = row.createEl('input', {
			type: 'text',
			value: subtask.title,
			cls: 'taskcompanion-subtask-title-input',
		});
		title.setAttr('aria-label', `子任务：${subtask.title}`);
		title.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') title.blur();
			if (event.key === 'Escape') {
				title.value = subtask.title;
				title.blur();
			}
		});
		title.addEventListener('blur', () => {
			if (title.value.trim() === subtask.title) return;
			void this.mutate(() =>
				this.service.rename(
					this.taskId,
					subtask.subtaskId,
					title.value,
					Date.now(),
				),
			);
		});
		if (isCurrentNext) {
			const flag = row.createSpan({ cls: 'taskcompanion-subtask-current' });
			flag.setAttr('aria-label', '当前下一步');
			flag.setAttr('title', '当前下一步');
			setIcon(flag, 'flag');
		}
		const more = row.createEl('button', {
			cls: 'taskcompanion-subtask-more',
		});
		more.type = 'button';
		more.setAttr('aria-label', `管理子任务：${subtask.title}`);
		more.setAttr('title', '更多操作');
		setIcon(more, 'ellipsis');
		more.addEventListener('click', (event) =>
			this.openSubtaskMenu(event, subtask, index, count, isCurrentNext),
		);
	}

	private openSubtaskMenu(
		event: MouseEvent,
		subtask: Subtask,
		index: number,
		count: number,
		isCurrentNext: boolean,
	): void {
		const menu = new Menu();
		if (subtask.status === 'active') {
			menu.addItem((item) =>
				item
					.setTitle(isCurrentNext ? '已是当前下一步' : '设为当前下一步')
					.setIcon('flag')
					.setChecked(isCurrentNext)
					.setDisabled(isCurrentNext)
					.onClick(() =>
						void this.mutate(() =>
							this.service.setCurrentNext(
								this.taskId,
								subtask.subtaskId,
								Date.now(),
							),
						),
					),
			);
		}
		menu
			.addItem((item) =>
				item
					.setTitle('上移')
					.setIcon('arrow-up')
					.setDisabled(index === 0)
					.onClick(() =>
						void this.mutate(() =>
							this.service.move(this.taskId, subtask.subtaskId, -1, Date.now()),
						),
					),
			)
			.addItem((item) =>
				item
					.setTitle('下移')
					.setIcon('arrow-down')
					.setDisabled(index === count - 1)
					.onClick(() =>
						void this.mutate(() =>
							this.service.move(this.taskId, subtask.subtaskId, 1, Date.now()),
						),
					),
			);
		menu.addSeparator();
		if (subtask.status === 'active') {
			menu
				.addItem((item) =>
					item
						.setTitle('标记完成')
						.setIcon('circle-check')
						.onClick(() =>
							void this.mutate(() =>
								this.onCompleteSubtask(subtask, Date.now()),
							),
						),
				)
				.addItem((item) =>
					item
						.setTitle('取消子任务')
						.setIcon('circle-slash')
						.onClick(() =>
							void this.mutate(() =>
								this.service.cancel(
									this.taskId,
									subtask.subtaskId,
									Date.now(),
								),
							),
						),
				);
		} else {
			menu.addItem((item) =>
				item
					.setTitle('恢复为进行中')
					.setIcon('rotate-ccw')
					.onClick(() =>
						void this.mutate(() =>
							this.service.reopen(this.taskId, subtask.subtaskId, Date.now()),
						),
					),
			);
		}
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle('删除子任务')
				.setIcon('trash-2')
				.setWarning(true)
				.onClick(() =>
					void this.mutate(() => this.onDeleteSubtask(subtask)),
				),
		);
		menu.showAtMouseEvent(event);
	}

	private async add(): Promise<void> {
		const origin: SubtaskOrigin = this.isExecutionActive()
			? 'during-execution'
			: 'initial';
		await this.mutate(() =>
			this.service.add(this.taskId, this.newTitle, origin, Date.now()),
		);
		this.newTitle = '';
		if (this.newTitleInput) this.newTitleInput.value = '';
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
	return labels[subtask.status];
}

function statusIcon(subtask: Subtask): string {
	const icons = {
		active: 'circle',
		completed: 'circle-check',
		cancelled: 'circle-slash',
	};
	return icons[subtask.status];
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
