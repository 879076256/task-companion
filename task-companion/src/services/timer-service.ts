import {
	TimerMode,
	TimerState,
	TimerTransition,
	StartTimerInput,
} from '../core/timer/model';
import {
	createIdleState,
	startTimer,
	pauseTimer,
	resumeTimer,
	finishTimerEarly,
	resetTimer,
	reconcileTimer,
	getRemainingSeconds,
} from '../core/timer/state-machine';
import { restoreTimerState } from '../core/timer/serialization';
import { ErrorLogger } from './error-logger';

export type TimerListener = (state: TimerState) => void;

export class TimerService {
	private state: TimerState = createIdleState();
	private intervalId: number | null = null;
	private readonly listeners = new Set<TimerListener>();
	private readonly logger: ErrorLogger;
	private currentTaskId: string | null = null;
	private persistenceHook: (() => void) | null = null;

	constructor(logger: ErrorLogger) {
		this.logger = logger;
	}

	getState(): TimerState {
		return this.state;
	}

	getRemainingSeconds(nowMs: number): number {
		return getRemainingSeconds(this.state, nowMs);
	}

	getTaskId(): string | null {
		return this.currentTaskId;
	}

	bindTask(taskId: string): void {
		if (!/^\^tc-[0-9a-f]{6}$/u.test(taskId)) {
			throw new Error('Invalid Task Companion task ID.');
		}
		this.currentTaskId = taskId;
		this.requestPersistence();
	}

	restoreTaskId(taskId: unknown): void {
		this.currentTaskId =
			typeof taskId === 'string' && /^\^tc-[0-9a-f]{6}$/u.test(taskId)
				? taskId
				: null;
	}

	onPersistenceRequested(hook: () => void): void {
		this.persistenceHook = hook;
	}

	subscribe(listener: TimerListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	start(mode: TimerMode, nowMs: number, durationSeconds?: number): TimerTransition {
		const input: StartTimerInput = {
			mode,
			nowMs,
			sessionId: crypto.randomUUID(),
			durationSeconds,
		};
		const result = startTimer(this.state, input);
		if (result.ok) {
			this.state = result.state;
			this.startTicking();
			this.notifyAll();
			this.requestPersistence();
		}
		return result;
	}

	pause(nowMs: number): TimerTransition {
		const result = pauseTimer(this.state, nowMs);
		if (result.ok) {
			this.state = result.state;
			this.stopTicking();
			this.notifyAll();
			this.requestPersistence();
		}
		return result;
	}

	resume(nowMs: number): TimerTransition {
		const result = resumeTimer(this.state, nowMs);
		if (result.ok) {
			this.state = result.state;
			this.startTicking();
			this.notifyAll();
			this.requestPersistence();
		}
		return result;
	}

	finishEarly(nowMs: number): TimerTransition {
		const result = finishTimerEarly(this.state, nowMs);
		if (result.ok) {
			this.state = result.state;
			this.stopTicking();
			this.notifyAll();
			this.requestPersistence();
		}
		return result;
	}

	reset(): void {
		this.state = resetTimer(this.state);
		this.stopTicking();
		this.notifyAll();
		this.requestPersistence();
	}

	/** Called on plugin load to restore persisted state */
	restore(saved: unknown, nowMs: number): void {
		this.state = restoreTimerState(saved, nowMs);
		if (this.state.status === 'running') {
			this.startTicking();
		}
	}

	/** Serialize current state for persistence */
	serialize(): unknown {
		if (this.state.status === 'idle' || this.state.status === 'finished') {
			return null;
		}
		return this.state;
	}

	/** Cleanup on plugin unload */
	dispose(): void {
		this.stopTicking();
		this.listeners.clear();
		this.persistenceHook = null;
	}

	private startTicking(): void {
		if (this.intervalId !== null) return;
		this.intervalId = window.setInterval(() => {
			const now = Date.now();
			const reconciled = reconcileTimer(this.state, now);
			if (reconciled !== this.state) {
				this.state = reconciled;
				this.stopTicking();
				this.notifyAll();
				this.requestPersistence();
				return;
			}
			this.notifyAll();
		}, 1_000);
	}

	private stopTicking(): void {
		if (this.intervalId !== null) {
			window.clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	private notifyAll(): void {
		this.listeners.forEach((listener) => {
			try {
				listener(this.state);
			} catch (error) {
				this.logger.capture('timer listener', error);
			}
		});
	}

	private requestPersistence(): void {
		try {
			this.persistenceHook?.();
		} catch (error) {
			this.logger.capture('timer persistence request', error);
		}
	}
}
