#!/usr/bin/env node

import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, delimiter, join, resolve } from 'node:path';

function usage() {
	return 'Usage: node scripts/check-setup.mjs --vault /path/to/your/vault';
}

function vaultArgument(argv) {
	if (argv.some((argument) => argument === '--help' || argument === '-h')) return null;
	const index = argv.indexOf('--vault');
	if (index === -1 || !argv[index + 1] || argv[index + 1].startsWith('--')) {
		throw new Error(`A Vault path is required. ${usage()}`);
	}
	return resolve(argv[index + 1]);
}

async function readable(path) {
	try {
		await access(path, constants.R_OK);
		return true;
	} catch {
		return false;
	}
}

async function jsonFile(path) {
	try {
		return JSON.parse(await readFile(path, 'utf8'));
	} catch {
		return null;
	}
}

async function commandOnPath(command) {
	const pathEntries = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
	const extensions = process.platform === 'win32'
		? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';')
		: [''];
	for (const directory of pathEntries) {
		for (const extension of extensions) {
			const names = new Set([
				`${command}${extension.toLowerCase()}`,
				`${command}${extension.toUpperCase()}`,
			]);
			for (const name of names) {
				if (await readable(join(directory, name))) return true;
			}
		}
	}
	return false;
}

async function commandAvailable(command) {
	if (await commandOnPath(command)) return true;
	if (process.platform === 'darwin' && command === 'codex') {
		return readable('/Applications/ChatGPT.app/Contents/Resources/codex');
	}
	return false;
}

function manifestSummary(manifest, expectedId) {
	if (!manifest || manifest.id !== expectedId || typeof manifest.version !== 'string') {
		return null;
	}
	return `${manifest.name ?? expectedId} ${manifest.version}`;
}

async function main() {
	let vault;
	try {
		vault = vaultArgument(process.argv.slice(2));
	} catch (error) {
		console.error(`ERROR ${error.message}`);
		process.exitCode = 1;
		return;
	}
	if (vault === null) {
		console.log(usage());
		return;
	}

	const obsidianDirectory = join(vault, '.obsidian');
	if (!(await readable(obsidianDirectory))) {
		console.error(`ERROR ${basename(vault)} does not contain a readable .obsidian directory.`);
		process.exitCode = 1;
		return;
	}

	const enabled = await jsonFile(join(obsidianDirectory, 'community-plugins.json'));
	const enabledIds = new Set(Array.isArray(enabled) ? enabled : []);
	const pluginDirectory = join(obsidianDirectory, 'plugins');
	const claudian = await jsonFile(join(pluginDirectory, 'realclaudian', 'manifest.json'));
	const dashboard = await jsonFile(
		join(pluginDirectory, 'academic-dashboard', 'manifest.json'),
	);
	const claudianSummary = manifestSummary(claudian, 'realclaudian');
	const dashboardSummary = manifestSummary(dashboard, 'academic-dashboard');

	console.log('Academic Dashboard setup diagnostic (read-only)');
	console.log(`Vault: ${basename(vault) || 'selected Vault'}`);
	console.log(
		dashboardSummary
			? `OK    ${dashboardSummary}${enabledIds.has('academic-dashboard') ? ' is enabled' : ' is installed but not enabled'}`
			: 'WARN  Academic Dashboard is not installed in this Vault',
	);
	console.log(
		claudianSummary
			? `OK    ${claudianSummary}${enabledIds.has('realclaudian') ? ' is enabled' : ' is installed but not enabled'}`
			: 'WARN  Claudian is not installed; Agent handoff will be unavailable',
	);
	console.log(
		(await commandAvailable('codex'))
			? 'OK    Codex executable was discovered without running it'
			: 'INFO  Codex was not found on PATH or in the standard macOS ChatGPT bundle',
	);
	console.log(
		(await commandAvailable('opencode'))
			? 'OK    OpenCode executable was discovered without running it'
			: 'INFO  OpenCode was not found on PATH',
	);
	console.log('INFO  No executable was run and no plugin data, note content, or credential file was read.');
	console.log('NEXT  Configure CLI paths, provider/model, sign-in, and permissions in Claudian/Codex/OpenCode.');
}

await main();
