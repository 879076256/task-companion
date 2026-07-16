import type { SessionLogStorage } from '../adapters/obsidian/obsidian-session-vault';
import { parseSessionLog, serializeSessionLogEntry } from '../core/sessions/log-codec';
import type { ExecutionSession } from '../core/sessions/model';

export const SESSION_LOG_FOLDER = 'TaskCompanion/Sessions';

export class SessionRepository {
	constructor(private readonly storage: SessionLogStorage) {}

	async append(session: ExecutionSession): Promise<void> {
		const path = pathForSession(session);
		const current = await this.storage.read(path);
		if (current !== null) {
			const existing = parseSessionLog(current).sessions.some(
				(candidate) => candidate.sessionId === session.sessionId,
			);
			if (existing) return;
		}
		await this.storage.append(path, serializeSessionLogEntry(session));
	}

	async readAll(): Promise<ExecutionSession[]> {
		const paths = (await this.storage.list(SESSION_LOG_FOLDER))
			.filter((path) => /\/\d{4}-\d{2}\.jsonl$/u.test(path))
			.sort();
		const sessions: ExecutionSession[] = [];
		for (const path of paths) {
			const content = await this.storage.read(path);
			if (content !== null) sessions.push(...parseSessionLog(content).sessions);
		}
		return sessions.sort((left, right) => right.endedAt.localeCompare(left.endedAt));
	}

	async readByTask(taskId: string): Promise<ExecutionSession[]> {
		return (await this.readAll()).filter((session) => session.taskId === taskId);
	}

	async getCurrentNextAction(taskId: string): Promise<string | null> {
		const sessions = await this.readByTask(taskId);
		return sessions.find((session) => session.nextAction !== null)?.nextAction ?? null;
	}
}

export function pathForSession(session: ExecutionSession): string {
	return `${SESSION_LOG_FOLDER}/${session.endedAt.slice(0, 7)}.jsonl`;
}
