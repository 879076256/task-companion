import { App, Modal, Notice, Setting } from 'obsidian';
import { ControlledScriptService } from '../services/controlled-script-service';
import { installModalBackButton } from './modal-navigation';

export class ScriptManagerModal extends Modal {
	private removeBackButton: (() => void) | null = null;

	constructor(
		app: App,
		private readonly service: ControlledScriptService,
		private readonly onClosed: () => void,
	) {
		super(app);
		this.setTitle('受控扩展');
	}

	onOpen(): void {
		this.removeBackButton = installModalBackButton(this, null);
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
		this.contentEl.createEl('p', {
			text: '扩展默认停用，只能执行已声明的安全界面动作。',
		});
		const statuses = this.service.list();
		if (statuses.length === 0) {
			this.contentEl.createEl('p', {
				text: '扩展目录中没有有效的 JSON 扩展。',
			});
		}
		for (const status of statuses) {
			new Setting(this.contentEl)
				.setName(`${status.script.name} · v${status.script.version}`)
				.setDesc(
					status.enabled
						? `已启用 · 监听 ${status.script.event}`
						: status.disabledReason ?? '已停用',
				)
				.addButton((button) =>
					button
						.setButtonText(status.enabled ? '停用' : '启用最新版')
						.onClick(() => void this.toggle(status.script.scriptId, status.enabled)),
				);
		}
	}

	private async toggle(scriptId: string, enabled: boolean): Promise<void> {
		try {
			if (enabled) await this.service.disable(scriptId);
			else await this.service.enable(scriptId);
			this.render();
		} catch {
			new Notice('扩展状态保存失败。');
		}
	}
}
