import type { ReviewEvent } from './model';

export function buildReviewMarkdown(event: ReviewEvent): string {
	const { stats } = event;
	return [
		'---',
		'type: task-companion-review',
		`reviewId: ${JSON.stringify(event.reviewId)}`,
		`taskId: ${JSON.stringify(event.taskId)}`,
		`taskTitle: ${JSON.stringify(event.taskTitle)}`,
		`source: ${JSON.stringify(event.sourcePath)}`,
		`completedAt: ${event.completedAt}`,
		'reviewStatus: completed',
		'---',
		'',
		`# 任务复盘：${event.taskTitle}`,
		'',
		`- 原任务：[[${event.sourcePath}]]`,
		`- 任务跨度：${formatDuration(stats.taskSpanSeconds)}`,
		`- 实际执行天数：${stats.activeDayCount} 天`,
		`- 执行会话：${stats.sessionCount} 次`,
		`- 总有效时间：${formatDuration(stats.totalActiveDurationSeconds)}`,
		`- 暂停时间：${formatDuration(stats.totalPausedDurationSeconds)}`,
		`- 提前结束：${stats.endedEarlySessionCount} 次`,
		`- 初始子任务：${stats.initialSubtaskCount} 个`,
		`- 执行中新增：${stats.addedDuringExecutionCount} 个`,
		`- 已完成 / 已取消子任务：${stats.completedSubtaskCount} / ${stats.cancelledSubtaskCount}`,
		`- 最长耗时步骤：${stats.longestStepTitle ?? '无'}（${formatDuration(stats.longestStepActiveDurationSeconds)}）`,
		`- 最后进展：${stats.lastProgress ?? '未填写'}`,
		`- 未完成子任务：${stats.outstandingSubtasks.join('、') || '无'}`,
		'',
		'## 自由复盘',
		'',
		event.reviewText ?? '未填写。',
		'',
		'## 引导问题（可选）',
		'',
		`### 哪些地方做得好？\n\n${event.wentWell ?? '未填写。'}`,
		'',
		`### 哪些地方需要返工，或遇到了什么阻塞？\n\n${event.reworkOrBlocker ?? '未填写。'}`,
		'',
		`### 下次准备如何调整？\n\n${event.nextAdjustment ?? '未填写。'}`,
		'',
	].join('\n');
}

function formatDuration(seconds: number): string {
	const days = Math.floor(seconds / 86_400);
	const hours = Math.floor((seconds % 86_400) / 3_600);
	const minutes = Math.floor((seconds % 3_600) / 60);
	const parts = [
		days > 0 ? `${days} 天` : null,
		hours > 0 ? `${hours} 小时` : null,
		minutes > 0 ? `${minutes} 分钟` : null,
	].filter((part): part is string => part !== null);
	return parts.join(' ') || `${seconds} 秒`;
}
