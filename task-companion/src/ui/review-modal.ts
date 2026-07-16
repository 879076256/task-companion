import { App, Modal, Notice, Setting } from 'obsidian';
import type {
	ReviewEvent,
	ReviewReflection,
} from '../core/reviews/model';

const EMPTY_REFLECTION: ReviewReflection = {
	reviewText: null,
	wentWell: null,
	reworkOrBlocker: null,
	nextAdjustment: null,
};

export class ReviewModal extends Modal {
	private reflection: ReviewReflection = { ...EMPTY_REFLECTION };

	constructor(
		app: App,
		private readonly review: ReviewEvent,
		private readonly onSave: (
			reflection: ReviewReflection,
		) => Promise<void>,
		private readonly onClosed: () => void,
	) {
		super(app);
		this.setTitle(`任务复盘：${review.taskTitle}`);
	}

	onOpen(): void {
		this.renderStats();
		this.addTextArea('自由复盘', 'reviewText', '记录最重要的经验或结论');
		this.contentEl.createEl('h3', { text: '引导问题（可选）' });
		this.addTextArea('哪些地方做得好？', 'wentWell', '可跳过');
		this.addTextArea(
			'哪些地方需要返工，或遇到了什么阻塞？',
			'reworkOrBlocker',
			'可跳过',
		);
		this.addTextArea('下次准备如何调整？', 'nextAdjustment', '可跳过');
		new Setting(this.contentEl).addButton((button) =>
			button
				.setButtonText('保存复盘')
				.setCta()
				.onClick(() => {
					void this.save();
				}),
		);
	}

	onClose(): void {
		this.contentEl.empty();
		this.onClosed();
	}

	private renderStats(): void {
		const { stats } = this.review;
		const list = this.contentEl.createEl('ul');
		for (const line of [
			`任务跨度：${formatDuration(stats.taskSpanSeconds)}`,
			`实际执行 ${stats.activeDayCount} 天 · ${stats.sessionCount} 次会话`,
			`有效时间 ${formatDuration(stats.totalActiveDurationSeconds)} · 暂停 ${formatDuration(stats.totalPausedDurationSeconds)} · 提前结束 ${stats.endedEarlySessionCount} 次`,
			`初始子任务 ${stats.initialSubtaskCount} · 执行中新增 ${stats.addedDuringExecutionCount} · 完成 ${stats.completedSubtaskCount} · 取消 ${stats.cancelledSubtaskCount}`,
			`最长耗时步骤：${stats.longestStepTitle ?? '无'}（${formatDuration(stats.longestStepActiveDurationSeconds)}）`,
			`最后进展：${stats.lastProgress ?? '未填写'}`,
			`未完成子任务：${stats.outstandingSubtasks.join('、') || '无'}`,
		]) {
			list.createEl('li', { text: line });
		}
	}

	private addTextArea(
		name: string,
		field: keyof ReviewReflection,
		placeholder: string,
	): void {
		new Setting(this.contentEl).setName(name).addTextArea((text) =>
			text.setPlaceholder(placeholder).onChange((value) => {
				this.reflection = { ...this.reflection, [field]: value };
			}),
		);
	}

	private async save(): Promise<void> {
		try {
			await this.onSave(this.reflection);
			this.close();
		} catch {
			new Notice('复盘写入失败；内容已保留在待写队列，可稍后重试。');
		}
	}
}

function formatDuration(seconds: number): string {
	const hours = Math.floor(seconds / 3_600);
	const minutes = Math.floor((seconds % 3_600) / 60);
	return hours > 0 ? `${hours} 小时 ${minutes} 分钟` : `${minutes} 分钟`;
}
