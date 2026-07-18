import { Modal, setIcon } from 'obsidian';

export function installModalBackButton(
	modal: Modal,
	onBack: (() => void) | null,
): () => void {
	modal.modalEl.addClass('taskcompanion-modal');
	modal.contentEl.addClass('taskcompanion-modal-content');
	const button = modal.modalEl.createEl('button');
	button.type = 'button';
	button.addClass('taskcompanion-modal-back-button');
	button.setAttr('aria-label', '返回上一层');
	button.setAttr('title', '返回上一层');
	setIcon(button, 'arrow-left');
	const closeButton = modal.modalEl.querySelector('.modal-close-button');
	if (closeButton) closeButton.before(button);
	else modal.modalEl.prepend(button);
	const handleBack = (): void => {
		modal.close();
		onBack?.();
	};
	button.addEventListener('click', handleBack);
	return () => {
		button.removeEventListener('click', handleBack);
		button.remove();
		modal.modalEl.removeClass('taskcompanion-modal');
		modal.contentEl.removeClass('taskcompanion-modal-content');
	};
}
