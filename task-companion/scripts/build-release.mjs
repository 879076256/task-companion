import { createHash } from 'node:crypto';
import {
	copyFile,
	mkdir,
	readFile,
	rm,
	writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const releaseRoot = join(projectRoot, 'release');
const artifactNames = ['main.js', 'manifest.json', 'styles.css'];

const sha256 = (content) => createHash('sha256').update(content).digest('hex');

const crcTable = Array.from({ length: 256 }, (_, value) => {
	let result = value;
	for (let bit = 0; bit < 8; bit += 1) {
		result = (result & 1) === 1
			? 0xedb88320 ^ (result >>> 1)
			: result >>> 1;
	}
	return result >>> 0;
});

const crc32 = (content) => {
	let result = 0xffffffff;
	for (const byte of content) {
		result = crcTable[(result ^ byte) & 0xff] ^ (result >>> 8);
	}
	return (result ^ 0xffffffff) >>> 0;
};

const makeLocalHeader = (name, content) => {
	const nameBuffer = Buffer.from(name, 'utf8');
	const header = Buffer.alloc(30);
	header.writeUInt32LE(0x04034b50, 0);
	header.writeUInt16LE(20, 4);
	header.writeUInt16LE(0, 6);
	header.writeUInt16LE(0, 8);
	header.writeUInt16LE(0, 10);
	header.writeUInt16LE(33, 12);
	header.writeUInt32LE(crc32(content), 14);
	header.writeUInt32LE(content.length, 18);
	header.writeUInt32LE(content.length, 22);
	header.writeUInt16LE(nameBuffer.length, 26);
	header.writeUInt16LE(0, 28);
	return Buffer.concat([header, nameBuffer, content]);
};

const makeCentralHeader = (name, content, offset) => {
	const nameBuffer = Buffer.from(name, 'utf8');
	const header = Buffer.alloc(46);
	header.writeUInt32LE(0x02014b50, 0);
	header.writeUInt16LE(0x0314, 4);
	header.writeUInt16LE(20, 6);
	header.writeUInt16LE(0, 8);
	header.writeUInt16LE(0, 10);
	header.writeUInt16LE(0, 12);
	header.writeUInt16LE(33, 14);
	header.writeUInt32LE(crc32(content), 16);
	header.writeUInt32LE(content.length, 20);
	header.writeUInt32LE(content.length, 24);
	header.writeUInt16LE(nameBuffer.length, 28);
	header.writeUInt16LE(0, 30);
	header.writeUInt16LE(0, 32);
	header.writeUInt16LE(0, 34);
	header.writeUInt16LE(0, 36);
	header.writeUInt32LE(0x81a40000, 38);
	header.writeUInt32LE(offset, 42);
	return Buffer.concat([header, nameBuffer]);
};

const makeEndRecord = (entryCount, centralSize, centralOffset) => {
	const record = Buffer.alloc(22);
	record.writeUInt32LE(0x06054b50, 0);
	record.writeUInt16LE(0, 4);
	record.writeUInt16LE(0, 6);
	record.writeUInt16LE(entryCount, 8);
	record.writeUInt16LE(entryCount, 10);
	record.writeUInt32LE(centralSize, 12);
	record.writeUInt32LE(centralOffset, 16);
	record.writeUInt16LE(0, 20);
	return record;
};

const createDeterministicZip = (entries) => {
	const localRecords = [];
	const centralRecords = [];
	let offset = 0;
	for (const [name, content] of entries) {
		const localRecord = makeLocalHeader(name, content);
		localRecords.push(localRecord);
		centralRecords.push(makeCentralHeader(name, content, offset));
		offset += localRecord.length;
	}
	const centralDirectory = Buffer.concat(centralRecords);
	return Buffer.concat([
		...localRecords,
		centralDirectory,
		makeEndRecord(entries.length, centralDirectory.length, offset),
	]);
};

const manifest = JSON.parse(
	await readFile(join(projectRoot, 'manifest.json'), 'utf8'),
);
const packageJson = JSON.parse(
	await readFile(join(projectRoot, 'package.json'), 'utf8'),
);

if (manifest.version !== packageJson.version) {
	throw new Error('manifest.json and package.json versions must match');
}
if (manifest.author !== 'teacher Zhang' || manifest.isDesktopOnly !== true) {
	throw new Error('release identity or desktop-only declaration is invalid');
}

const entries = await Promise.all(
	artifactNames.map(async (name) => [
		name,
		await readFile(join(projectRoot, name)),
	]),
);
const bundle = entries.find(([name]) => name === 'main.js')?.[1];
if (!bundle || bundle.includes(Buffer.from('sourceMappingURL'))) {
	throw new Error('production bundle is missing or contains a source map reference');
}

await rm(releaseRoot, { recursive: true, force: true });
await mkdir(releaseRoot, { recursive: true });
const stagedName = `task-companion-${manifest.version}`;
const stagedRoot = join(releaseRoot, stagedName);
await mkdir(stagedRoot, { recursive: true });
for (const [name] of entries) {
	await copyFile(join(projectRoot, name), join(stagedRoot, name));
}

const zipName = `${stagedName}.zip`;
const zip = createDeterministicZip(entries);
await writeFile(join(releaseRoot, zipName), zip);

const checksumLines = [
	...entries.map(([name, content]) => `${sha256(content)}  ${stagedName}/${name}`),
	`${sha256(zip)}  ${zipName}`,
];
await writeFile(
	join(releaseRoot, `SHA256SUMS-${manifest.version}.txt`),
	`${checksumLines.join('\n')}\n`,
	'utf8',
);

process.stdout.write(
	`Built ${zipName} with ${artifactNames.length} install files.\n`,
);
