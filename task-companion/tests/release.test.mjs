import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { promisify } from 'node:util';

const projectRoot = new URL('../', import.meta.url);
const execFileAsync = promisify(execFile);
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const sha256 = (content) => createHash('sha256').update(content).digest('hex');

const readStoredZip = (zip) => {
	const entries = new Map();
	let offset = 0;
	while (zip.readUInt32LE(offset) === 0x04034b50) {
		const method = zip.readUInt16LE(offset + 8);
		const size = zip.readUInt32LE(offset + 18);
		const nameLength = zip.readUInt16LE(offset + 26);
		const extraLength = zip.readUInt16LE(offset + 28);
		const nameStart = offset + 30;
		const contentStart = nameStart + nameLength + extraLength;
		const name = zip.toString('utf8', nameStart, nameStart + nameLength);
		assert.equal(method, 0, `${name} must use deterministic stored ZIP mode`);
		entries.set(name, zip.subarray(contentStart, contentStart + size));
		offset = contentStart + size;
	}
	assert.equal(zip.readUInt32LE(offset), 0x02014b50);
	return entries;
};

test('release metadata is stable and desktop-only', async () => {
	const [manifest, packageJson, versions] = await Promise.all([
		readJson(new URL('manifest.json', projectRoot)),
		readJson(new URL('package.json', projectRoot)),
		readJson(new URL('versions.json', projectRoot)),
	]);

	assert.equal(manifest.version, '1.0.0');
	assert.equal(packageJson.version, manifest.version);
	assert.equal(manifest.author, 'teacher Zhang');
	assert.equal(packageJson.author, manifest.author);
	assert.equal(manifest.isDesktopOnly, true);
	assert.deepEqual(versions, { '1.0.0': manifest.minAppVersion });
});

test('release ZIP contains exactly the three production artifacts', async () => {
	const releaseRoot = new URL('release/', projectRoot);
	const zip = await readFile(new URL('task-companion-1.0.0.zip', releaseRoot));
	const entries = readStoredZip(zip);
	const expectedNames = ['main.js', 'manifest.json', 'styles.css'];

	assert.deepEqual([...entries.keys()], expectedNames);
	for (const name of expectedNames) {
		const source = await readFile(new URL(name, projectRoot));
		assert.deepEqual(entries.get(name), source);
	}
	assert.equal(entries.has('data.json'), false);
	assert.equal(entries.has('main.js.map'), false);
	assert.equal(entries.get('main.js')?.includes(Buffer.from('sourceMappingURL')), false);
});

test('release checksums cover staged artifacts and ZIP', async () => {
	const releaseRoot = new URL('release/', projectRoot);
	const checksumText = await readFile(
		new URL('SHA256SUMS-1.0.0.txt', releaseRoot),
		'utf8',
	);
	const checksums = new Map(
		checksumText.trim().split('\n').map((line) => {
			const [hash, path] = line.split('  ');
			return [path, hash];
		}),
	);
	const expectedPaths = [
		'task-companion-1.0.0/main.js',
		'task-companion-1.0.0/manifest.json',
		'task-companion-1.0.0/styles.css',
		'task-companion-1.0.0.zip',
	];

	assert.deepEqual([...checksums.keys()].sort(), expectedPaths.sort());
	for (const path of expectedPaths) {
		assert.equal(
			checksums.get(path),
			sha256(await readFile(new URL(path, releaseRoot))),
		);
	}
});

test('rebuilding the release produces the same ZIP hash', async () => {
	const zipUrl = new URL('release/task-companion-1.0.0.zip', projectRoot);
	const before = sha256(await readFile(zipUrl));

	await execFileAsync(process.execPath, ['scripts/build-release.mjs'], {
		cwd: new URL('.', projectRoot),
	});

	assert.equal(sha256(await readFile(zipUrl)), before);
});
