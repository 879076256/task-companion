import { App, Modal, Setting } from 'obsidian';
import { installModalBackButton } from './modal-navigation';

class TimerCompletionModal extends Modal {
	private removeBackButton: (() => void) | null = null;

	constructor(
		app: App,
		title: string,
		private readonly message: string,
		private readonly onClosed: () => void,
	) {
		super(app);
		this.setTitle(title);
	}

	onOpen(): void {
		this.removeBackButton = installModalBackButton(this, null);
		this.contentEl.createEl('p', { text: this.message });
		new Setting(this.contentEl).addButton((button) =>
			button.setButtonText('知道了').setCta().onClick(() => this.close()),
		);
	}

	onClose(): void {
		this.removeBackButton?.();
		this.removeBackButton = null;
		this.contentEl.empty();
		this.onClosed();
	}
}

export class TimerCompletionNotifier {
	private audioContext: AudioContext | null = null;
	private modal: TimerCompletionModal | null = null;

	constructor(
		private readonly app: App,
		private readonly onError: (scope: string, error: unknown) => void,
	) {}

	primeAudio(): void {
		try {
			const context = this.getAudioContext();
			if (context.state === 'suspended') void context.resume();
		} catch (error) {
			this.onError('timer alert audio prime', error);
		}
	}

	notify(title: string, message: string): void {
		this.playChime();
		void this.showSystemNotification(title, message);
		this.modal?.close();
		const modal = new TimerCompletionModal(this.app, title, message, () => {
			if (this.modal === modal) this.modal = null;
		});
		this.modal = modal;
		modal.open();
	}

	dispose(): void {
		this.modal?.close();
		this.modal = null;
		if (this.audioContext) void this.audioContext.close();
		this.audioContext = null;
	}

	private getAudioContext(): AudioContext {
		this.audioContext ??= new AudioContext();
		return this.audioContext;
	}

	private playChime(): void {
		try {
			const context = this.getAudioContext();
			if (context.state === 'suspended') void context.resume();
			for (const [offset, frequency] of [[0, 880], [0.32, 1_175]] as const) {
				const oscillator = context.createOscillator();
				const gain = context.createGain();
				const start = context.currentTime + offset;
				oscillator.type = 'sine';
				oscillator.frequency.setValueAtTime(frequency, start);
				gain.gain.setValueAtTime(0.0001, start);
				gain.gain.exponentialRampToValueAtTime(0.22, start + 0.025);
				gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
				oscillator.connect(gain);
				gain.connect(context.destination);
				oscillator.start(start);
				oscillator.stop(start + 0.3);
			}
		} catch (error) {
			this.onError('timer alert sound', error);
		}
	}

	private async showSystemNotification(title: string, message: string): Promise<void> {
		if (document.hasFocus() || typeof window.Notification === 'undefined') return;
		try {
			let permission = window.Notification.permission;
			if (permission === 'default') {
				permission = await window.Notification.requestPermission();
			}
			if (permission === 'granted') {
				new window.Notification(title, { body: message, silent: true });
			}
		} catch (error) {
			this.onError('timer system notification', error);
		}
	}
}
