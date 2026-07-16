import { MarkdownPostProcessorContext, Plugin } from 'obsidian';
import { TimerService } from '../services/timer-service';
import { TimerState } from '../core/timer/model';
import { getRemainingSeconds } from '../core/timer/state-machine';

/**
 * Renders a ````taskcompanion\nview: status\n```` code block.
 * Multiple instances share the same TimerService and update in sync.
 */
export function registerStatusCodeBlock(
	plugin: Plugin,
	timer: TimerService,
): void {
	plugin.registerMarkdownCodeBlockProcessor(
		'taskcompanion',
		(source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext) => {
			const trimmed = source.trim();
			if (trimmed !== 'view: status' && trimmed !== '') {
				el.createEl('p', { text: 'Unknown taskcompanion view: ' + trimmed });
				return;
			}

			renderStatus(el, timer);
		},
	);
}

function renderStatus(
	container: HTMLElement,
	timer: TimerService,
): void {
	const timeEl = container.createDiv({
		cls: 'taskcompanion-time',
	});
	const labelEl = container.createDiv({
		cls: 'taskcompanion-label',
	});

	function update(state: TimerState): void {
		const remaining = getRemainingSeconds(state, Date.now());
		const minutes = Math.floor(remaining / 60);
		const seconds = remaining % 60;
		timeEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

		switch (state.status) {
			case 'idle':
				labelEl.textContent = '任务空闲中';
				break;
			case 'running':
				labelEl.textContent = '正在专注';
				break;
			case 'paused':
				labelEl.textContent = '已暂停';
				break;
			case 'finished':
				labelEl.textContent = '专注完成';
				break;
		}
	}

	// Initial render
	update(timer.getState());

	// Subscribe for live updates
	const unsubscribe = timer.subscribe(update);

	// Cleanup when element is removed from DOM
	container.addEventListener('removed', () => {
		unsubscribe();
	});
}
