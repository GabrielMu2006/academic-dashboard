import type {
	CommandShortcutSetting,
	LocalWidgetSettings,
	QuickLinkSetting,
} from '../core/local-widget-settings';
import { WidgetRegistry } from '../core/widget-registry';
import type {
	WidgetLifecycle,
	WidgetMountContext,
	WidgetRegistration,
} from '../core/widgets';
import { formatDate, formatNumber, t, translateEnglishSource } from '../core/localization';

export interface IntervalScheduler {
	set(callback: () => void, milliseconds: number): number;
	clear(handle: number): void;
}

export interface QuickLinkTarget {
	readonly kind: 'file' | 'folder';
	readonly path: string;
}

export interface VaultFolderLink {
	readonly name: string;
	readonly path: string;
}

export interface LocalWidgetServices {
	readonly now: () => Date;
	readonly scheduler: IntervalScheduler;
	readonly getSettings: () => LocalWidgetSettings;
	readonly getCourseFolderRoot: () => string;
	readonly resolveQuickLink: (path: string) => QuickLinkTarget | null;
	readonly listChildFolders: (path: string) => readonly VaultFolderLink[];
	readonly subscribeToFolderChanges: (callback: () => void) => () => void;
	readonly openQuickLink: (target: QuickLinkTarget) => Promise<void>;
	readonly hasCommand: (commandId: string) => boolean;
	readonly executeCommand: (commandId: string) => Promise<void>;
	readonly readQuoteFile: (path: string) => Promise<string | null>;
}

function element<K extends keyof HTMLElementTagNameMap>(
	document: Document,
	tag: K,
	className: string,
	text?: string,
): HTMLElementTagNameMap[K] {
	const result = document.createElement(tag);
	result.className = className;
	if (text !== undefined) result.textContent = translateEnglishSource(text);
	return result;
}

abstract class RenderedWidget implements WidgetLifecycle {
	protected context: WidgetMountContext | null = null;
	protected events: AbortController | null = null;

	mount(context: WidgetMountContext): void {
		this.context = context;
		void this.render(context);
	}

	update(context: WidgetMountContext): void {
		this.context = context;
		void this.render(context);
	}

	destroy(): void {
		this.events?.abort();
		this.events = null;
		this.context = null;
	}

	protected beginRender(context: WidgetMountContext): Document {
		this.events?.abort();
		this.events = new AbortController();
		context.contentEl.replaceChildren();
		return context.contentEl.ownerDocument;
	}

	protected abstract render(context: WidgetMountContext): void | Promise<void>;
}

export class DateTimeWidget extends RenderedWidget {
	private interval: number | null = null;

	constructor(private readonly services: LocalWidgetServices) {
		super();
	}

	override mount(context: WidgetMountContext): void {
		super.mount(context);
		this.interval = this.services.scheduler.set(() => {
			if (this.context) this.render(this.context);
		}, 30_000);
	}

	override destroy(): void {
		if (this.interval !== null) this.services.scheduler.clear(this.interval);
		this.interval = null;
		super.destroy();
	}

	protected render(context: WidgetMountContext): void {
		const document = this.beginRender(context);
		const now = this.services.now();
		const time = formatDate(now, {
			hour: '2-digit',
			minute: '2-digit',
		});
		const date = formatDate(now, {
			weekday: 'long',
			month: 'short',
			day: 'numeric',
		});
		context.contentEl.append(
			element(document, 'time', 'academic-dashboard-date-time__time', time),
			element(document, 'div', 'academic-dashboard-date-time__date', date),
		);
		context.setState({ status: 'ready' });
	}
}

export class QuickLinksWidget extends RenderedWidget {
	constructor(private readonly services: LocalWidgetServices) {
		super();
	}

	protected render(context: WidgetMountContext): void {
		const document = this.beginRender(context);
		const links = this.services.getSettings().quickLinks;
		if (links.length === 0) {
			context.setState({
				status: 'empty',
				message: 'No quick links configured yet.',
			});
			return;
		}

		const list = element(document, 'div', 'academic-dashboard-action-list');
		let available = 0;
		for (const link of links) {
			const target = this.services.resolveQuickLink(link.path);
			list.append(this.createLink(document, link, target));
			if (target) available += 1;
		}
		context.contentEl.append(list);
		context.setState(
			available > 0
				? { status: 'ready' }
				: {
						status: 'unavailable',
						reason: 'Configured Vault paths are unavailable.',
						recovery: 'Update or remove missing paths in Dashboard settings.',
					},
		);
	}

	private createLink(
		document: Document,
		setting: QuickLinkSetting,
		target: QuickLinkTarget | null,
	): HTMLButtonElement {
		const button = element(
			document,
			'button',
			'academic-dashboard-action',
			setting.label,
		);
		button.type = 'button';
		button.title = target ? setting.path : `Missing: ${setting.path}`;
		button.disabled = !target;
		button.toggleAttribute('data-unavailable', !target);
		if (target) {
			button.addEventListener(
				'click',
				() => {
					void this.services.openQuickLink(target).catch(() => {
						this.context?.setState({
							status: 'error',
							message: 'Quick link could not be opened.',
							code: 'quick_link_open_failed',
						});
					});
				},
				{ signal: this.events?.signal },
			);
		}
		return button;
	}
}

export class CourseFoldersWidget extends RenderedWidget {
	private unsubscribe: (() => void) | null = null;

	constructor(private readonly services: LocalWidgetServices) {
		super();
	}

	override mount(context: WidgetMountContext): void {
		super.mount(context);
		this.unsubscribe = this.services.subscribeToFolderChanges(() => {
			if (this.context) this.render(this.context);
		});
	}

	override destroy(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		super.destroy();
	}

	protected render(context: WidgetMountContext): void {
		const document = this.beginRender(context);
		const root = this.services.getCourseFolderRoot();
		const rootTarget = this.services.resolveQuickLink(root);
		if (rootTarget?.kind !== 'folder') {
			context.setState({
				status: 'unavailable',
				reason: t('courseFolders.unavailable', { root }),
				recovery: t('courseFolders.recovery'),
			});
			return;
		}

		const folders = this.services.listChildFolders(root);
		if (folders.length === 0) {
			context.setState({
				status: 'empty',
				message: t('empty.courseFolders', { root }),
			});
			return;
		}

		context.contentEl.append(
			element(
				document,
				'div',
				'academic-dashboard-folder-summary',
				t('courseFolders.count', {
					count: formatNumber(folders.length),
					root,
				}),
			),
		);
		const list = element(document, 'div', 'academic-dashboard-action-list');
		for (const folder of folders) {
			const button = element(
				document,
				'button',
				'academic-dashboard-action',
				folder.name,
			);
			button.type = 'button';
			button.title = folder.path;
			button.setAttribute(
				'aria-label',
				t('courseFolders.open', { name: folder.name }),
			);
			button.addEventListener(
				'click',
				() => {
					void this.services.openQuickLink({
						kind: 'folder',
						path: folder.path,
					}).catch(() => {
						this.context?.setState({
							status: 'error',
							message: t('courseFolders.openFailed'),
							code: 'course_folder_open_failed',
						});
					});
				},
				{ signal: this.events?.signal },
			);
			list.append(button);
		}
		context.contentEl.append(list);
		context.setState({ status: 'ready' });
	}
}

export class CommandLauncherWidget extends RenderedWidget {
	constructor(private readonly services: LocalWidgetServices) {
		super();
	}

	protected render(context: WidgetMountContext): void {
		const document = this.beginRender(context);
		const commands = this.services.getSettings().commands;
		if (commands.length === 0) {
			context.setState({ status: 'empty', message: 'No commands configured yet.' });
			return;
		}

		const list = element(document, 'div', 'academic-dashboard-action-list');
		let available = 0;
		for (const command of commands) {
			const enabled = this.services.hasCommand(command.commandId);
			list.append(this.createCommand(document, command, enabled));
			if (enabled) available += 1;
		}
		context.contentEl.append(list);
		context.setState(
			available > 0
				? { status: 'ready' }
				: {
						status: 'unavailable',
						reason: 'Configured Obsidian commands are unavailable.',
						recovery: 'Choose commands available in this Obsidian installation.',
					},
		);
	}

	private createCommand(
		document: Document,
		setting: CommandShortcutSetting,
		available: boolean,
	): HTMLButtonElement {
		const button = element(
			document,
			'button',
			'academic-dashboard-action',
			setting.label,
		);
		button.type = 'button';
		button.disabled = !available;
		button.title = setting.commandId;
		button.toggleAttribute('data-unavailable', !available);
		if (available) {
			button.addEventListener(
				'click',
				() => {
					void this.services.executeCommand(setting.commandId).catch(() => {
						this.context?.setState({
							status: 'error',
							message: 'Command could not be executed.',
							code: 'command_execute_failed',
						});
					});
				},
				{ signal: this.events?.signal },
			);
		}
		return button;
	}
}

export const MAX_QUOTE_FILE_ENTRIES = 366;

export function parseQuoteFile(content: string): readonly string[] {
	const normalized = content.replace(/\r\n/gu, '\n');
	const body = normalized.startsWith('---\n')
		? normalized.replace(/^---\n[\s\S]*?\n---(?:\n|$)/u, '')
		: normalized;
	const quotes: string[] = [];
	let inComment = false;
	for (const rawLine of body.split('\n')) {
		let line = rawLine.trim();
		if (line.startsWith('<!--')) inComment = true;
		if (inComment) {
			if (line.includes('-->')) inComment = false;
			continue;
		}
		if (!line || line.startsWith('#')) continue;
		line = line
			.replace(/^[-*+]\s+/u, '')
			.replace(/^\d+[.)]\s+/u, '')
			.replace(/^>\s?/u, '')
			.trim();
		if (line && line.length <= 500) quotes.push(line);
		if (quotes.length >= MAX_QUOTE_FILE_ENTRIES) break;
	}
	return Object.freeze(quotes);
}

export class LocalQuoteWidget extends RenderedWidget {
	private interval: number | null = null;
	private generation = 0;

	constructor(private readonly services: LocalWidgetServices) {
		super();
	}

	override mount(context: WidgetMountContext): void {
		this.context = context;
		void this.render(context);
		this.interval = this.services.scheduler.set(() => {
			if (this.context) void this.render(this.context);
		}, 30_000);
	}

	override destroy(): void {
		this.generation += 1;
		if (this.interval !== null) this.services.scheduler.clear(this.interval);
		this.interval = null;
		super.destroy();
	}

	protected async render(context: WidgetMountContext): Promise<void> {
		const generation = ++this.generation;
		const document = this.beginRender(context);
		const settings = this.services.getSettings();
		let quotes = settings.quotes;
		if (settings.quoteFilePath) {
			context.setState({ status: 'loading' });
			let content: string | null;
			try {
				content = await this.services.readQuoteFile(settings.quoteFilePath);
			} catch {
				content = null;
			}
			if (generation !== this.generation) return;
			if (content === null) {
				context.setState({
					status: 'unavailable',
					reason: 'The configured quote file is unavailable.',
					recovery: 'Open Academic Dashboard settings and choose an existing Vault Markdown file.',
				});
				return;
			}
			quotes = parseQuoteFile(content);
		}
		if (quotes.length === 0) {
			context.setState({ status: 'empty', message: 'No quote entries were found.' });
			return;
		}
		const now = this.services.now();
		const dayKey = Math.floor(
			Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000,
		);
		const quote = quotes[dayKey % quotes.length] ?? quotes[0];
		context.contentEl.append(
			element(document, 'blockquote', 'academic-dashboard-quote', quote),
		);
		context.setState({ status: 'ready' });
	}
}

function registration(
	id: string,
	title: string,
	size: 'small' | 'medium',
	create: () => WidgetLifecycle,
	page: 'home' | 'study' = 'home',
): WidgetRegistration {
	return {
		definition: {
			id,
			title,
			allowedPages: [page],
			allowedSizes: size === 'small' ? ['small', 'medium'] : ['medium', 'large'],
			defaultSize: size,
		},
		create,
	};
}

export function createLocalWidgetRegistry(
	services: LocalWidgetServices,
): WidgetRegistry {
	const registry = new WidgetRegistry();
	registry.register(
		registration('home.date-time', 'Date & Time', 'small', () =>
			new DateTimeWidget(services),
		),
	);
	registry.register(
		registration('home.shortcuts', 'Quick Links', 'medium', () =>
			new QuickLinksWidget(services),
		),
	);
	registry.register(
		registration('home.commands', 'Commands', 'medium', () =>
			new CommandLauncherWidget(services),
		),
	);
	registry.register(
		registration('home.quote', 'Daily Quote', 'small', () =>
			new LocalQuoteWidget(services),
		),
	);
	registry.register(
		registration(
			'study.course-folders',
			'Course Folders',
			'medium',
			() => new CourseFoldersWidget(services),
			'study',
		),
	);
	return registry;
}
