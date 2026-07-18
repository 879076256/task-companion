import {
	applySessionReflection,
	ExecutionSession,
	normalizeExecutionSession,
	SessionReflection,
} from '../core/sessions/model';
import { SessionRepository } from './session-repository';

export type PendingPersistence = (pending: ExecutionSession[]) => Promise<void>;
export type SessionChangeListener = (taskId: string) => void;
export type SessionSavedListener = (session: ExecutionSession) => void;

export class SessionService {
	private pending: ExecutionSession[] = [];
	private readonly listeners = new Set<SessionChangeListener>();
	private readonly savedListeners = new Set<SessionSavedListener>();
	private readonly purgedSubtasks = new Set<string>();
	private readonly activeWrites = new Set<Promise<void>>();

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

	subscribe(listener: SessionChangeListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	onSaved(listener: SessionSavedListener): () => void {
		this.savedListeners.add(listener);
		return () => this.savedListeners.delete(listener);
	}

	async prepare(session: ExecutionSession): Promise<void> {
		if (this.isPurged(session)) return;
		if (!this.pending.some(({ sessionId }) => sessionId === session.sessionId)) {
			this.pending.push(session);
			this.notify(session.taskId);
		}
		await this.persistPending(this.getPending());
	}

	async finalize(sessionId: string, reflection: SessionReflection): Promise<void> {
		const taskId = this.pending.find(
			(session) => session.sessionId === sessionId,
		)?.taskId;
		this.pending = this.pending.map((session) =>
			session.sessionId === sessionId
				? applySessionReflection(session, reflection)
				: session,
		);
		if (taskId) this.notify(taskId);
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

	async purgeSubtask(taskId: string, subtaskId: string): Promise<number> {
		this.purgedSubtasks.add(subtaskKey(taskId, subtaskId));
		await Promise.all(
			[...this.activeWrites].map((write) => write.catch(() => undefined)),
		);
		const removedPending = this.pending.filter(
			(session) =>
				session.taskId === taskId && session.subtaskId === subtaskId,
		).length;
		const nextPending = this.pending.filter(
			(session) =>
				session.taskId !== taskId || session.subtaskId !== subtaskId,
		);
		await this.persistPending(nextPending.map((session) => ({ ...session })));
		this.pending = nextPending;
		const removedStored = await this.repository.purgeSubtask(taskId, subtaskId);
		this.notify(taskId);
		return removedPending + removedStored;
	}

	private async retry(sessionId: string): Promise<void> {
		const session = this.pending.find((candidate) => candidate.sessionId === sessionId);
		if (!session) return;
		if (this.isPurged(session)) {
			this.pending = this.pending.filter(
				(candidate) => candidate.sessionId !== sessionId,
			);
			this.notify(session.taskId);
			await this.persistPending(this.getPending());
			return;
		}
		const write = this.repository.append(session);
		this.activeWrites.add(write);
		try {
			await write;
		} finally {
			this.activeWrites.delete(write);
		}
		for (const listener of this.savedListeners) {
			try {
				listener({ ...session });
			} catch {
				// Extension listeners must not interrupt durable writes.
			}
		}
		this.pending = this.pending.filter(
			(candidate) => candidate.sessionId !== sessionId,
		);
		this.notify(session.taskId);
		await this.persistPending(this.getPending());
	}

	private isPurged(session: ExecutionSession): boolean {
		return (
			session.subtaskId !== null &&
			this.purgedSubtasks.has(subtaskKey(session.taskId, session.subtaskId))
		);
	}

	private notify(taskId: string): void {
		for (const listener of this.listeners) {
			try {
				listener(taskId);
			} catch {
				// UI listeners must not interrupt durable session writes.
			}
		}
	}
}

function subtaskKey(taskId: string, subtaskId: string): string {
	return `${taskId}\u0000${subtaskId}`;
}
