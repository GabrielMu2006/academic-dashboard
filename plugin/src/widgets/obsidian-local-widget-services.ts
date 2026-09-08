import { App, normalizePath, TFile, TFolder } from 'obsidian';
import type { LocalWidgetSettings } from '../core/local-widget-settings';
import type {
	LocalWidgetServices,
	QuickLinkTarget,
} from './local-widgets';
import { revealFolderInExplorer } from './quick-link-navigation';

interface ObsidianCommandManager {
	findCommand(commandId: string): unknown;
	executeCommandById(commandId: string): boolean;
}

function commandManager(app: App): ObsidianCommandManager | null {
	const candidate = app as App & { readonly commands?: ObsidianCommandManager };
	return candidate.commands ?? null;
}

export function createObsidianLocalWidgetServices(
	app: App,
	getSettings: () => LocalWidgetSettings,
	getCourseFolderRoot: () => string,
): LocalWidgetServices {
	return {
		now: () => new Date(),
		scheduler: {
			set: (callback, milliseconds) => window.setInterval(callback, milliseconds),
			clear: (handle) => window.clearInterval(handle),
		},
		getSettings,
		getCourseFolderRoot,
		resolveQuickLink: (path): QuickLinkTarget | null => {
			const normalizedPath = normalizePath(path);
			const file = app.vault.getAbstractFileByPath(normalizedPath);
			if (file instanceof TFile) {
				return { kind: 'file', path: normalizedPath };
			}
			if (file instanceof TFolder) {
				return { kind: 'folder', path: normalizedPath };
			}
			return null;
		},
		listChildFolders: (path) => {
			const root = app.vault.getAbstractFileByPath(normalizePath(path));
			if (!(root instanceof TFolder)) return Object.freeze([]);
			return Object.freeze(
				root.children
					.filter((child): child is TFolder => child instanceof TFolder)
					.sort((left, right) =>
						left.name.localeCompare(right.name, undefined, {
							numeric: true,
							sensitivity: 'base',
						}),
					)
					.map((folder) => Object.freeze({ name: folder.name, path: folder.path })),
			);
		},
		subscribeToFolderChanges: (callback) => {
			const refs = [
				app.vault.on('create', (file) => {
					if (file instanceof TFolder) callback();
				}),
				app.vault.on('delete', (file) => {
					if (file instanceof TFolder) callback();
				}),
				app.vault.on('rename', (file) => {
					if (file instanceof TFolder) callback();
				}),
			];
			return () => {
				for (const ref of refs) app.vault.offref(ref);
			};
		},
		openQuickLink: async (target) => {
			const file = app.vault.getAbstractFileByPath(target.path);
			if (target.kind === 'file' && file instanceof TFile) {
				await app.workspace.getLeaf(false).openFile(file);
				return;
			}
			if (target.kind === 'folder' && file instanceof TFolder) {
				const explorerLeaf = app.workspace.getLeavesOfType('file-explorer')[0];
				if (!explorerLeaf) {
					throw new Error('The file explorer is unavailable.');
				}
				if (
					await revealFolderInExplorer(
						explorerLeaf,
						(leaf) => app.workspace.revealLeaf(leaf),
						file,
						target.path,
					)
				) {
					return;
				}
			}
			throw new Error('The configured Vault path is no longer available.');
		},
		hasCommand: (commandId) =>
			commandManager(app)?.findCommand(commandId) !== undefined,
		executeCommand: async (commandId) => {
			if (!commandManager(app)?.executeCommandById(commandId)) {
				throw new Error('The configured Obsidian command is unavailable.');
			}
		},
		readQuoteFile: async (path) => {
			const file = app.vault.getAbstractFileByPath(normalizePath(path));
			if (!(file instanceof TFile) || file.extension.toLocaleLowerCase() !== 'md') {
				return null;
			}
			try {
				return await app.vault.cachedRead(file);
			} catch {
				return null;
			}
		},
	};
}
