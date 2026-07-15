export interface LogSink {
	error(message: string): void;
}

export class ErrorLogger {
	constructor(private readonly sink: LogSink) {}

	capture(operation: string, error: unknown): void {
		const summary =
			error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown error';
		this.sink.error(`[Task Companion] ${operation} failed — ${summary}`);
	}
}

