const TASK_ID_PATTERN = /^\^tc-[0-9a-f]{6}$/u;
const TRAILING_BLOCK_ID_PATTERN = /(?:^|\s)(\^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)\s*$/u;

export function isTaskId(value: string): boolean {
	return TASK_ID_PATTERN.test(value);
}

export function extractBlockId(line: string): string | null {
	return TRAILING_BLOCK_ID_PATTERN.exec(line)?.[1] ?? null;
}

export function appendTaskId(line: string, taskId: string): string | null {
	if (!isTaskId(taskId) || extractBlockId(line)) return null;
	return `${line.trimEnd()} ${taskId}`;
}

export function generateTaskId(
	existingIds: ReadonlySet<string>,
	randomHex: () => string = defaultRandomHex,
): string {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		const candidate = `^tc-${randomHex()}`;
		if (isTaskId(candidate) && !existingIds.has(candidate)) return candidate;
	}
	throw new Error('Unable to generate a unique Task Companion task ID.');
}

function defaultRandomHex(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(3));
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
