import { App, Modal, Notice, Setting } from 'obsidian';
import type { ExperienceTemplate } from '../core/templates/model';
import { installModalBackButton } from './modal-navigation';

export class TemplateSuggestionModal extends Modal {
	private removeBackButton: (() => void) | null = null;

	constructor(
		app: App,
		private readonly taskTitle: string,
		private readonly templates: ExperienceTemplate[],
		private readonly onApply: (template: ExperienceTemplate) => Promise<number>,
		private readonly onBack: (() => void) | null,
		private readonly onClosed: () => void,
	) {
		super(app);
		this.setTitle('模板建议');
	}

	onOpen(): void {
		this.removeBackButton = installModalBackButton(this, this.onBack);
		this.contentEl.createEl('p', { text: `当前任务：${this.taskTitle}` });
		if (this.templates.length === 0) {
			this.contentEl.createEl('p', { text: '还没有可用的经验模板。' });
			return;
		}
		for (const template of this.templates) {
			new Setting(this.contentEl)
				.setName(template.name)
				.setDesc(
					`${template.subtaskTitles.length} 个步骤 · 历史平均 ${template.averageSessionCount} 次执行 · ${formatMinutes(template.averageActiveDurationSeconds)} 分钟`,
				)
				.addButton((button) =>
					button.setButtonText('采用').onClick(() => void this.apply(template)),
				);
			const details = this.contentEl.createEl('details');
			details.createEl('summary', { text: '查看步骤与经验' });
			const lines = [
				...template.subtaskTitles.map((item) => `步骤：${item}`),
				...template.checklist.map((item) => `完成前检查：${item}`),
				...template.principles.map((item) => `沿用经验：${item}`),
			];
			const list = details.createEl('ul');
			for (const line of lines) list.createEl('li', { text: line });
		}
	}

	onClose(): void {
		this.removeBackButton?.();
		this.removeBackButton = null;
		this.contentEl.empty();
		this.onClosed();
	}

	private async apply(template: ExperienceTemplate): Promise<void> {
		try {
			const count = await this.onApply(template);
			new Notice(count > 0 ? `已添加 ${count} 个模板子任务。` : '没有需要新增的子任务。');
			this.close();
		} catch {
			new Notice('模板应用失败；原任务未改变。');
		}
	}
}

function formatMinutes(seconds: number): number {
	return Math.round(seconds / 60);
}
