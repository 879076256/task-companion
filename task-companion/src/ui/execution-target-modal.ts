import { App, Menu, Modal, Notice, Setting, setIcon } from 'obsidian';
import type {
	Subtask,
	SubtaskOrigin,
	SubtaskPlan,
} from '../core/subtasks/model';
import { SubtaskService } from '../services/subtask-service';
import { installModalBackButton } from './modal-navigation';

export class ExecutionTargetModal extends Modal {
	private removeBackButton: (() => void) | null = null;
	private newTitle = '';
	private newTitleInput: HTMLInputElement | null = null;

	constructor(
		app: App,
		private readonly taskTitle: string,
		private plan: SubtaskPlan,
		private readonly actionLabel: string,
		private readonly onSelect: (subtaskId: string | null) => Promise<void>,
		private readonly service: SubtaskService,
		private readonly isExecutionActive: () => boolean,
		private readonly onCompleteSubtask: (
			subtask: Subtask,
			nowMs: number,
		) => Promise<unknown>,
		private readonly onDeleteSubtask: (subtask: Subtask) => Promise<unknown>,
		private readonly onBrowseTemplates: (() => void) | null,
		private readonly onBack: (() => void) | null,
		private readonly onClosed: () => void,
	) {
		super(app);
		this.setTitle('执行准备');
	}

	onOpen(): void {
		this.removeBackButton = installModalBackButton(this, this.onBack);
		this.render();
	}

	onClose(): void {
		this.removeBackButton?.();
		this.removeBackButton = null;
		this.contentEl.empty();
		this.onClosed();
	}

	private render(): void {
		this.contentEl.empty();
		this.newTitleInput = null;
		const activeCount = this.plan.subtasks.filter(
			(candidate) => candidate.status === 'active',
		).length;
		const heading = new Setting(this.contentEl)
			.setName(`母任务：${this.taskTitle}`)
			.setDesc(
				activeCount > 0
					? `已拆解 ${activeCount} 个进行中子任务`
					: '尚未拆解子任务',
			);
		if (this.onBrowseTemplates) {
			heading.addButton((button) =>
				button
					.setButtonText('模板建议')
					.onClick(() => this.onBrowseTemplates?.()),
			);
		}

		this.contentEl.createEl('h3', { text: '选择执行层级' });
		this.createParentTarget();
		this.plan.subtasks.forEach((subtask, index) =>
			this.createSubtaskTarget(subtask, index, this.plan.subtasks.length),
		);
		this.createComposer();
	}

	private createParentTarget(): void {
		const button = this.contentEl.createEl('button', {
			cls: 'taskcompanion-target-option is-preferred',
		});
		button.type = 'button';
		button.setAttr('aria-label', `${this.actionLabel}：${this.taskTitle}`);
		button.createSpan({ cls: 'taskcompanion-target-level', text: '母任务：' });
		button.createSpan({ cls: 'taskcompanion-target-title', text: this.taskTitle });
		button.createSpan({ cls: 'taskcompanion-target-action', text: this.actionLabel });
		button.addEventListener('click', () => void this.select(null));
	}

	private createSubtaskTarget(
		subtask: Subtask,
		index: number,
		count: number,
	): void {
		const row = this.contentEl.createDiv({
			cls: `taskcompanion-target-option-row is-${subtask.status}`,
		});
		const preferred =
			subtask.status === 'active' &&
			subtask.subtaskId === this.plan.currentNextSubtaskId;
		const button = row.createEl('button', {
			cls: `taskcompanion-target-option${preferred ? ' is-preferred' : ''}`,
		});
		button.type = 'button';
		button.disabled = subtask.status !== 'active';
		button.setAttr('aria-label', `${this.actionLabel}：${subtask.title}`);
		button.createSpan({ cls: 'taskcompanion-target-level', text: '子任务：' });
		button.createSpan({ cls: 'taskcompanion-target-title', text: subtask.title });
		button.createSpan({
			cls: 'taskcompanion-target-action',
			text: subtask.status === 'active' ? this.actionLabel : statusLabel(subtask),
		});
		if (subtask.status === 'active') {
			button.addEventListener('click', () => void this.select(subtask.subtaskId));
		}
		const more = row.createEl('button', {
			cls: 'taskcompanion-subtask-more',
		});
		more.type = 'button';
		more.setAttr('aria-label', `管理子任务：${subtask.title}`);
		more.setAttr('title', '更多操作');
		setIcon(more, 'ellipsis');
		more.addEventListener('click', (event) =>
			this.openSubtaskMenu(event, subtask, index, count, preferred),
		);
	}

	private createComposer(): void {
		const composer = this.contentEl.createDiv({
			cls: 'taskcompanion-subtask-composer taskcompanion-target-composer',
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
			cls: 'taskcompanion-subtask-more taskcompanion-target-add-button',
		});
		addButton.type = 'button';
		addButton.setAttr('aria-label', '添加子任务');
		addButton.setAttr('title', '添加子任务');
		setIcon(addButton, 'plus');
		addButton.addEventListener('click', () => void this.add());
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
								this.plan.taskId,
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
							this.service.move(
								this.plan.taskId,
								subtask.subtaskId,
								-1,
								Date.now(),
							),
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
							this.service.move(
								this.plan.taskId,
								subtask.subtaskId,
								1,
								Date.now(),
							),
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
									this.plan.taskId,
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
							this.service.reopen(
								this.plan.taskId,
								subtask.subtaskId,
								Date.now(),
							),
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
		const title = this.newTitle;
		this.newTitle = '';
		if (this.newTitleInput) this.newTitleInput.value = '';
		await this.mutate(() =>
			this.service.add(this.plan.taskId, title, origin, Date.now()),
		);
	}

	private async select(subtaskId: string | null): Promise<void> {
		try {
			await this.onSelect(subtaskId);
			this.close();
		} catch {
			new Notice('Task companion 无法设置本次执行目标。');
		}
	}

	private async mutate(operation: () => Promise<unknown>): Promise<void> {
		try {
			await operation();
			this.plan = await this.service.load(this.plan.taskId);
			this.render();
		} catch {
			new Notice('Task companion 无法保存这次子任务变更。');
		}
	}
}

function statusLabel(subtask: Subtask): string {
	return subtask.status === 'completed' ? '已完成' : '已取消';
}
