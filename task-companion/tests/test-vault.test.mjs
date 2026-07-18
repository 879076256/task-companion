import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const installedRoot = new URL(
	'../../test-vault/.obsidian/plugins/task-companion/',
	import.meta.url,
);

test('test vault contains the three Obsidian plugin artifacts', async () => {
	const [manifest, bundle, styles] = await Promise.all([
		readFile(new URL('manifest.json', installedRoot), 'utf8'),
		readFile(new URL('main.js', installedRoot), 'utf8'),
		readFile(new URL('styles.css', installedRoot), 'utf8'),
	]);

	const parsedManifest = JSON.parse(manifest);
	assert.equal(parsedManifest.id, 'task-companion');
	assert.equal(parsedManifest.version, '1.0.0');
	assert.equal(parsedManifest.author, 'teacher Zhang');
	assert.equal(parsedManifest.isDesktopOnly, true);
	assert.match(bundle, /open-test-modal/);
	assert.match(bundle, /record-quick-progress/);
	assert.match(bundle, /retry-session-writes/);
	assert.match(bundle, /manage-subtasks/);
	assert.match(bundle, /complete-task/);
	assert.match(bundle, /open-review-queue/);
	assert.match(bundle, /retry-review-writes/);
	assert.match(bundle, /taskcompanion-widget-error/u);
	assert.match(bundle, /taskcompanion-refresh-button/u);
	assert.match(styles, /\.taskcompanion-widget/u);
	assert.match(styles, /@media \(max-width: 520px\)/u);
});

test('test vault is installed byte-for-byte from the 1.0.0 release', async () => {
	for (const filename of ['main.js', 'manifest.json', 'styles.css']) {
		const [installed, released] = await Promise.all([
			readFile(new URL(filename, installedRoot)),
			readFile(
				new URL(`../release/task-companion-1.0.0/${filename}`, import.meta.url),
			),
		]);
		assert.deepEqual(installed, released);
	}
});

test('repository fixture contains a structurally valid artificial session', async () => {
	const content = await readFile(
		new URL('./fixtures/session-v1.jsonl', import.meta.url),
		'utf8',
	);
	const lines = content.trim().split('\n').map((line) => JSON.parse(line));
	assert.ok(lines.length >= 1);
	for (const session of lines) {
		assert.equal(session.schemaVersion, 1);
		assert.match(session.taskId, /^\^tc-[0-9a-f]{6}$/u);
		assert.match(session.sessionId, /^[0-9a-f-]+$/u);
		assert.equal(typeof session.activeDurationSeconds, 'number');
		assert.equal(typeof session.pausedDurationSeconds, 'number');
	}
	const sample = lines.find(
		(session) => session.sessionId === '00000000-0000-4000-8000-000000000001',
	);
	assert.equal(sample?.taskId, '^tc-2426d8');
	assert.equal(sample?.mode, 'focus-25');
	assert.equal(sample?.activeDurationSeconds, 1_500);
});
