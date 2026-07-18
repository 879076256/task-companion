import type { ScriptStorage } from '../adapters/obsidian/obsidian-script-vault';
import type {
	ExtensionEventEnvelope,
	ExtensionEventName,
} from '../core/extensions/events';
import {
	cloneState,
	ControlledScript,
	ControlledScriptAction,
	ControlledScriptError,
	ControlledScriptState,
	EMPTY_CONTROLLED_SCRIPT_STATE,
	normalizeControlledScript,
	normalizeControlledScriptState,
	requiredPermission,
	sanitizedScriptError,
	selectPreviousVersion,
} from '../core/extensions/scripts';

export const SCRIPT_FOLDER = 'TaskCompanion/Scripts';
export const SCRIPT_STATE_PATH = `${SCRIPT_FOLDER}/state.json`;
export const SCRIPT_ERROR_PATH = `${SCRIPT_FOLDER}/errors.jsonl`;

export interface ControlledScriptHost {
	notice(message: string): void;
	openView(view: 'task-picker' | 'review-queue' | 'session-history'): void;
}

export interface ControlledScriptStatus {
	script: ControlledScript;
	versions: number[];
	enabled: boolean;
	disabledReason: string | null;
}

export class ControlledScriptService {
	private readonly versions = new Map<string, ControlledScript[]>();
	private state: ControlledScriptState = cloneState(EMPTY_CONTROLLED_SCRIPT_STATE);

	constructor(
		private readonly storage: ScriptStorage,
		private readonly host: ControlledScriptHost,
		private readonly idFactory: () => string = () => crypto.randomUUID(),
	) {}

	async initialize(): Promise<void> {
		this.versions.clear();
		for (const path of await this.storage.list(SCRIPT_FOLDER)) {
			if (!path.endsWith('.json') || path === SCRIPT_STATE_PATH) continue;
			const content = await this.storage.read(path);
			if (!content) continue;
			try {
				const script = normalizeControlledScript(JSON.parse(content) as unknown);
				if (!script) continue;
				const versions = this.versions.get(script.scriptId) ?? [];
				versions.push(script);
				this.versions.set(script.scriptId, versions);
			} catch {
				// Invalid files are inert and cannot affect plugin startup.
			}
		}
		const stored = await this.storage.read(SCRIPT_STATE_PATH);
		this.state = stored
			? normalizeControlledScriptState(parseJson(stored))
			: cloneState(EMPTY_CONTROLLED_SCRIPT_STATE);
		for (const [scriptId, versions] of this.versions) {
			versions.sort((left, right) => left.version - right.version);
			if (!this.state.scripts[scriptId]) {
				this.state.scripts[scriptId] = {
					activeVersion: versions.at(-1)?.version ?? 1,
					enabled: false,
					disabledReason: '首次发现，等待用户启用。',
				};
			}
		}
		await this.persistState();
	}

	list(): ControlledScriptStatus[] {
		const result: ControlledScriptStatus[] = [];
		for (const [scriptId, versions] of this.versions) {
			const selection = this.state.scripts[scriptId];
			const script =
				versions.find((candidate) => candidate.version === selection?.activeVersion) ??
				versions.at(-1);
			if (!script) continue;
			result.push({
				script,
				versions: versions.map(({ version }) => version),
				enabled: selection?.enabled ?? false,
				disabledReason: selection?.disabledReason ?? null,
			});
		}
		return result;
	}

	async enable(scriptId: string, version?: number): Promise<void> {
		const versions = this.versions.get(scriptId) ?? [];
		const selected = version
			? versions.find((script) => script.version === version)
			: versions.at(-1);
		if (!selected) throw new Error('Controlled script not found.');
		this.state.scripts[scriptId] = {
			activeVersion: selected.version,
			enabled: true,
			disabledReason: null,
		};
		await this.persistState();
	}

	async disable(scriptId: string): Promise<void> {
		const selection = this.state.scripts[scriptId];
		if (!selection) throw new Error('Controlled script not found.');
		selection.enabled = false;
		selection.disabledReason = '用户已停用。';
		await this.persistState();
	}

	async handle<K extends ExtensionEventName>(
		event: ExtensionEventEnvelope<K>,
	): Promise<void> {
		for (const status of this.list()) {
			if (!status.enabled || status.script.event !== event.name) continue;
			try {
				for (const action of status.script.actions) {
					if (!status.script.permissions.includes(requiredPermission(action))) {
						throw new Error('脚本缺少动作所需权限。');
					}
					this.execute(action);
				}
			} catch (error) {
				await this.recover(status.script, event, error);
			}
		}
	}

	private execute(action: ControlledScriptAction): void {
		if (action.type === 'notice') this.host.notice(action.message);
		else this.host.openView(action.view);
	}

	private async recover<K extends ExtensionEventName>(
		script: ControlledScript,
		event: ExtensionEventEnvelope<K>,
		error: unknown,
	): Promise<void> {
		const previous = selectPreviousVersion(
			this.versions.get(script.scriptId) ?? [],
			script.version,
		);
		this.state.scripts[script.scriptId] = {
			activeVersion: previous?.version ?? script.version,
			enabled: previous !== null,
			disabledReason: previous
				? `版本 ${script.version} 失败，已回退到 ${previous.version}。`
				: `版本 ${script.version} 失败，已停用。`,
		};
		await this.persistState();
		const record: ControlledScriptError = sanitizedScriptError(
			script,
			event,
			previous?.version ?? null,
			error instanceof Error ? error.message : '受控脚本执行失败。',
			Date.now(),
			this.idFactory(),
		);
		await this.storage.append(SCRIPT_ERROR_PATH, `${JSON.stringify(record)}\n`);
		this.host.notice(this.state.scripts[script.scriptId]?.disabledReason ?? '扩展已停用。');
	}

	private persistState(): Promise<void> {
		return this.storage.write(
			SCRIPT_STATE_PATH,
			`${JSON.stringify(this.state, null, 2)}\n`,
		);
	}
}

function parseJson(content: string): unknown {
	try {
		return JSON.parse(content) as unknown;
	} catch {
		return null;
	}
}
