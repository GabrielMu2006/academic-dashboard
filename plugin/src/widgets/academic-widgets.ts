import type {
	RecentNoteItem,
	RecentNotesQuery,
	RecentPaperItem,
} from '../core/academic-notes';
import type { DataAdapter } from '../core/data-adapter';
import type {
	PaperStatusFilter,
	ResearchPapersQuery,
} from '../core/research';
import { PAPER_STATUSES, type PaperStatus } from '../core/metadata-settings';
import type { WidgetRegistry } from '../core/widget-registry';
import type {
	WidgetLifecycle,
	WidgetMountContext,
	WidgetRegistration,
} from '../core/widgets';
import { formatDate, t, translateEnglishSource } from '../core/localization';
import { focusElement, restoreStableFocus } from '../ui/focus';

export interface AcademicWidgetServices {
	readonly recentNotes: DataAdapter<RecentNotesQuery, readonly RecentNoteItem[]>;
	readonly recentPapers: DataAdapter<ResearchPapersQuery, readonly RecentPaperItem[]>;
	readonly openNote: (path: string) => Promise<void>;
	readonly setPaperStatus?: (
		item: RecentPaperItem,
		status: PaperStatus,
	) => Promise<PaperActionCommit>;
	readonly setPaperFavorite?: (
		item: RecentPaperItem,
		favorite: boolean,
	) => Promise<PaperActionCommit>;
	readonly undoPaperAction?: (token: string) => Promise<void>;
	readonly getPaperUndos?: () => readonly PaperUndoState[];
}

export interface PaperActionCommit {
	readonly outcome: 'committed';
	readonly undoToken: string;
	readonly path: string;
	readonly field: string;
}

export interface PaperUndoState {
	readonly token: string;
	readonly path: string;
	readonly field: string;
	readonly label: string;
}

interface ObsidianWindowDom {
	createEl<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K];
}

function element<K extends keyof HTMLElementTagNameMap>(
	document: Document,
	tag: K,
	className: string,
	text?: string,
): HTMLElementTagNameMap[K] {
	const result = (document.win as Window & ObsidianWindowDom).createEl(tag);
	result.className = className;
	if (text !== undefined) result.textContent = translateEnglishSource(text);
	return result;
}

abstract class AcademicListWidget<T extends RecentNoteItem>
	implements WidgetLifecycle
{
	private generation = 0;
	private events: AbortController | null = null;
	private context: WidgetMountContext | null = null;

	constructor(
		private readonly adapter: DataAdapter<RecentNotesQuery, readonly T[]>,
		private readonly openNote: (path: string) => Promise<void>,
		private readonly emptyMessage: string,
	) {}

	mount(context: WidgetMountContext): Promise<void> {
		return this.load(context);
	}

	update(context: WidgetMountContext): Promise<void> {
		return this.load(context);
	}

	destroy(): void {
		this.generation += 1;
		this.events?.abort();
		this.events = null;
		this.context = null;
	}

	protected abstract secondary(item: T): string;

	private async load(context: WidgetMountContext): Promise<void> {
		const generation = ++this.generation;
		this.events?.abort();
		this.events = new AbortController();
		this.context = context;
		context.contentEl.replaceChildren();
		context.setState({ status: 'loading' });
		try {
			const availability = await this.adapter.availability();
			if (generation !== this.generation) return;
			if (availability.status === 'unavailable') {
				context.setState({
					status: 'unavailable',
					reason: availability.reason,
					...(availability.recovery ? { recovery: availability.recovery } : {}),
				});
				return;
			}
			if (availability.status === 'fallback') {
				context.setState({
					status: 'unavailable',
					reason: availability.reason,
					recovery: `Fallback adapter: ${availability.fallbackAdapterId}.`,
				});
				return;
			}

			const items = await this.adapter.query({ limit: 8 });
			if (generation !== this.generation) return;
			if (items.length === 0) {
				context.setState({ status: 'empty', message: this.emptyMessage });
				return;
			}
			this.renderItems(context, items);
			context.setState({ status: 'ready' });
		} catch {
			if (generation !== this.generation) return;
			context.setState({
				status: 'error',
				message: 'Vault notes could not be loaded.',
				code: 'native_vault_query_failed',
			});
		}
	}

	private renderItems(context: WidgetMountContext, items: readonly T[]): void {
		const document = context.contentEl.ownerDocument;
		const list = element(document, 'div', 'academic-dashboard-note-list');
		for (const item of items) {
			const button = element(document, 'button', 'academic-dashboard-note');
			button.type = 'button';
			button.title = item.path;
			button.append(
				element(
					document,
					'span',
					'academic-dashboard-note__title',
					item.title,
				),
				element(
					document,
					'span',
					'academic-dashboard-note__meta',
					this.secondary(item),
				),
			);
			button.addEventListener(
				'click',
				() => {
					void this.openNote(item.path).catch(() => {
						this.context?.setState({
							status: 'error',
							message: 'The selected note could not be opened.',
							code: 'vault_note_open_failed',
						});
					});
				},
				{ signal: this.events?.signal },
			);
			list.append(button);
		}
		context.contentEl.append(list);
	}
}

export class RecentNotesWidget extends AcademicListWidget<RecentNoteItem> {
	constructor(services: AcademicWidgetServices) {
		super(services.recentNotes, services.openNote, 'No Markdown notes found in this Vault.');
	}

	protected secondary(item: RecentNoteItem): string {
		return formatDate(new Date(item.modifiedAt), {
			month: 'short',
			day: 'numeric',
		});
	}
}

export class RecentPapersWidget implements WidgetLifecycle {
	private generation = 0;
	private events: AbortController | null = null;
	private context: WidgetMountContext | null = null;
	private search = '';
	private status: PaperStatusFilter = 'all';
	private year: number | undefined;
	private readonly busyPaths = new Set<string>();

	constructor(private readonly services: AcademicWidgetServices) {}

	mount(context: WidgetMountContext): Promise<void> { return this.load(context); }
	update(context: WidgetMountContext): Promise<void> { return this.load(context); }
	destroy(): void {
		this.generation += 1;
		this.events?.abort();
		this.events = null;
		this.context = null;
	}

	private async load(context: WidgetMountContext): Promise<void> {
		const generation = ++this.generation;
		this.events?.abort();
		this.events = new AbortController();
		this.context = context;
		context.contentEl.replaceChildren();
		context.setState({ status: 'loading' });
		try {
			const availability = await this.services.recentPapers.availability();
			if (generation !== this.generation) return;
			if (availability.status !== 'available') {
				context.setState({
					status: 'unavailable',
					reason: availability.reason,
					...(availability.status === 'unavailable' && availability.recovery
						? { recovery: availability.recovery }
						: {}),
				});
				return;
			}
			this.renderFilters(context);
			const items = await this.services.recentPapers.query({
				limit: 50,
				status: this.status,
				search: this.search,
				...(this.year === undefined ? {} : { year: this.year }),
			});
			if (generation !== this.generation) return;
			const document = context.contentEl.ownerDocument;
			const undoStates = this.services.getPaperUndos?.() ?? [];
			for (const undo of undoStates) {
				context.contentEl.append(this.createPaperUndo(document, context, undo));
			}
			if (items.length === 0) {
				if (undoStates.length > 0) {
					context.setState({ status: 'ready' });
					return;
				}
				context.setState({
					status: 'empty',
					message: 'No paper notes match the current metadata mapping and filters.',
				});
				return;
			}
			this.renderPapers(context, items);
			context.setState({ status: 'ready' });
		} catch {
			if (generation !== this.generation) return;
			context.setState({
				status: 'error',
				message: 'Research papers could not be loaded.',
				code: 'research_query_failed',
			});
		}
	}

	private renderFilters(context: WidgetMountContext): void {
		const document = context.contentEl.ownerDocument;
		const controls = element(document, 'div', 'academic-dashboard-filters');
		const search = element(document, 'input', 'academic-dashboard-filter');
		search.type = 'search';
		search.value = this.search;
		search.placeholder = 'Filter papers';
		search.setAttribute(
			'aria-label',
			t('filter.paperSearchAria'),
		);
		const status = element(document, 'select', 'academic-dashboard-filter');
		status.setAttribute('aria-label', t('filter.paperStatusAria'));
		for (const [value, label] of [
			['all', 'All statuses'],
			['unread', 'Unread'],
			['reading', 'Reading'],
			['reviewed', 'Reviewed'],
			['unspecified', 'Unspecified'],
		] as const) {
			const option = element(document, 'option', '', label);
			option.value = value;
			status.append(option);
		}
		status.value = this.status;
		const year = element(document, 'input', 'academic-dashboard-filter');
		year.type = 'number';
		year.placeholder = 'Year';
		year.setAttribute('aria-label', t('filter.paperYearAria'));
		year.value = this.year?.toString() ?? '';
		search.addEventListener('change', () => {
			this.search = search.value.trim();
			void this.load(context);
		}, { signal: this.events?.signal });
		status.addEventListener('change', () => {
			this.status = status.value as PaperStatusFilter;
			void this.load(context);
		}, { signal: this.events?.signal });
		year.addEventListener('change', () => {
			const parsed = Number(year.value);
			this.year = Number.isInteger(parsed) && parsed >= 1000 && parsed <= 9999
				? parsed
				: undefined;
			void this.load(context);
		}, { signal: this.events?.signal });
		controls.append(search, status, year);
		context.contentEl.append(controls);
	}

	private renderPapers(
		context: WidgetMountContext,
		items: readonly RecentPaperItem[],
	): void {
		const document = context.contentEl.ownerDocument;
		const list = element(document, 'div', 'academic-dashboard-note-list');
		for (const item of items) {
			const row = element(document, 'div', 'academic-dashboard-paper-row');
			const button = element(document, 'button', 'academic-dashboard-note academic-dashboard-paper');
			button.type = 'button';
			button.title = item.path;
			button.setAttribute('aria-label', t('research.openPaper', { title: item.title }));
			const details = [
				item.authors.slice(0, 3).join(', '),
				item.year?.toString(),
				item.venue,
				item.doi ? `DOI ${item.doi}` : undefined,
			].filter((part): part is string => Boolean(part));
			const badge = element(
				document,
				'span',
				'academic-dashboard-paper__status',
				item.status ?? 'Unspecified',
			);
			badge.setAttribute('data-status', item.status ?? 'unspecified');
			button.append(
				element(document, 'span', 'academic-dashboard-note__title', item.title),
				element(
					document,
					'span',
					'academic-dashboard-note__meta',
					details.join(' · ') || item.basename,
				),
				badge,
			);
			button.addEventListener('click', () => {
				void this.services.openNote(item.path).catch(() => {
					this.context?.setState({
						status: 'error',
						message: 'The selected paper note could not be opened.',
						code: 'paper_note_open_failed',
					});
				});
			}, { signal: this.events?.signal });
			row.append(button, this.renderPaperActions(document, item));
			list.append(row);
		}
		context.contentEl.append(list);
	}

	private renderPaperActions(
		document: Document,
		item: RecentPaperItem,
	): HTMLElement {
		const actions = element(document, 'div', 'academic-dashboard-paper-actions');
		const statusGroup = element(document, 'div', 'academic-dashboard-paper-actions__status');
		statusGroup.setAttribute('role', 'group');
		statusGroup.setAttribute('aria-label', t('research.setStatusGroup', { title: item.title }));
		for (const status of PAPER_STATUSES) {
			const control = element(
				document,
				'button',
				'academic-dashboard-paper-action',
				status[0]?.toLocaleUpperCase() + status.slice(1),
			);
			control.type = 'button';
			control.setAttribute('aria-label', t('research.setStatus', { title: item.title, status }));
			control.disabled =
				item.actions.status.state !== 'available' ||
				item.actions.status.current === status ||
				!this.services.setPaperStatus;
			control.setAttribute('aria-pressed', String(item.actions.status.current === status));
			control.addEventListener('click', () => {
				void this.runPaperAction(item, () =>
					this.services.setPaperStatus!(item, status), control);
			}, { signal: this.events?.signal });
			statusGroup.append(control);
		}
		const favorite = element(
			document,
			'button',
			'academic-dashboard-paper-action academic-dashboard-paper-action--favorite',
			item.actions.favorite.current ? t('research.removeFavoriteButton') : t('research.addFavoriteButton'),
		);
		favorite.type = 'button';
		favorite.setAttribute('aria-label', item.actions.favorite.current
			? t('research.removeFavorite', { title: item.title })
			: t('research.addFavorite', { title: item.title }));
		favorite.disabled =
			item.actions.favorite.state !== 'available' || !this.services.setPaperFavorite;
		favorite.setAttribute('aria-pressed', String(item.actions.favorite.current));
		favorite.addEventListener('click', () => {
			void this.runPaperAction(item, () =>
				this.services.setPaperFavorite!(item, !item.actions.favorite.current), favorite);
		}, { signal: this.events?.signal });
		actions.append(statusGroup, favorite);
		const reason =
			item.actions.status.reason ??
			item.actions.favorite.reason ??
			(!this.services.setPaperStatus || !this.services.setPaperFavorite
				? 'Paper writing is unavailable in this Dashboard session.'
				: undefined);
		if (reason) {
			actions.append(
				element(document, 'span', 'academic-dashboard-paper-actions__reason', reason),
			);
		}
		return actions;
	}

	private async runPaperAction(
		item: RecentPaperItem,
		commit: () => Promise<PaperActionCommit>,
		initiator: HTMLButtonElement,
	): Promise<void> {
		if (this.busyPaths.has(item.path)) return;
		const generation = this.generation;
		this.busyPaths.add(item.path);
		try {
			await commit();
			if (generation === this.generation && this.context) {
				await this.load(this.context);
				if (this.context) restoreStableFocus(this.context.contentEl, '.academic-dashboard-task-undo__button', initiator);
			}
		} catch {
			if (generation === this.generation) {
				this.context?.setState({
					status: 'error',
					message: 'The paper changed or its frontmatter is unsafe. Nothing else was overwritten.',
					code: 'paper_action_failed',
				});
				focusElement(initiator);
			}
		} finally {
			this.busyPaths.delete(item.path);
		}
	}

	private createPaperUndo(
		document: Document,
		context: WidgetMountContext,
		undo: PaperUndoState,
	): HTMLElement {
		const banner = element(document, 'div', 'academic-dashboard-task-undo');
		banner.append(element(document, 'span', '', `${undo.label} updated in ${undo.path}.`));
		const button = element(document, 'button', 'academic-dashboard-task-undo__button', 'Undo');
		button.type = 'button';
		button.setAttribute('aria-label', `Undo ${undo.label.toLocaleLowerCase()} update in ${undo.path}`);
		button.addEventListener('click', () => {
			const undoAction = this.services.undoPaperAction;
			if (!undoAction) return;
			void undoAction(undo.token).then(() => {
				if (this.context) void this.load(this.context).then(() => {
					if (this.context) restoreStableFocus(this.context.contentEl, '.academic-dashboard-paper-action');
				});
			}).catch(() => {
				context.setState({
					status: 'error',
					message: 'Undo is unavailable because the paper note changed.',
					code: 'paper_undo_conflict',
				});
				focusElement(button);
			});
		}, { signal: this.events?.signal });
		banner.append(button);
		return banner;
	}
}

function registration(
	id: string,
	title: string,
	pageId: 'home' | 'research',
	size: 'medium' | 'large',
	create: () => WidgetLifecycle,
): WidgetRegistration {
	return {
		definition: {
			id,
			title,
			allowedPages: [pageId],
			allowedSizes: ['medium', 'large'],
			defaultSize: size,
		},
		create,
	};
}

export function registerAcademicWidgets(
	registry: WidgetRegistry,
	services: AcademicWidgetServices,
): void {
	registry.register(
		registration('home.recent-notes', 'Recent Notes', 'home', 'large', () =>
			new RecentNotesWidget(services),
		),
	);
	registry.register(
		registration(
			'research.recent-papers',
			'Recent Papers',
			'research',
			'large',
			() => new RecentPapersWidget(services),
		),
	);
}
