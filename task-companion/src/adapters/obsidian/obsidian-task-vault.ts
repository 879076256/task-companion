import { TFile, Vault } from 'obsidian';
import { TaskVaultAccess } from '../tasks/task-scanner';

export class ObsidianTaskVault implements TaskVaultAccess {
	constructor(private readonly vault: Vault) {}

	listMarkdownPaths(): string[] {
		return this.vault.getMarkdownFiles().map(({ path }) => path);
	}

	async read(path: string): Promise<string> {
		return this.vault.cachedRead(this.requireFile(path));
	}

	async process(
		path: string,
		transform: (content: string) => string,
	): Promise<void> {
		await this.vault.process(this.requireFile(path), transform);
	}

	private requireFile(path: string): TFile {
		const file = this.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error('Task source is unavailable.');
		return file;
	}
}
