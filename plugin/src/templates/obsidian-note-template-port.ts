import { App, normalizePath, TFile, TFolder } from 'obsidian';
import type { NoteTemplatePort } from './note-template-service';

export function createObsidianNoteTemplatePort(app: App): NoteTemplatePort {
	const isConfigTarget = (path: string): boolean => {
		const normalized = normalizePath(path);
		const config = normalizePath(app.vault.configDir).replace(/\/$/u, '');
		return normalized === config || normalized.startsWith(`${config}/`);
	};
	return {
		read: async (path) => {
			if (isConfigTarget(path)) return null;
			const file = app.vault.getAbstractFileByPath(normalizePath(path));
			if (file === null) return null;
			if (!(file instanceof TFile) || file.extension !== 'md') return null;
			return app.vault.cachedRead(file);
		},
		compareAndSwap: async () => 'conflict',
		ensureFolder: async (path) => {
			if (isConfigTarget(path)) {
				throw new Error('Vault configuration directories are forbidden.');
			}
			let current = '';
			for (const segment of normalizePath(path).split('/')) {
				current = current ? `${current}/${segment}` : segment;
				const existing = app.vault.getAbstractFileByPath(current);
				if (existing instanceof TFolder) continue;
				if (existing !== null) {
					throw new Error('A file blocks the configured destination folder.');
				}
				await app.vault.createFolder(current);
			}
		},
		createExclusive: async (path, content) => {
			if (isConfigTarget(path)) return 'exists';
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
