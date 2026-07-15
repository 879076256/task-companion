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

test('settings normalization accepts only the supported boolean', async () => {
	const { normalizeSettings } = await loadTypeScriptModule(
		'../src/settings/model.ts',
	);

	assert.deepEqual(normalizeSettings(undefined), { showTechnicalDetails: false });
	assert.deepEqual(normalizeSettings({ showTechnicalDetails: true }), {
		showTechnicalDetails: true,
	});
	assert.deepEqual(normalizeSettings({ showTechnicalDetails: 'yes' }), {
		showTechnicalDetails: false,
	});
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

