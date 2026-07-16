import {
	applySessionReflection,
	ExecutionSession,
	normalizeExecutionSession,
	SessionReflection,
} from '../core/sessions/model';
import { SessionRepository } from './session-repository';

export type PendingPersistence = (pending: ExecutionSession[]) => Promise<void>;

export class SessionService {
	private pending: ExecutionSession[] = [];

	constructor(
		private readonly repository: SessionRepository,
		private readonly persistPending: PendingPersistence,
	) {}

	restorePending(value: unknown): void {
		this.pending = Array.isArray(value)
			? value
					.map((candidate) => normalizeExecutionSession(candidate))
					.filter((session): session is ExecutionSession => session !== null)
			: [];
	}

	getPending(): ExecutionSession[] {
		return this.pending.map((session) => ({ ...session }));
	}

	async prepare(session: ExecutionSession): Promise<void> {
		if (!this.pending.some(({ sessionId }) => sessionId === session.sessionId)) {
			this.pending.push(session);
		}
		await this.persistPending(this.getPending());
	}

	async finalize(sessionId: string, reflection: SessionReflection): Promise<void> {
		this.pending = this.pending.map((session) =>
			session.sessionId === sessionId
				? applySessionReflection(session, reflection)
				: session,
		);
		await this.persistPending(this.getPending());
		await this.retry(sessionId);
	}

	async retryAll(): Promise<number> {
		let saved = 0;
		for (const { sessionId } of [...this.pending]) {
			await this.retry(sessionId);
			saved += 1;
		}
		return saved;
	}

	async history(taskId: string | null): Promise<ExecutionSession[]> {
		const stored = taskId
			? await this.repository.readByTask(taskId)
			: await this.repository.readAll();
		const pending = this.pending.filter(
			(session) => taskId === null || session.taskId === taskId,
		);
		return [...pending, ...stored].sort((left, right) =>
			right.endedAt.localeCompare(left.endedAt),
		);
	}

	getCurrentNextAction(taskId: string): Promise<string | null> {
		const pendingAction = [...this.pending]
			.reverse()
			.find((session) => session.taskId === taskId && session.nextAction !== null)
			?.nextAction;
		return pendingAction
			? Promise.resolve(pendingAction)
			: this.repository.getCurrentNextAction(taskId);
	}

	private async retry(sessionId: string): Promise<void> {
		const session = this.pending.find((candidate) => candidate.sessionId === sessionId);
		if (!session) return;
		await this.repository.append(session);
		this.pending = this.pending.filter(
			(candidate) => candidate.sessionId !== sessionId,
		);
		await this.persistPending(this.getPending());
	}
}
