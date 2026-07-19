import { MarkdownRenderChild } from 'obsidian';
import type { TimerState } from '../core/timer/model';
import { getRemainingSeconds } from '../core/timer/state-machine';
import type { TimerService } from '../services/timer-service';

export class StatusViewChild extends MarkdownRenderChild {
	private unsubscribe: (() => void) | null = null;
	private openButton: HTMLButtonElement | null = null;
	private readonly handleOpen = (): void => this.onOpenTimer();

	constructor(
		containerEl: HTMLElement,
		private readonly timer: TimerService,
		private readonly onOpenTimer: () => void,
	) {
		super(containerEl);
	}

	onload(): void {
		this.containerEl.empty();
		this.containerEl.addClass('taskcompanion-widget', 'taskcompanion-status-widget');
		const header = this.containerEl.createDiv({ cls: 'taskcompanion-widget-header' });
		header.createEl('h3', { text: '专注状态' });
		const badge = header.createSpan({ cls: 'taskcompanion-badge' });
		const timeEl = this.containerEl.createDiv({ cls: 'taskcompanion-time' });
		const labelEl = this.containerEl.createDiv({ cls: 'taskcompanion-label' });
		const actions = this.containerEl.createDiv({ cls: 'taskcompanion-widget-actions' });
		this.openButton = actions.createEl('button', {
			text: '打开计时控制',
			cls: 'taskcompanion-button taskcompanion-button-primary',
		});
		this.openButton.type = 'button';
		this.openButton.addEventListener('click', this.handleOpen);

		const update = (state: TimerState): void => {
			const remaining = getRemainingSeconds(state, Date.now());
			const minutes = Math.floor(remaining / 60);
			const seconds = remaining % 60;
			timeEl.setText(
				`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
			);
			const label = timerStatusLabel(state);
			labelEl.setText(label);
			badge.setText(label);
			badge.toggleClass('is-active', state.status === 'running');
			badge.toggleClass('is-paused', state.status === 'paused');
		};

		update(this.timer.getState());
		this.unsubscribe = this.timer.subscribe(update);
	}

	onunload(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.openButton?.removeEventListener('click', this.handleOpen);
		this.openButton = null;
		this.containerEl.empty();
	}
}

function timerStatusLabel(state: TimerState): string {
	switch (state.status) {
		case 'idle':
			return '任务空闲中';
		case 'ready':
			return state.purpose === 'break' ? '休息待开始' : '专注待开始';
		case 'running':
			return state.purpose === 'break' ? '正在休息' : '正在专注';
		case 'paused':
			return state.purpose === 'break' ? '休息已暂停' : '已暂停';
		case 'finished':
			return state.purpose === 'break' ? '休息结束' : '专注完成';
	}
}
