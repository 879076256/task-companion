import { appendTaskId, extractBlockId, generateTaskId, isTaskId } from '../../core/tasks/task-id';
import {
	filterFormalTasks,
	ParsedTask,
	parseTaskLine,
	SelectedTask,
	selectTasks,
} from '../../core/tasks/task-rules';

export interface TaskVaultAccess {
	listMarkdownPaths(): string[];
	read(path: string): Promise<string>;
	process(path: string, transform: (content: string) => string): Promise<void>;
}

export type ScanFailureReason =
	| 'read-failed'
	| 'conflicting-block-id'
	| 'duplicate-task-id'
	| 'write-conflict';

export interface ScanFailure {
	path: string;
	lineNumber: number | null;
	reason: ScanFailureReason;
}

export interface ScannerTask {
	id: string;
	parsed: ParsedTask;
}

export interface ScanResult {
	tasks: ScannerTask[];
	failures: ScanFailure[];
}

interface PlannedTask {
	lineIndex: number;
	originalLine: string;
	updatedLine: string;
	task: ScannerTask;
}

interface FileSnapshot {
	path: string;
	content: string;
}

export class TaskScanner {
	constructor(
		private readonly vault: TaskVaultAccess,
		private readonly idFactory: (
			existingIds: ReadonlySet<string>,
		) => string = generateTaskId,
	) {}

	async scan(): Promise<ScanResult> {
		const tasks: ScannerTask[] = [];
		const failures: ScanFailure[] = [];
		const snapshots: FileSnapshot[] = [];

		for (const path of this.vault.listMarkdownPaths()) {
			try {
				snapshots.push({ path, content: await this.vault.read(path) });
			} catch {
				failures.push({ path, lineNumber: null, reason: 'read-failed' });
			}
		}

		const usedIds = collectExistingTaskIds(snapshots);
		const acceptedExistingIds = new Set<string>();
		for (const snapshot of snapshots) {
			await this.scanFile(
				snapshot,
				tasks,
				failures,
				usedIds,
				acceptedExistingIds,
			);
		}
		return { tasks, failures };
	}

	async select(today: string): Promise<{
		tasks: SelectedTask[];
		failures: ScanFailure[];
	}> {
		const result = await this.scan();
		return {
			tasks: selectTasks(
				result.tasks.map(({ parsed }) => parsed),
				today,
			),
			failures: result.failures,
		};
	}

	async complete(selected: SelectedTask): Promise<void> {
		await this.vault.process(selected.task.sourcePath, (content) => {
			const lines = content.split('\n');
			const matches = lines
				.map((line, index) => ({
					line,
					index,
					task: parseTaskLine(line, selected.task.sourcePath, index + 1),
				}))
				.filter(({ task }) => task?.blockId === selected.task.id);
			if (matches.length !== 1) throw new Error('task-id-conflict');
			const match = matches[0];
			if (!match?.task || match.task.cancelled) throw new Error('task-unavailable');
			if (match.task.checked) return content;
			const updated = match.line.replace(
				/^(\s*[-*]\s+)\[ \]/u,
				'$1[x]',
			);
			if (updated === match.line) throw new Error('task-write-conflict');
			lines[match.index] = updated;
			return lines.join('\n');
		});
	}

	private async scanFile(
		snapshot: FileSnapshot,
		tasks: ScannerTask[],
		failures: ScanFailure[],
		usedIds: Set<string>,
		acceptedExistingIds: Set<string>,
	): Promise<void> {
		const { path, content: originalContent } = snapshot;
		const lines = originalContent.split('\n');
		const parsed = lines
			.map((line, index) => parseTaskLine(line, path, index + 1))
			.filter((task): task is ParsedTask => task !== null);
		const formal = filterFormalTasks(parsed);
		const planned: PlannedTask[] = [];

		for (const task of formal) {
			const blockId = extractBlockId(task.raw);
			if (blockId) {
				if (!isTaskId(blockId)) {
					failures.push({
						path,
						lineNumber: task.lineNumber,
						reason: 'conflicting-block-id',
					});
					continue;
				}
				if (acceptedExistingIds.has(blockId)) {
					failures.push({
						path,
						lineNumber: task.lineNumber,
						reason: 'duplicate-task-id',
					});
					continue;
				}
				acceptedExistingIds.add(blockId);
				tasks.push({ id: blockId, parsed: { ...task, id: blockId, blockId } });
				continue;
			}

			const taskId = this.idFactory(usedIds);
			const updatedLine = appendTaskId(task.raw, taskId);
			if (!updatedLine) continue;
			usedIds.add(taskId);
			planned.push({
				lineIndex: task.lineNumber - 1,
				originalLine: task.raw,
				updatedLine,
				task: {
					id: taskId,
					parsed: { ...task, id: taskId, blockId: taskId, raw: updatedLine },
				},
			});
		}

		if (planned.length === 0) return;
		try {
			await this.vault.process(path, (currentContent) => {
				if (currentContent !== originalContent) throw new Error('content-conflict');
				const currentLines = currentContent.split('\n');
				for (const change of planned) {
					if (currentLines[change.lineIndex] !== change.originalLine) {
						throw new Error('line-conflict');
					}
					currentLines[change.lineIndex] = change.updatedLine;
				}
				return currentLines.join('\n');
			});
			tasks.push(...planned.map(({ task }) => task));
		} catch {
			for (const change of planned) {
				usedIds.delete(change.task.id);
				failures.push({
					path,
					lineNumber: change.lineIndex + 1,
					reason: 'write-conflict',
				});
			}
		}
	}
}

function collectExistingTaskIds(snapshots: readonly FileSnapshot[]): Set<string> {
	const ids = new Set<string>();
	for (const { path, content } of snapshots) {
		for (const [index, line] of content.split('\n').entries()) {
			const task = parseTaskLine(line, path, index + 1);
			if (!task || filterFormalTasks([task]).length === 0) continue;
			const blockId = extractBlockId(task.raw);
			if (blockId && isTaskId(blockId)) ids.add(blockId);
		}
	}
	return ids;
}
