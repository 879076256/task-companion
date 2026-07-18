import { App, Modal, Setting } from 'obsidian';
import type { ExecutionSession, SessionReflection } from '../core/sessions/model';
import { installModalBackButton } from './modal-navigation';

const EMPTY_REFLECTION: SessionReflection = {
	completedWork: null,
	nextAction: null,
	blockerReason: null,
};

export class SessionReflectionModal extends Modal {
	private reflection: SessionReflection = { ...EMPTY_REFLECTION };
	private settled = false;
	private removeBackButton: (() => void) | null = null;

	constructor(
		app: App,
		private readonly session: ExecutionSession,
		private readonly onSubmit: (reflection: SessionReflection) => Promise<void>,
		private readonly onClosed: () => void,
		titleOverride: string | null = null,
	) {
		super(app);
		this.setTitle(
			titleOverride ??
				(session.mode === 'quick' ? '记录快速推进' : '本次执行已结束'),
		);
	}

	onOpen(): void {
		this.removeBackButton = installModalBackButton(this, null);
		this.contentEl.createEl('p', {
			text: '文字均可跳过；基础会话仍会保存。',
		});
		this.addTextArea('本次完成了什么', 'completedWork');
		this.addTextArea('下一步是什么', 'nextAction');
		this.addTextArea('注意事项（可选）', 'blockerReason');
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText('跳过').onClick(() => {
					void this.submit(EMPTY_REFLECTION);
				}),
			)
			.addButton((button) =>
				button
					.setButtonText('保存记录')
					.setCta()
					.onClick(() => {
						void this.submit(this.reflection);
					}),
			);
	}

	onClose(): void {
		this.removeBackButton?.();
		this.removeBackButton = null;
		this.contentEl.empty();
		this.onClosed();
		if (!this.settled) {
			this.settled = true;
			void this.onSubmit(EMPTY_REFLECTION);
		}
	}

	private addTextArea(
		name: string,
		field: keyof SessionReflection,
	): void {
		new Setting(this.contentEl).setName(name).addTextArea((text) =>
			text.onChange((value) => {
				this.reflection = { ...this.reflection, [field]: value };
			}),
		);
	}

	private async submit(reflection: SessionReflection): Promise<void> {
		if (this.settled) return;
		this.settled = true;
		await this.onSubmit(reflection);
		this.close();
	}
}
