import { App, normalizePath, TFile, TFolder } from 'obsidian';
import type { LocalWidgetSettings } from '../core/local-widget-settings';
import type {
	LocalWidgetServices,
	QuickLinkTarget,
} from './local-widgets';

interface FileExplorerView {
	revealInFolder(file: TFile | TFolder): Promise<void>;
}

interface ObsidianCommandManager {
	findCommand(commandId: string): unknown;
	executeCommandById(commandId: string): boolean;
}

function commandManager(app: App): ObsidianCommandManager | null {
	const candidate = app as App & { readonly commands?: ObsidianCommandManager };
	return candidate.commands ?? null;
}

function isFileExplorerView(value: unknown): value is FileExplorerView {
	return (
		typeof value === 'object' &&
		value !== null &&
		'revealInFolder' in value &&
		typeof value.revealInFolder === 'function'
	);
}

export function createObsidianLocalWidgetServices(
	app: App,
	getSettings: () => LocalWidgetSettings,
): LocalWidgetServices {
	return {
		now: () => new Date(),
		scheduler: {
			set: (callback, milliseconds) => window.setInterval(callback, milliseconds),
			clear: (handle) => window.clearInterval(handle),
		},
		getSettings,
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
		openQuickLink: async (target) => {
			const file = app.vault.getAbstractFileByPath(target.path);
			if (target.kind === 'file' && file instanceof TFile) {
				await app.workspace.getLeaf(false).openFile(file);
				return;
			}
			if (target.kind === 'folder' && file instanceof TFolder) {
				const explorer = app.workspace.getLeavesOfType('file-explorer')[0]?.view;
				if (isFileExplorerView(explorer)) {
					await explorer.revealInFolder(file);
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
