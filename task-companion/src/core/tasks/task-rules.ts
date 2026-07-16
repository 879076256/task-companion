export type TaskPriority = '⏫' | '🔼' | '🔽' | '⏬';
export type TaskCategory =
	| 'today'
	| 'important'
	| 'today-important'
	| 'recurring';

export interface ParsedTask {
	id: string;
	text: string;
	raw: string;
	sourcePath: string;
	lineNumber: number;
	checked: boolean;
	cancelled: boolean;
	priority: TaskPriority | null;
	hasRecurrence: boolean;
	start: string | null;
	scheduled: string | null;
	due: string | null;
	blockId: string | null;
}

export interface SelectedTask {
	task: ParsedTask;
	category: TaskCategory;
}

const TASK_LINE_PATTERN = /^\s*[-*]\s+\[([ xX-])\]\s+(.+?)\s*$/u;
const PRIORITY_PATTERN = /(⏫|🔼|🔽|⏬)/u;
const BLOCK_ID_PATTERN = /(?:^|\s)(\^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)\s*$/u;

export function parseTaskLine(
	line: string,
	sourcePath: string,
	lineNumber: number,
): ParsedTask | null {
	const match = TASK_LINE_PATTERN.exec(line);
	if (!match) return null;

	const checkbox = match[1] ?? '';
	const text = match[2] ?? '';
	const blockId = BLOCK_ID_PATTERN.exec(text)?.[1] ?? null;
	const cancelled = checkbox === '-' || /\b(?:cancelled|canceled)\b|取消/iu.test(text);
	const checked = checkbox === 'x' || checkbox === 'X';

	return {
		id: blockId ?? `${sourcePath}:${lineNumber}`,
		text,
		raw: line,
		sourcePath,
		lineNumber,
		checked,
		cancelled,
		priority: (PRIORITY_PATTERN.exec(text)?.[1] as TaskPriority | undefined) ?? null,
		hasRecurrence: text.includes('🔁'),
		start: extractDate(text, /🛫\s*(\d{4}-\d{2}-\d{2})/u),
		scheduled: extractDate(text, /⏳\s*(\d{4}-\d{2}-\d{2})/u),
		due: extractDate(text, /📅\s*(\d{4}-\d{2}-\d{2})/u),
		blockId,
	};
}

export function filterFormalTasks(tasks: readonly ParsedTask[]): ParsedTask[] {
	return tasks.filter(
		(task) =>
			!task.checked &&
			!task.cancelled &&
			(task.priority !== null || task.hasRecurrence),
	);
}

export function isTodayTask(task: ParsedTask, today: string): boolean {
	if (!filterFormalTasks([task]).length || !isDateString(today)) return false;
	if (task.scheduled === today || task.due === today) return true;
	if (task.due && task.due < today) return true;
	if (task.start && task.due) return task.start <= today && today <= task.due;
	if (task.start && !task.due) return task.start <= today;
	return false;
}

export function isOverdueTask(task: ParsedTask, today: string): boolean {
	return (
		!task.checked &&
		!task.cancelled &&
		isDateString(today) &&
		task.due !== null &&
		task.due < today
	);
}

export function isImportantTask(task: ParsedTask): boolean {
	return !task.checked && !task.cancelled && task.priority === '⏫';
}

export function selectTasks(
	tasks: readonly ParsedTask[],
	today: string,
): SelectedTask[] {
	const selected: SelectedTask[] = [];
	const seen = new Set<string>();

	for (const task of filterFormalTasks(tasks)) {
		if (seen.has(task.id)) continue;
		const todayTask = isTodayTask(task, today);
		const important = isImportantTask(task);
		let category: TaskCategory | null = null;

		if (todayTask && important) category = 'today-important';
		else if (todayTask) category = 'today';
		else if (important) category = 'important';
		else if (task.hasRecurrence) category = 'recurring';

		if (category) {
			selected.push({ task, category });
			seen.add(task.id);
		}
	}
	return selected;
}

export function categoryLabel(category: TaskCategory): string {
	switch (category) {
		case 'today':
			return '今日待办';
		case 'important':
			return '重点任务';
		case 'today-important':
			return '今日待办＋重点任务';
		case 'recurring':
			return '日常任务';
	}
}

function extractDate(text: string, pattern: RegExp): string | null {
	const value = pattern.exec(text)?.[1];
	return value && isDateString(value) ? value : null;
}

function isDateString(value: string): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
	if (!match) return false;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
}
