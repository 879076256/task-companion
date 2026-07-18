import {
	ExecutionSession,
	normalizeExecutionSession,
} from './model';

export interface SessionLogReadResult {
	sessions: ExecutionSession[];
	invalidLineNumbers: number[];
}

export function serializeSessionLogEntry(session: ExecutionSession): string {
	return `${JSON.stringify(session)}\n`;
}

export function parseSessionLog(text: string): SessionLogReadResult {
	const sessions: ExecutionSession[] = [];
	const invalidLineNumbers: number[] = [];
	for (const [index, line] of text.split(/\r?\n/u).entries()) {
		if (line.trim().length === 0) continue;
		try {
			const session = normalizeExecutionSession(JSON.parse(line) as unknown);
			if (session) sessions.push(session);
			else invalidLineNumbers.push(index + 1);
		} catch {
			invalidLineNumbers.push(index + 1);
		}
	}
	return { sessions, invalidLineNumbers };
}

export function purgeSubtaskSessionsFromLog(
	text: string,
	taskId: string,
	subtaskId: string,
): { content: string; removed: number } {
	let removed = 0;
	const lines = text.split(/\r?\n/u).filter((line) => {
		if (line.trim().length === 0) return true;
		try {
			const session = normalizeExecutionSession(JSON.parse(line) as unknown);
			if (session?.taskId === taskId && session.subtaskId === subtaskId) {
				removed += 1;
				return false;
			}
		} catch {
			// Invalid lines are preserved verbatim during a targeted purge.
		}
		return true;
	});
	return { content: lines.join('\n'), removed };
}
