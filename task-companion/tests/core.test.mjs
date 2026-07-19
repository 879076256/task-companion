import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';

async function loadTypeScriptModule(relativePath) {
	const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
	const { code } = await transform(source, {
		format: 'esm',
		loader: 'ts',
		target: 'es2021',
	});
	return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

test('settings normalization validates the toggle and persisted timer preference', async () => {
	const { normalizeSettings } = await loadTypeScriptModule(
		'../src/settings/model.ts',
	);

	const defaults = {
		showTechnicalDetails: false,
		preferredTimerMode: 'focus-25',
		customTimerMinutes: 25,
		completedPomodoros: 0,
	};
	assert.deepEqual(normalizeSettings(undefined), defaults);
	assert.deepEqual(normalizeSettings({ showTechnicalDetails: true }), {
		...defaults,
		showTechnicalDetails: true,
	});
	assert.deepEqual(
		normalizeSettings({
			showTechnicalDetails: 'yes',
			preferredTimerMode: 'custom',
			customTimerMinutes: 90,
			completedPomodoros: 8,
		}),
		{
			...defaults,
			preferredTimerMode: 'custom',
			customTimerMinutes: 90,
			completedPomodoros: 8,
		},
	);
	assert.deepEqual(
		normalizeSettings({ preferredTimerMode: 'invalid', customTimerMinutes: 0 }),
		defaults,
	);
	assert.deepEqual(normalizeSettings({ completedPomodoros: -1 }), defaults);
});

test('error logger emits a scoped, predictable message', async () => {
	const { ErrorLogger } = await loadTypeScriptModule(
		'../src/services/error-logger.ts',
	);
	const messages = [];
	const logger = new ErrorLogger({ error: (message) => messages.push(message) });

	logger.capture('plugin load', new TypeError('broken'));
	assert.deepEqual(messages, [
		'[Task Companion] plugin load failed — TypeError: broken',
	]);
});
