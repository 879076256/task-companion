import { LogSink } from '../services/error-logger';

export class ConsoleLogSink implements LogSink {
	error(message: string): void {
		console.error(message);
	}
}

