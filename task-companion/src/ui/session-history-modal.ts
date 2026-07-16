import { App, Modal, Setting } from 'obsidian';
import type { ExecutionSession } from '../core/sessions/model';

export class SessionHistoryModal extends Modal {
	constructor(
		app: App,
		private readonly taskId: string | null,
		private readonly loadHistory: () => Promise<ExecutionSession[]>,
		private readonly onClosed: () => void,
	) {
		super(app);
		this.setTitle(taskId ? '当前任务执行历史' : '执行会话历史');
	}

	onOpen(): void {
		this.contentEl.setText('正在读取会话历史…');
		void this.renderHistory();
	}

	onClose(): void {
		this.contentEl.empty();
		this.onClosed();
	}

	private async renderHistory(): Promise<void> {
		try {
			const sessions = (await this.loadHistory()).slice(0, 20);
			this.contentEl.empty();
			if (sessions.length === 0) {
				this.contentEl.setText('暂无执行会话。');
				return;
			}
			for (const session of sessions) {
				new Setting(this.contentEl)
					.setName(`${formatMode(session)} · ${formatDuration(session)}`)
					.setDesc(formatDescription(session));
			}
		} catch {
			this.contentEl.setText('执行会话历史读取失败。');
		}
	}
}

function formatMode(session: ExecutionSession): string {
	const labels = {
		'focus-25': '25 分钟',
		'focus-50': '50 分钟',
		custom: '自由计时',
		quick: '快速推进',
	};
	return `${labels[session.mode]} · ${new Date(session.endedAt).toLocaleString()}`;
}

function formatDuration(session: ExecutionSession): string {
	return `${Math.floor(session.activeDurationSeconds / 60)} 分 ${session.activeDurationSeconds % 60} 秒`;
}

function formatDescription(session: ExecutionSession): string {
	return [
		session.endedEarly ? '提前结束' : '已完成',
		session.completedWork ? `完成：${session.completedWork}` : null,
		session.nextAction ? `下一步：${session.nextAction}` : null,
		session.blockerReason ? `阻塞：${session.blockerReason}` : null,
	]
		.filter((value): value is string => value !== null)
		.join(' · ');
}
