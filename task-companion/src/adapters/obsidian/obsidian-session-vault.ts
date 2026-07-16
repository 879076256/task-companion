import { Vault } from 'obsidian';

export interface SessionLogStorage {
	read(path: string): Promise<string | null>;
	append(path: string, content: string): Promise<void>;
	list(folder: string): Promise<string[]>;
}

export class ObsidianSessionVault implements SessionLogStorage {
	constructor(private readonly vault: Vault) {}

	async read(path: string): Promise<string | null> {
		if (!(await this.vault.adapter.exists(path))) return null;
		return this.vault.adapter.read(path);
	}

	async append(path: string, content: string): Promise<void> {
		await this.ensureFolder(parentPath(path));
		if (await this.vault.adapter.exists(path)) {
			await this.vault.adapter.append(path, content);
			return;
		}
		await this.vault.adapter.write(path, content);
	}

	async list(folder: string): Promise<string[]> {
		if (!(await this.vault.adapter.exists(folder))) return [];
		const listing = await this.vault.adapter.list(folder);
		return listing.files;
	}

	private async ensureFolder(folder: string): Promise<void> {
		let current = '';
		for (const segment of folder.split('/').filter(Boolean)) {
			current = current.length > 0 ? `${current}/${segment}` : segment;
			if (!(await this.vault.adapter.exists(current))) {
				await this.vault.adapter.mkdir(current);
			}
		}
	}
}

function parentPath(path: string): string {
	const index = path.lastIndexOf('/');
	return index < 0 ? '' : path.slice(0, index);
}
