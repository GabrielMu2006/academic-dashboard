import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function readJson(relativePath) {
	return JSON.parse(await readFile(resolve(root, relativePath), 'utf8'));
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

const rootManifest = await readJson('manifest.json');
const pluginManifest = await readJson('plugin/manifest.json');
const packageJson = await readJson('plugin/package.json');
const versions = await readJson('versions.json');
const changelog = await readFile(resolve(root, 'CHANGELOG.md'), 'utf8');
const requestedTag = process.argv[2];

assert(
	JSON.stringify(rootManifest) === JSON.stringify(pluginManifest),
	'Root and plugin manifests must be byte-for-byte equivalent after JSON parsing.',
);
assert(/^\d+\.\d+\.\d+$/.test(rootManifest.version), 'Version must use x.y.z Semantic Versioning.');
assert(rootManifest.version === packageJson.version, 'Manifest and package versions must match.');
assert(
	versions[rootManifest.version] === rootManifest.minAppVersion,
	'versions.json must map the current plugin version to minAppVersion.',
);
assert(
	changelog.includes(`## [${rootManifest.version}]`),
	'CHANGELOG.md must contain a heading for the current version.',
);
if (requestedTag) {
	assert(requestedTag === rootManifest.version, 'Release tag must exactly match the manifest version.');
}

console.log(`release metadata ${rootManifest.version}: synchronized`);
