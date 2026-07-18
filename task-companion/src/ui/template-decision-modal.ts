import { App, Modal, Notice, Setting } from 'obsidian';
import type { ReviewEvent, ReviewReflection } from '../core/reviews/model';
import type { SubtaskPlan } from '../core/subtasks/model';
import {
	ExperienceTemplate,
	normalizeTextLines,
} from '../core/templates/model';
import { TemplateService } from '../services/template-service';
import { installModalBackButton } from './modal-navigation';

export class TemplateDecisionModal extends Modal {
	private name: string;
	private checklist = '';
	private principles = '';
	private selectedTemplateId = '';
	private removeBackButton: (() => void) | null = null;

	constructor(
		app: App,
		private readonly review: ReviewEvent,
		private readonly reflection: ReviewReflection,
		private readonly plan: SubtaskPlan,
		private readonly templates: ExperienceTemplate[],
		private readonly service: TemplateService,
		private readonly onClosed: () => void,
	) {
		super(app);
		this.name = review.taskTitle;
		this.setTitle('沉淀经验模板');
	}

	onOpen(): void {
		this.removeBackButton = installModalBackButton(this, null);
		this.contentEl.createEl('p', {
			text: '复盘已保存。你可以把这次做法沉淀为模板，也可以暂不处理。',
		});
		new Setting(this.contentEl)
			.setName('模板名称')
			.addText((text) =>
				text.setValue(this.name).onChange((value) => {
					this.name = value;
				}),
			);
		new Setting(this.contentEl)
			.setName('完成前检查（可选）')
			.setDesc('每行一项，例如：数据与来源一致、附件链接可打开')
			.addTextArea((text) =>
				text
					.setPlaceholder('写下完成前需要逐项确认的事项')
					.onChange((value) => {
						this.checklist = value;
					}),
			);
		new Setting(this.contentEl)
			.setName('下次沿用的经验（可选）')
			.setDesc('每行一项，例如：先写结论，再补充证据')
			.addTextArea((text) =>
				text
					.setPlaceholder('写下下次处理类似任务时值得沿用的做法')
					.onChange((value) => {
						this.principles = value;
					}),
			);
		if (this.templates.length > 0) {
			this.selectedTemplateId = this.templates[0]?.templateId ?? '';
			new Setting(this.contentEl)
				.setName('更新已有模板')
				.addDropdown((dropdown) => {
					for (const template of this.templates) {
						dropdown.addOption(template.templateId, template.name);
					}
					dropdown.onChange((value) => {
						this.selectedTemplateId = value;
					});
				})
				.addButton((button) =>
					button.setButtonText('更新').onClick(() => void this.saveUpdate()),
				);
		}
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText('暂不沉淀').onClick(() => this.close()))
			.addButton((button) =>
				button.setButtonText('新建模板').setCta().onClick(() => void this.saveNew()),
			);
	}

	onClose(): void {
		this.removeBackButton?.();
		this.removeBackButton = null;
		this.contentEl.empty();
		this.onClosed();
	}

	private draft() {
		return {
			name: this.name,
			checklist: normalizeTextLines(this.checklist),
			principles: normalizeTextLines(this.principles),
		};
	}

	private async saveNew(): Promise<void> {
		try {
			await this.service.saveNew(
				this.review,
				this.reflection,
				this.plan,
				this.draft(),
				Date.now(),
			);
			new Notice('经验模板已保存。');
			this.close();
		} catch {
			new Notice('模板保存失败；复盘记录不受影响。');
		}
	}

	private async saveUpdate(): Promise<void> {
		try {
			await this.service.update(
				this.selectedTemplateId,
				this.review,
				this.reflection,
				this.plan,
				this.draft(),
				Date.now(),
			);
			new Notice('经验模板已更新。');
			this.close();
		} catch {
			new Notice('模板更新失败；复盘记录不受影响。');
		}
	}
}
