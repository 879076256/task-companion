import { Vault } from 'obsidian';

export interface ScriptStorage {
	read(path: string): Promise<string | null>;
	write(path: string, content: string): Promise<void>;
	append(path: string, content: string): Promise<void>;
	list(folder: string): Promise<string[]>;
}

export class ObsidianScriptVault implements ScriptStorage {
	constructor(private readonly vault: Vault) {}

	async read(path: string): Promise<string | null> {
		return (await this.vault.adapter.exists(path))
			? this.vault.adapter.read(path)
			: null;
	}

	async write(path: string, content: string): Promise<void> {
		await this.ensureFolder(parentPath(path));
		await this.vault.adapter.write(path, content);
	}

	async append(path: string, content: string): Promise<void> {
		await this.ensureFolder(parentPath(path));
		if (await this.vault.adapter.exists(path)) {
			await this.vault.adapter.append(path, content);
		} else {
			await this.vault.adapter.write(path, content);
		}
	}

	async list(folder: string): Promise<string[]> {
		if (!(await this.vault.adapter.exists(folder))) return [];
		return (await this.vault.adapter.list(folder)).files;
	}

	private async ensureFolder(folder: string): Promise<void> {
		let current = '';
		for (const segment of folder.split('/').filter(Boolean)) {
			current = current ? `${current}/${segment}` : segment;
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
