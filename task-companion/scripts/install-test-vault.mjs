import { copyFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const destination = `${dirname(projectRoot)}/test-vault/.obsidian/plugins/task-companion`;

await mkdir(destination, { recursive: true });
for (const filename of ['main.js', 'manifest.json', 'styles.css']) {
	await copyFile(`${projectRoot}/${filename}`, `${destination}/${filename}`);
}
