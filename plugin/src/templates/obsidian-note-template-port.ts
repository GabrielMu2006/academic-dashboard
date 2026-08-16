import { App, normalizePath, TFile, TFolder } from 'obsidian';
import { createObsidianConservativeWritePort } from '../adapters/obsidian-conservative-write-port';
import type { ConservativeWritePort } from '../core/conservative-writes';
import type {
	NoteDestinationEntry,
	NoteTemplatePort,
} from './note-template-service';

function isVisiblePath(path: string): boolean {
	return path.split('/').every((segment) => segment.length > 0 && !segment.startsWith('.'));
}

export function createObsidianNoteTemplatePort(
	app: App,
	writes: ConservativeWritePort = createObsidianConservativeWritePort(app),
): NoteTemplatePort {
	return {
		...writes,
		listDescendants: async (folder) => {
			const normalized = normalizePath(folder);
			if (!isVisiblePath(normalized)) return Object.freeze([]);
			const root = app.vault.getAbstractFileByPath(normalized);
			if (root === null) return Object.freeze([]);
			if (!(root instanceof TFolder)) {
				throw new Error('The configured destination is blocked by a file.');
			}
			const entries: NoteDestinationEntry[] = [];
			const visit = (current: TFolder): void => {
				for (const child of current.children) {
					if (!isVisiblePath(child.path)) continue;
					if (child instanceof TFolder) {
						entries.push(Object.freeze({ path: child.path, kind: 'folder' }));
						visit(child);
					} else if (child instanceof TFile) {
						entries.push(Object.freeze({ path: child.path, kind: 'file' }));
					}
				}
			};
			visit(root);
			entries.sort((left, right) => left.path.localeCompare(right.path));
			return Object.freeze(entries);
		},
	};
}
