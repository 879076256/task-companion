import {
	isHabitCheckinText,
	type ParsedTask,
	type SelectedTask,
	type TaskPriority,
} from '../tasks/task-rules';

export type HomeReminderTodayLabel =
	| '逾期'
	| '今日截止'
	| '今日安排'
	| '已安排'
	| '今日开始'
	| '执行中'
	| '已开始';

export interface HomeReminderItem {
	task: ParsedTask;
	displayText: string;
	priority: TaskPriority | null;
	recurring: boolean;
	start: string | null;
	scheduled: string | null;
	due: string | null;
	today: { rank: number; label: HomeReminderTodayLabel } | null;
}

export interface HomeReminderGroups {
	daily: HomeReminderItem[];
	today: HomeReminderItem[];
	important: HomeReminderItem[];
	pending: HomeReminderItem[];
}

const PRIORITY_ORDER: Record<TaskPriority, number> = {
	'⏫': 0,
	'🔼': 1,
	'🔽': 2,
	'⏬': 3,
};

export function buildHomeReminderGroups(
	activeTasks: readonly ParsedTask[],
	completedRecurringTasks: readonly ParsedTask[],
	today: string,
): HomeReminderGroups {
	const records = activeTasks.map((task) => toReminderItem(task, today));
	const byPriorityDateName = (left: HomeReminderItem, right: HomeReminderItem) =>
		priorityRank(left.priority) - priorityRank(right.priority) ||
		relatedKey(left).localeCompare(relatedKey(right)) ||
		left.displayText.localeCompare(right.displayText, 'zh-Hans-CN');
	const history = recurringHistory(completedRecurringTasks);
	const dailyPath = `Calendar/Journal/Daily/${today}.md`;
	const weekKey = addDays(today, 7) ?? today;

	const daily = records
		.filter(
			(record) =>
				record.recurring &&
				recurringTaskIsAvailable(record, history, today) &&
				(!isHabitCheckinText(record.task.text) ||
					record.task.sourcePath === dailyPath),
		)
		.sort(byPriorityDateName);
	const todayTasks = records
		.filter((record) => record.today !== null)
		.sort(
			(left, right) =>
				(left.today?.rank ?? 99) - (right.today?.rank ?? 99) ||
				byPriorityDateName(left, right),
		);
	const important = records
		.filter((record) => record.priority === '⏫')
		.sort((left, right) => {
			const rank = (record: HomeReminderItem) =>
				record.today
					? record.today.rank
					: relatedKey(record) <= weekKey
						? 6
						: relatedKey(record) === '9999-12-31'
							? 8
							: 7;
			return (
				rank(left) - rank(right) ||
				relatedKey(left).localeCompare(relatedKey(right)) ||
				left.displayText.localeCompare(right.displayText, 'zh-Hans-CN')
			);
		});
	const pending = records
		.filter(
			(record) =>
				record.today === null && !record.recurring && record.priority !== '⏫',
		)
		.sort(byPriorityDateName);

	return { daily, today: todayTasks, important, pending };
}

export function reminderItemsAsSelected(
	items: readonly HomeReminderItem[],
	view: keyof HomeReminderGroups,
): SelectedTask[] {
	return items.map((item) => ({
		task: item.task,
		category:
			view === 'pending'
				? 'pending'
				: view === 'important'
				? item.today
					? 'today-important'
					: 'important'
				: view === 'daily'
					? 'recurring'
					: item.priority === '⏫'
						? 'today-important'
						: 'today',
	}));
}

function toReminderItem(task: ParsedTask, today: string): HomeReminderItem {
	return {
		task,
		displayText: cleanTaskText(task.text),
		priority: task.priority,
		recurring: task.hasRecurrence,
		start: task.start,
		scheduled: task.scheduled,
		due: task.due,
		today: todayState(task, today),
	};
}

function todayState(
	task: ParsedTask,
	today: string,
): HomeReminderItem['today'] {
	if (task.due && task.due < today) return { rank: 0, label: '逾期' };
	if (task.due === today) return { rank: 1, label: '今日截止' };
	if (task.scheduled === today) return { rank: 2, label: '今日安排' };
	if (task.scheduled && task.scheduled < today) return { rank: 3, label: '已安排' };
	if (task.start === today) return { rank: 4, label: '今日开始' };
	if (task.start && task.due && task.start <= today && today <= task.due) {
		return { rank: 5, label: '执行中' };
	}
	if (task.start && task.start <= today) return { rank: 6, label: '已开始' };
	return null;
}

function recurringHistory(tasks: readonly ParsedTask[]) {
	const history = new Map<string, { completedKey: string; nextKey: string | null }>();
	for (const task of tasks) {
		if (!task.completion || !task.hasRecurrence) continue;
		const name = cleanTaskText(task.text);
		const previous = history.get(name);
		if (!previous || task.completion > previous.completedKey) {
			history.set(name, {
				completedKey: task.completion,
				nextKey: nextRecurrenceKey(task.recurrence, task.completion),
			});
		}
	}
	return history;
}

function recurringTaskIsAvailable(
	record: HomeReminderItem,
	history: ReadonlyMap<string, { completedKey: string; nextKey: string | null }>,
	today: string,
): boolean {
	const explicitKey = [record.start, record.scheduled, record.due]
		.filter((value): value is string => value !== null)
		.sort()[0];
	if (explicitKey) return explicitKey <= today;
	const previous = history.get(record.displayText);
	if (!previous) return true;
	return previous.nextKey
		? previous.nextKey <= today
		: previous.completedKey < today;
}

function nextRecurrenceKey(ruleValue: string | null, completedKey: string): string | null {
	const rule = (ruleValue ?? '').replace(/\s+when done\s*$/iu, '').toLowerCase();
	if (!rule || !parseDate(completedKey)) return null;
	if (/\bevery\s+weekday\b/u.test(rule)) {
		let next = addDays(completedKey, 1);
		while (next && weekday(next) > 5) next = addDays(next, 1);
		return next;
	}
	const weekdays: Record<string, number> = {
		monday: 1,
		tuesday: 2,
		wednesday: 3,
		thursday: 4,
		friday: 5,
		saturday: 6,
		sunday: 7,
	};
	for (const [name, expected] of Object.entries(weekdays)) {
		if (!new RegExp(`\\bevery\\s+${name}\\b`, 'u').test(rule)) continue;
		let next = addDays(completedKey, 1);
		while (next && weekday(next) !== expected) next = addDays(next, 1);
		return next;
	}
	const interval = /\bevery\s+(?:(\d+)\s+)?(day|days|week|weeks|month|months|year|years)\b/u.exec(rule);
	if (!interval) return null;
	const count = Number(interval[1] ?? 1);
	const unit = interval[2]?.replace(/s$/u, '');
	if (unit === 'day') return addDays(completedKey, count);
	if (unit === 'week') return addDays(completedKey, count * 7);
	if (unit === 'month') return addMonths(completedKey, count);
	if (unit === 'year') return addMonths(completedKey, count * 12);
	return null;
}

function cleanTaskText(text: string): string {
	return text
		.replace(/(?:⏫|🔼|🔽|⏬)/gu, '')
		.replace(/🔁\s*(?:every\s+[^📅⏳🛫➕✅❌]*)?/giu, '')
		.replace(/(?:📅|⏳|🛫|➕|✅|❌)\s*\d{4}-\d{2}-\d{2}/gu, '')
		.replace(/\s+\^tc-[0-9a-f]{6}\s*$/giu, '')
		.replace(/\s+/gu, ' ')
		.trim();
}

function relatedKey(record: HomeReminderItem): string {
	return [record.due, record.scheduled, record.start]
		.filter((value): value is string => value !== null)
		.sort()[0] ?? '9999-12-31';
}

function priorityRank(priority: TaskPriority | null): number {
	return priority ? PRIORITY_ORDER[priority] : 4;
}

function addDays(value: string, count: number): string | null {
	const date = parseDate(value);
	if (!date) return null;
	date.setUTCDate(date.getUTCDate() + count);
	return formatDate(date);
}

function addMonths(value: string, count: number): string | null {
	const date = parseDate(value);
	if (!date) return null;
	const day = date.getUTCDate();
	date.setUTCDate(1);
	date.setUTCMonth(date.getUTCMonth() + count);
	const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
	date.setUTCDate(Math.min(day, lastDay));
	return formatDate(date);
}

function weekday(value: string): number {
	const day = parseDate(value)?.getUTCDay() ?? 0;
	return day === 0 ? 7 : day;
}

function parseDate(value: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
	const date = new Date(`${value}T00:00:00.000Z`);
	return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}
