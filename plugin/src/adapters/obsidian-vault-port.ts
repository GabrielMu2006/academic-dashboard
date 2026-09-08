import { App, TFile } from 'obsidian';
import type {
	NativeVaultPort,
	VaultMarkdownFile,
} from './native-vault-academic-adapters';
import type {
	NativeMarkdownTaskPort,
	TasksPluginQueryPort,
} from './native-calendar-task-adapters';
import type {
	ReviewVaultPort,
	SpacedRepetitionPluginPort,
} from './review-queue-adapters';
import type { AcademicMaterialDiagnosticVaultPort } from '../core/academic-material-diagnostic';
import type { CourseOverviewVaultPort } from './native-course-overview-adapter';

interface CommunityPluginRegistry {
	getPlugin(pluginId: string): unknown;
}

function communityPlugins(app: App): CommunityPluginRegistry | null {
	const candidate = app as App & { readonly plugins?: CommunityPluginRegistry };
	return candidate.plugins ?? null;
}

export function createObsidianVaultPort(app: App): NativeVaultPort {
	return {
		listMarkdownFiles: (): readonly VaultMarkdownFile[] =>
			app.vault.getMarkdownFiles().map((file) => ({
				path: file.path,
				basename: file.basename,
				modifiedAt: file.stat.mtime,
			})),
		frontmatter: (path) => {
			const file = app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) return null;
			return app.metadataCache.getFileCache(file)?.frontmatter ?? null;
		},
	};
}

export function createObsidianAcademicMaterialDiagnosticPort(
	app: App,
): AcademicMaterialDiagnosticVaultPort {
	const native = createObsidianVaultPort(app);
	return {
		listMarkdownFiles: () => native.listMarkdownFiles(),
		frontmatter: (path) => native.frontmatter(path),
	};
}

export function createObsidianCourseOverviewPort(app: App): CourseOverviewVaultPort {
	return {
		listFiles: () => app.vault.getFiles().map((file) => ({
			path: file.path,
			extension: file.extension,
		})),
		frontmatter: (path) => {
			const file = app.vault.getAbstractFileByPath(path);
			return file instanceof TFile
				? app.metadataCache.getFileCache(file)?.frontmatter ?? null
				: null;
		},
	};
}

export function createObsidianMarkdownTaskPort(
	app: App,
): NativeMarkdownTaskPort {
	return {
		listMarkdownFiles: (): readonly VaultMarkdownFile[] =>
			app.vault.getMarkdownFiles().map((file) => ({
				path: file.path,
				basename: file.basename,
				modifiedAt: file.stat.mtime,
			})),
		readMarkdown: async (path) => {
			const file = app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile) || file.extension !== 'md') {
				throw new Error('The Markdown task source is no longer available.');
			}
			return app.vault.cachedRead(file);
		},
	};
}

export function createObsidianReviewVaultPort(app: App): ReviewVaultPort {
	const native = createObsidianVaultPort(app);
	return {
		...native,
		readMarkdown: async (path) => {
			const file = app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile) || file.extension !== 'md') {
				throw new Error('The review source is no longer available.');
			}
			return app.vault.cachedRead(file);
		},
	};
}

export function createObsidianSpacedRepetitionPort(
	app: App,
): SpacedRepetitionPluginPort {
	return {
		isInstalled: () => {
			const plugin = communityPlugins(app)?.getPlugin('obsidian-spaced-repetition');
			return plugin !== undefined && plugin !== null;
		},
	};
}

/**
 * Tasks currently has no project-reviewed public read API. Detect installation
 * only; the optional adapter will declare and use the Native Markdown fallback.
 */
export function createObsidianTasksPluginPort(app: App): TasksPluginQueryPort {
	return {
		isInstalled: () => {
			const plugin = communityPlugins(app)?.getPlugin('obsidian-tasks-plugin');
			return plugin !== undefined && plugin !== null;
		},
	};
}

export async function openObsidianVaultNote(app: App, path: string): Promise<void> {
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile) || file.extension !== 'md') {
		throw new Error('The selected Markdown note is no longer available.');
	}
	await app.workspace.getLeaf(false).openFile(file);
}

export async function openObsidianVaultFile(app: App, path: string): Promise<void> {
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) throw new Error('The selected Vault file is unavailable.');
	await app.workspace.getLeaf(false).openFile(file);
}
