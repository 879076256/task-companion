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

	assert.equal(JSON.parse(manifest).id, 'task-companion');
	assert.match(bundle, /open-test-modal/);
	assert.match(styles, /Phase 1/);
});
