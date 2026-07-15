import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

test('manifest identifies the isolated Task Companion skeleton', async () => {
	const manifest = await readJson(new URL('../manifest.json', import.meta.url));

	assert.equal(manifest.id, 'task-companion');
	assert.equal(manifest.name, 'Task Companion');
	assert.equal(manifest.version, '0.0.0');
});

test('Phase 1 source contains no timer, network, or task operations', async () => {
	const sourceFiles = [
		'../src/main.ts',
		'../src/core/plugin-constants.ts',
		'../src/adapters/console-log-sink.ts',
		'../src/services/error-logger.ts',
		'../src/settings/model.ts',
		'../src/settings/settings-tab.ts',
		'../src/ui/status-modal.ts',
	];
	const source = (
		await Promise.all(
			sourceFiles.map((path) => readFile(new URL(path, import.meta.url), 'utf8')),
		)
	).join('\n');

	for (const forbidden of [
		'setInterval',
		'setTimeout',
		'registerInterval',
		'fetch(',
		'requestUrl',
		'vault.read',
		'vault.modify',
		'vault.create',
		'registerDomEvent',
		'registerEvent',
	]) {
		assert.equal(source.includes(forbidden), false, `found forbidden: ${forbidden}`);
	}
});

test('plugin lifecycle registers a command and closes active modals on unload', async () => {
	const source = await readFile(
		new URL('../src/main.ts', import.meta.url),
		'utf8',
	);

	assert.match(source, /this\.addCommand\(/);
	assert.match(source, /for \(const modal of Array\.from\(this\.activeModals\)\)/);
	assert.match(source, /modal\.close\(\)/);
	assert.match(source, /this\.activeModals\.clear\(\)/);
});