import { App, Modal, Notice, Setting } from 'obsidian';
import type { ReviewEvent } from '../core/reviews/model';
import type { ReviewService } from '../services/review-service';

export class ReviewQueueModal extends Modal {
	private readonly listEl: HTMLElement;

	constructor(
		app: App,
		private readonly service: ReviewService,
		private readonly onOpenSource: (review: ReviewEvent) => Promise<void>,
		private readonly onReview: (review: ReviewEvent) => void,
		private readonly onOpenMarkdown: (review: ReviewEvent) => Promise<void>,
		private readonly onClosed: () => void,
	) {
		super(app);
		this.setTitle('任务复盘队列');
		this.listEl = this.contentEl.createDiv({ cls: 'taskcompanion-review-list' });
	}

	onOpen(): void {
		this.contentEl.appendChild(this.listEl);
		this.listEl.setText('正在读取复盘档案…');
		void this.render();
	}

	onClose(): void {
		this.contentEl.empty();
		this.onClosed();
	}

	private async render(): Promise<void> {
		try {
			const reviews = await this.service.list();
			this.listEl.empty();
			if (reviews.length === 0) {
				this.listEl.setText('当前没有待复盘或已完成复盘。');
				return;
			}
			const pending = reviews.filter((review) => review.reviewStatus === 'pending');
			const completed = reviews.filter(
				(review) => review.reviewStatus === 'completed',
			);
			this.renderGroup('待复盘', pending);
			this.renderGroup('已完成复盘', completed);
		} catch {
			this.listEl.setText('复盘队列读取失败。');
		}
	}

	private renderGroup(title: string, reviews: ReviewEvent[]): void {
		this.listEl.createEl('h3', { text: `${title}（${reviews.length}）` });
		for (const review of reviews) {
			const setting = new Setting(this.listEl)
				.setName(review.taskTitle)
				.setDesc(`${review.completedAt.slice(0, 10)} · ${review.sourcePath}`)
				.addButton((button) =>
					button.setButtonText('打开来源').onClick(() => {
						void this.run(() => this.onOpenSource(review));
					}),
				);
			if (review.reviewStatus === 'pending') {
				setting.addButton((button) =>
					button.setButtonText('开始复盘').setCta().onClick(() => {
						this.onReview(review);
					}),
				);
			} else {
				setting.addButton((button) =>
					button.setButtonText('打开复盘').onClick(() => {
						void this.run(() => this.onOpenMarkdown(review));
					}),
				);
			}
		}
	}

	private async run(operation: () => Promise<void>): Promise<void> {
		try {
			await operation();
		} catch {
			new Notice('Task companion 无法打开该文件。');
		}
	}
}
