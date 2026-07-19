import { App, Modal, Notice, Setting } from 'obsidian';
import { TimerService } from '../services/timer-service';
import { TimerMode, TimerState } from '../core/timer/model';
import { getRemainingSeconds } from '../core/timer/state-machine';
import type { TaskProgressSummary } from '../core/subtasks/progress';
import { installModalBackButton } from './modal-navigation';

export class TimerControlModal extends Modal {
	private readonly timer: TimerService;
	private timeEl!: HTMLElement;
	private statusEl!: HTMLElement;
	private unsubscribe: (() => void) | null = null;
	private removeBackButton: (() => void) | null = null;

	constructor(
		app: App,
		timer: TimerService,
		private readonly taskLabel: string | null = null,
		private readonly nextAction: string | null = null,
		private readonly executionTargetLabel: string | null = null,
		private readonly progress: TaskProgressSummary | null = null,
		private readonly onManageSubtasks: (() => void) | null = null,
		private readonly onClosed: () => void = () => undefined,
	) {
		super(app);
		this.timer = timer;
		this.setTitle('Task companion — 计时控制');
	}

	onOpen(): void {
		this.removeBackButton = installModalBackButton(this, null);
		const { contentEl } = this;
		if (this.taskLabel) {
			contentEl.createEl('p', {
				text: `当前任务：${this.taskLabel}`,
				cls: 'taskcompanion-current-task',
			});
		}
		if (this.nextAction) {
			contentEl.createEl('p', {
				text: `当前下一步：${this.nextAction}`,
				cls: 'taskcompanion-next-action',
			});
		}
		if (this.executionTargetLabel) {
			contentEl.createEl('p', { text: `本次执行：${this.executionTargetLabel}` });
		}
		if (this.progress) {
			const parts = [
				this.progress.totalSubtasks > 0
					? `子任务 ${this.progress.completedSubtasks} / ${this.progress.totalSubtasks}`
					: null,
				`累计 ${this.progress.totalSessionCount} 次执行`,
				`总投入 ${formatDuration(this.progress.totalActiveDurationSeconds)}`,
			].filter((value): value is string => value !== null);
			contentEl.createEl('p', { text: parts.join(' · ') });
		}
		if (this.onManageSubtasks) {
			new Setting(contentEl).addButton((button) =>
				button.setButtonText('管理任务拆解').onClick(() => {
					this.close();
					this.onManageSubtasks?.();
				}),
			);
		}

		// Time display
		this.timeEl = contentEl.createDiv({
			cls: 'taskcompanion-time',
		});

		// Status label
		this.statusEl = contentEl.createDiv({
			cls: 'taskcompanion-label',
		});

		// Subscribe to timer updates
		this.unsubscribe = this.timer.subscribe((state: TimerState) => {
			this.updateDisplay(state);
		});
		this.updateDisplay(this.timer.getState());

		// Control buttons section
		const controlsEl = contentEl.createDiv({ cls: 'taskcompanion-controls' });

		// Mode selector + Start
		let selectedMode: TimerMode = 'focus-25';
		let customDuration: number | null = 25;

		new Setting(controlsEl)
			.setName('专注模式')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('focus-25', '25 分钟')
					.addOption('focus-50', '50 分钟')
					.addOption('custom', '自由计时')
					.setValue('focus-25')
					.onChange((value: string) => {
						selectedMode = value as TimerMode;
					});
			});

		new Setting(controlsEl)
			.setName('自由时长（分钟）')
			.setDesc('选择“自由计时”时使用，范围 1–1440 分钟。')
			.addText((text) =>
				text
					.setValue('25')
					.setPlaceholder('25')
					.onChange((value) => {
						const minutes = Number(value.trim());
						customDuration =
							Number.isSafeInteger(minutes) && minutes >= 1 && minutes <= 1_440
								? minutes
								: null;
					}),
			);

		new Setting(controlsEl)
			.setName('操作')
			.addButton((btn) =>
				btn
					.setButtonText('开始')
					.onClick(() => {
						const state = this.timer.getState();
						if (
							state.status === 'idle' ||
							state.status === 'ready' ||
							state.status === 'finished'
						) {
							if (selectedMode === 'custom' && customDuration === null) {
								new Notice('请输入 1–1440 之间的整数分钟。');
								return;
							}
							const duration =
								selectedMode === 'custom' && customDuration !== null
									? customDuration * 60
									: undefined;
							this.timer.start(selectedMode, Date.now(), duration);
						}
					}),
			)
			.addButton((btn) =>
				btn
					.setButtonText('暂停')
					.onClick(() => {
						const state = this.timer.getState();
						if (state.status === 'running') {
							this.timer.pause(Date.now());
						}
					}),
			)
			.addButton((btn) =>
				btn
					.setButtonText('继续')
					.onClick(() => {
						const state = this.timer.getState();
						if (state.status === 'paused') {
							this.timer.resume(Date.now());
						}
					}),
			)
			.addButton((btn) =>
				btn
					.setButtonText('结束')
					.onClick(() => {
						const state = this.timer.getState();
						if (state.status === 'running' || state.status === 'paused') {
							this.timer.finishEarly(Date.now());
						}
					}),
			)
			.addButton((btn) =>
				btn
					.setButtonText('重置')
					.onClick(() => {
						this.timer.reset();
					}),
			);
	}

	onClose(): void {
		this.removeBackButton?.();
		this.removeBackButton = null;
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}
		this.contentEl.empty();
		this.onClosed();
	}

	private updateDisplay(state: TimerState): void {
		const remaining = getRemainingSeconds(state, Date.now());
		const minutes = Math.floor(remaining / 60);
		const seconds = remaining % 60;
		this.timeEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

		switch (state.status) {
			case 'idle':
				this.statusEl.textContent = '任务空闲中';
				break;
			case 'ready':
				this.statusEl.textContent =
					state.purpose === 'break'
						? '休息已准备，请点击开始'
						: '专注已准备，请点击开始';
				break;
			case 'running':
				this.statusEl.textContent =
					state.purpose === 'break' ? '正在休息' : '正在专注';
				break;
			case 'paused':
				this.statusEl.textContent =
					state.purpose === 'break' ? '休息已暂停' : '已暂停';
				break;
			case 'finished':
				this.statusEl.textContent =
					state.purpose === 'break' ? '休息结束' : '专注完成';
				break;
		}
	}
}

function formatDuration(seconds: number): string {
	return `${Math.floor(Math.max(0, seconds) / 60)}分钟`;
}
