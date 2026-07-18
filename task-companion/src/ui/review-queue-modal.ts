import { App, Modal, Notice, Setting } from 'obsidian';
import type { ReviewEvent } from '../core/reviews/model';
import type { ReviewService } from '../services/review-service';
import { reviewsCompletedOnLocalDay } from '../core/reviews/today';
import { installModalBackButton } from './modal-navigation';

export class ReviewQueueModal extends Modal {
	private readonly listEl: HTMLElement;
	private removeBackButton: (() => void) | null = null;

	constructor(
		app: App,
		private readonly service: ReviewService,
		private readonly onOpenSource: (review: ReviewEvent) => Promise<void>,
		private readonly onReview: (review: ReviewEvent) => void,
		private readonly onOpenMarkdown: (review: ReviewEvent) => Promise<void>,
		private readonly onReopen: (review: ReviewEvent) => Promise<boolean>,
		private readonly reviewScope: 'all' | 'today',
		private readonly onClosed: () => void,
	) {
		super(app);
		this.setTitle(reviewScope === 'today' ? '今日已完成' : '任务复盘队列');
		this.listEl = this.contentEl.createDiv({ cls: 'taskcompanion-review-list' });
	}

	onOpen(): void {
		this.removeBackButton = installModalBackButton(this, null);
		this.contentEl.appendChild(this.listEl);
		this.listEl.setText('正在读取复盘档案…');
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
			const allReviews = await this.service.list();
			const reviews =
				this.reviewScope === 'today'
					? reviewsCompletedOnLocalDay(allReviews, new Date())
					: allReviews;
			this.listEl.empty();
			if (reviews.length === 0) {
				this.listEl.setText(
					this.reviewScope === 'today'
						? '今天还没有已完成的任务或子任务。'
						: '当前没有已完成且可复盘的任务或子任务。',
				);
				return;
			}
			const pending = reviews.filter((review) => review.reviewStatus === 'pending');
			const completed = reviews.filter(
				(review) => review.reviewStatus === 'completed',
			);
			this.renderGroup('已完成 · 待复盘', pending);
			this.renderGroup('复盘记录', completed);
		} catch {
			this.listEl.setText('复盘队列读取失败。');
		}
	}

	private renderGroup(title: string, reviews: ReviewEvent[]): void {
		this.listEl.createEl('h3', { text: `${title}（${reviews.length}）` });
		for (const review of reviews) {
			const setting = new Setting(this.listEl);
			setting.nameEl.empty();
			if (review.reviewStatus === 'pending') {
				const checkbox = setting.nameEl.createEl('input', {
					type: 'checkbox',
					cls: 'taskcompanion-completion-checkbox',
				});
				checkbox.checked = true;
				checkbox.setAttr('aria-label', `撤销完成：${review.taskTitle}`);
				checkbox.addEventListener('change', () => {
					if (!checkbox.checked) void this.reopen(review, checkbox);
				});
			}
			const taskTitle = setting.nameEl.createEl('button', {
				text: `${review.targetType === 'subtask' ? '子任务' : '母任务'}：${review.taskTitle}`,
				cls: 'taskcompanion-task-title-button',
			});
			taskTitle.type = 'button';
			taskTitle.addEventListener('click', () => {
				if (review.reviewStatus === 'pending') {
					this.close();
					this.onReview(review);
				} else {
					void this.run(() => this.onOpenMarkdown(review));
				}
			});
			if (review.targetType === 'subtask' && review.parentTaskTitle) {
				setting.setDesc(`母任务：${review.parentTaskTitle}`);
			}
			setting.addButton((button) => {
				button.buttonEl.addClass('taskcompanion-title-trailing-action');
				return button.setIcon('link-2').setTooltip('打开任务来源').onClick(() => {
					void this.run(() => this.onOpenSource(review));
				});
			});
			if (review.reviewStatus === 'pending') {
				taskTitle.addClass('is-pending-review');
			} else {
				taskTitle.addClass('is-completed-review');
			}
		}
	}

	private async reopen(
		review: ReviewEvent,
		checkbox: HTMLInputElement,
	): Promise<void> {
		checkbox.disabled = true;
		try {
			if (await this.onReopen(review)) await this.render();
			else checkbox.checked = true;
		} catch {
			checkbox.checked = true;
			new Notice('Task companion 无法撤销任务完成状态。');
		} finally {
			checkbox.disabled = false;
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
