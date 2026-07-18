import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const destination = `${dirname(projectRoot)}/test-vault/.obsidian/plugins/task-companion`;
const manifest = JSON.parse(
	await readFile(`${projectRoot}/manifest.json`, 'utf8'),
);
const releaseRoot = `${projectRoot}/release/task-companion-${manifest.version}`;

await mkdir(destination, { recursive: true });
for (const filename of ['main.js', 'manifest.json', 'styles.css']) {
	await copyFile(`${releaseRoot}/${filename}`, `${destination}/${filename}`);
}
