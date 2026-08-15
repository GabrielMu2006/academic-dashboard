import { App, normalizePath, TFile, TFolder } from 'obsidian';
import type { ConservativeWritePort } from '../core/conservative-writes';

function isConfigTarget(path: string, configDir: string): boolean {
	const normalized = normalizePath(path);
	const normalizedConfig = normalizePath(configDir).replace(/\/$/u, '');
	return normalized === normalizedConfig || normalized.startsWith(`${normalizedConfig}/`);
}

/** Narrow Vault capability: no delete, rename, move, batch, network, or shell. */
export function createObsidianConservativeWritePort(
	app: App,
): ConservativeWritePort {
	return {
		read: async (path) => {
			if (isConfigTarget(path, app.vault.configDir)) return null;
			const file = app.vault.getAbstractFileByPath(normalizePath(path));
			if (file === null) return null;
			if (!(file instanceof TFile) || file.extension !== 'md') return null;
			return app.vault.read(file);
		},
		compareAndSwap: async (path, expectedContent, nextContent) => {
			if (isConfigTarget(path, app.vault.configDir)) return 'conflict';
			const file = app.vault.getAbstractFileByPath(normalizePath(path));
			if (!(file instanceof TFile) || file.extension !== 'md') return 'missing';
			let outcome: 'written' | 'conflict' = 'conflict';
			await app.vault.process(file, (current) => {
				if (current !== expectedContent) return current;
				outcome = 'written';
				return nextContent;
			});
			return outcome;
		},
		ensureFolder: async (path) => {
			if (isConfigTarget(path, app.vault.configDir)) {
				throw new Error('Vault configuration directories are forbidden.');
			}
			let current = '';
			for (const segment of normalizePath(path).split('/')) {
				current = current ? `${current}/${segment}` : segment;
				const existing = app.vault.getAbstractFileByPath(current);
				if (existing instanceof TFolder) continue;
				if (existing !== null) throw new Error('Destination folder is blocked.');
				await app.vault.createFolder(current);
			}
		},
		createExclusive: async (path, content) => {
			if (isConfigTarget(path, app.vault.configDir)) return 'exists';
			const normalized = normalizePath(path);
			if (app.vault.getAbstractFileByPath(normalized) !== null) return 'exists';
			try {
				await app.vault.create(normalized, content);
				return 'created';
			} catch {
				return app.vault.getAbstractFileByPath(normalized) === null
					? Promise.reject(new Error('Vault create failed.'))
					: 'exists';
			}
		},
	};
}
