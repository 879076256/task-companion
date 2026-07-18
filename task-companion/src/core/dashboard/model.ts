import type { SelectedTask } from '../tasks/task-rules';

export type EmbeddedView =
	| 'status'
	| 'current'
	| 'today'
	| 'important'
	| 'daily'
	| 'pending'
	| 'review';

export type TaskListView = 'today' | 'important' | 'daily' | 'pending';

export type EmbeddedViewConfig =
	| { ok: true; view: EmbeddedView }
	| { ok: false; message: string };

const SUPPORTED_VIEWS = new Set<EmbeddedView>([
	'status',
	'current',
	'today',
	'important',
	'daily',
	'pending',
	'review',
]);

export function parseEmbeddedView(source: string): EmbeddedViewConfig {
	const lines = source
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	if (lines.length === 0) return { ok: true, view: 'status' };
	if (lines.length !== 1) {
		return { ok: false, message: 'Task Companion 组件只接受一行 view 配置。' };
	}
	const match = /^view:\s*([a-z-]+)$/u.exec(lines[0] ?? '');
	const view = match?.[1];
	if (!view || !SUPPORTED_VIEWS.has(view as EmbeddedView)) {
		return { ok: false, message: `不支持的 Task Companion 组件：${view ?? lines[0]}` };
	}
	return { ok: true, view: view as EmbeddedView };
}

export function tasksForView(
	tasks: readonly SelectedTask[],
	view: TaskListView,
): SelectedTask[] {
	return tasks.filter(({ task, category }) => {
		switch (view) {
			case 'today':
				return category === 'today' || category === 'today-important';
			case 'important':
				return category === 'important' || category === 'today-important';
			case 'daily':
				return task.hasRecurrence;
			case 'pending':
				return category === 'pending';
		}
	});
}

export function embeddedViewTitle(view: EmbeddedView): string {
	switch (view) {
		case 'status':
			return '专注状态';
		case 'current':
			return '当前任务';
		case 'today':
			return '今日待办';
		case 'important':
			return '重点任务';
		case 'daily':
			return '日常任务';
		case 'pending':
			return '待推进任务';
		case 'review':
			return '任务复盘';
	}
}
