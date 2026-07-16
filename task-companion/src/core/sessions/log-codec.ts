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
