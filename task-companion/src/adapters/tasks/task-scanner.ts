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

export type TaskReference = Pick<ParsedTask, 'id' | 'sourcePath'>;

export interface ScanResult {
	tasks: ScannerTask[];
	historyTasks: ParsedTask[];
	failures: ScanFailure[];
}

export interface ReadonlyTaskSnapshot {
	tasks: ParsedTask[];
	historyTasks: ParsedTask[];
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
		const historyTasks: ParsedTask[] = [];
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
				historyTasks,
			);
		}
		return { tasks, historyTasks, failures };
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
			).filter(({ task }) => !task.hasRecurrence),
			failures: result.failures,
		};
	}

	async snapshotReadonly(): Promise<ReadonlyTaskSnapshot> {
		const tasks: ParsedTask[] = [];
		const historyTasks: ParsedTask[] = [];
		const failures: ScanFailure[] = [];
		for (const path of this.vault.listMarkdownPaths()) {
			let content: string;
			try {
				content = await this.vault.read(path);
			} catch {
				failures.push({ path, lineNumber: null, reason: 'read-failed' });
				continue;
			}
			const parsed = content
				.split('\n')
				.map((line, index) => parseTaskLine(line, path, index + 1))
				.filter((task): task is ParsedTask => task !== null);
			tasks.push(...filterFormalTasks(parsed));
			historyTasks.push(
				...parsed.filter(
					(task) => task.checked && task.hasRecurrence && task.completion !== null,
				),
			);
		}
		return { tasks, historyTasks, failures };
	}

	async complete(selected: SelectedTask | ParsedTask): Promise<void> {
		const task = 'task' in selected ? selected.task : selected;
		await this.setChecked(task, true);
	}

	async reopen(task: TaskReference): Promise<void> {
		await this.setChecked(task, false);
	}

	async isCompleted(task: TaskReference): Promise<boolean> {
		const match = findTaskById(
			await this.vault.read(task.sourcePath),
			task.sourcePath,
			task.id,
		);
		if (match.task.cancelled) return false;
		return match.task.checked;
	}

	private async setChecked(task: TaskReference, checked: boolean): Promise<void> {
		await this.vault.process(task.sourcePath, (content) => {
			const lines = content.split('\n');
			const match = findTaskById(content, task.sourcePath, task.id);
			if (match.task.cancelled) throw new Error('task-unavailable');
			if (match.task.checked === checked) return content;
			const updated = checked
				? match.line.replace(/^(\s*[-*]\s+)\[ \]/u, '$1[x]')
				: match.line.replace(/^(\s*[-*]\s+)\[[xX]\]/u, '$1[ ]');
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
		historyTasks: ParsedTask[],
	): Promise<void> {
		const { path, content: originalContent } = snapshot;
		const lines = originalContent.split('\n');
		const parsed = lines
			.map((line, index) => parseTaskLine(line, path, index + 1))
			.filter((task): task is ParsedTask => task !== null);
		historyTasks.push(
			...parsed.filter(
				(task) => task.checked && task.hasRecurrence && task.completion !== null,
			),
		);
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

function findTaskById(
	content: string,
	sourcePath: string,
	taskId: string,
): { line: string; index: number; task: ParsedTask } {
	const matches = content
		.split('\n')
		.map((line, index) => ({
			line,
			index,
			task: parseTaskLine(line, sourcePath, index + 1),
		}))
		.filter(({ task }) => task?.blockId === taskId);
	if (matches.length !== 1) throw new Error('task-id-conflict');
	const match = matches[0];
	if (!match?.task) throw new Error('task-unavailable');
	return { line: match.line, index: match.index, task: match.task };
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
