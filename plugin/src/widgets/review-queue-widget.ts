import { toIsoDate } from '../core/calendar-tasks';
import type { DataAdapter } from '../core/data-adapter';
import { reviewDateChoices } from '../core/review-queue';
import type {
	ReviewKindFilter,
	ReviewQueueItem,
	ReviewQueueQuery,
} from '../core/review-queue';
import type { WidgetRegistry } from '../core/widget-registry';
import type { WidgetLifecycle, WidgetMountContext } from '../core/widgets';
import { t, translateEnglishSource } from '../core/localization';
import { focusElement, restoreStableFocus } from '../ui/focus';

export interface ReviewQueueWidgetServices {
	readonly now: () => Date;
	readonly reviews: DataAdapter<ReviewQueueQuery, readonly ReviewQueueItem[]>;
	readonly openNote: (path: string) => Promise<void>;
	readonly reviewDate: (
		item: ReviewQueueItem,
		nextReviewDate: string,
	) => Promise<
		| { readonly outcome: 'cancelled' }
		| { readonly outcome: 'committed'; readonly undoToken: string; readonly path: string }
	>;
	readonly undoReviewDate: (token: string) => Promise<void>;
	readonly getReviewUndos: () => readonly {
		readonly token: string;
		readonly path: string;
	}[];
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

export class ReviewQueueWidget implements WidgetLifecycle {
	private generation = 0;
	private events: AbortController | null = null;
	private context: WidgetMountContext | null = null;
	private kind: ReviewKindFilter = 'all';
	private search = '';

	constructor(private readonly services: ReviewQueueWidgetServices) {}

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

	private async load(context: WidgetMountContext): Promise<void> {
		const generation = ++this.generation;
		this.events?.abort();
		this.events = new AbortController();
		this.context = context;
		context.contentEl.replaceChildren();
		context.setState({ status: 'loading' });
		try {
			const availability = await this.services.reviews.availability();
			if (generation !== this.generation) return;
			if (availability.status === 'unavailable') {
				context.setState({
					status: 'unavailable',
					reason: availability.reason,
					...(availability.recovery ? { recovery: availability.recovery } : {}),
				});
				return;
			}
			const now = this.services.now();
			const date = toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
			this.renderFilters(context);
			const items = await this.services.reviews.query({
				date,
				limit: 20,
				kind: this.kind,
				search: this.search,
			});
			if (generation !== this.generation) return;
			const document = context.contentEl.ownerDocument;
			const undoStates = this.services.getReviewUndos();
			for (const undo of undoStates) {
				context.contentEl.append(this.createUndo(document, context, undo));
			}
			if (items.length === 0) {
				if (undoStates.length > 0) {
					context.setState({ status: 'ready' });
					return;
				}
				context.setState({
					status: 'empty',
					message: availability.status === 'fallback'
						? 'No Native Markdown reviews or flashcards are due.'
						: 'No Spaced Repetition items are due.',
				});
				return;
			}
			this.renderItems(context, items, availability.status === 'fallback');
			context.setState({ status: 'ready' });
		} catch {
			if (generation !== this.generation) return;
			context.setState({
				status: 'error',
				message: 'The review queue could not be loaded.',
				code: 'review_queue_failed',
			});
		}
	}

	private renderFilters(context: WidgetMountContext): void {
		const document = context.contentEl.ownerDocument;
		const controls = element(document, 'div', 'academic-dashboard-filters');
		const search = element(document, 'input', 'academic-dashboard-filter');
		search.type = 'search';
		search.value = this.search;
		search.placeholder = 'Filter reviews';
		search.setAttribute('aria-label', t('filter.reviewSearchAria'));
		const kind = element(document, 'select', 'academic-dashboard-filter');
		kind.setAttribute('aria-label', t('filter.reviewKindAria'));
		for (const [value, label] of [
			['all', 'All reviews'],
			['note', 'Notes'],
			['flashcard', 'Flashcards'],
		] as const) {
			const option = element(document, 'option', '', label);
			option.value = value;
			kind.append(option);
		}
		kind.value = this.kind;
		search.addEventListener('change', () => {
			this.search = search.value.trim();
			void this.load(context);
		}, { signal: this.events?.signal });
		kind.addEventListener('change', () => {
			this.kind = kind.value as ReviewKindFilter;
			void this.load(context);
		}, { signal: this.events?.signal });
		controls.append(search, kind);
		context.contentEl.append(controls);
	}

	private renderItems(
		context: WidgetMountContext,
		items: readonly ReviewQueueItem[],
		fallback: boolean,
	): void {
		const document = context.contentEl.ownerDocument;
		if (fallback) {
			context.contentEl.append(
				element(document, 'div', 'academic-dashboard-data-source', 'Native Markdown fallback'),
			);
		}
		const list = element(document, 'div', 'academic-dashboard-note-list');
		for (const item of items) {
			const row = element(document, 'div', 'academic-dashboard-review');
			const button = element(document, 'button', 'academic-dashboard-note');
			button.type = 'button';
			button.title = item.path;
			button.append(
				element(document, 'span', 'academic-dashboard-note__title', item.title),
				element(
					document,
					'span',
					'academic-dashboard-note__meta',
					item.kind === 'note'
						? 'Note review'
						: `${item.dueCount} of ${item.totalCount} cards due`,
				),
			);
			button.addEventListener(
				'click',
				() => {
					void this.services.openNote(item.path).catch(() => {
						this.context?.setState({
							status: 'error',
							message: 'The review note could not be opened.',
							code: 'review_note_open_failed',
						});
					});
				},
				{ signal: this.events?.signal },
			);
			row.append(button);
			if (fallback && item.reviewTarget) {
				const controls = element(document, 'div', 'academic-dashboard-review__controls');
				const select = element(document, 'select', 'academic-dashboard-filter');
				select.setAttribute('aria-label', `Choose next review date for ${item.title}`);
				for (const choice of reviewDateChoices(this.services.now())) {
					const option = element(document, 'option', '', `${choice.label} — ${choice.date}`);
					option.value = choice.date;
					select.append(option);
				}
				const update = element(
					document,
					'button',
					'academic-dashboard-review__update',
					'Review date',
				);
				update.type = 'button';
				update.title = `Review one marker at ${item.path}:${item.reviewTarget.line}`;
				update.addEventListener('click', () => {
					void this.services.reviewDate(item, select.value).then((result) => {
						if (result.outcome === 'committed' && this.context) {
							void this.update(this.context).then(() => {
								if (this.context) restoreStableFocus(this.context.contentEl, '.academic-dashboard-task-undo__button');
							});
						} else {
							focusElement(update);
						}
					}).catch(() => {
						this.context?.setState({
							status: 'error',
							message: 'The review marker changed or could not be updated. Nothing was overwritten.',
							code: 'review_date_failed',
						});
						focusElement(update);
					});
				}, { signal: this.events?.signal });
				controls.append(select, update);
				row.append(controls);
			}
			list.append(row);
		}
		context.contentEl.append(list);
	}

	private createUndo(
		document: Document,
		context: WidgetMountContext,
		undo: { readonly token: string; readonly path: string },
	): HTMLElement {
		const banner = element(document, 'div', 'academic-dashboard-task-undo');
		banner.append(element(document, 'span', '', `Review date updated in ${undo.path}.`));
		const button = element(document, 'button', 'academic-dashboard-task-undo__button', 'Undo');
		button.type = 'button';
		button.addEventListener('click', () => {
			void this.services.undoReviewDate(undo.token).then(() => {
				if (this.context) void this.update(this.context).then(() => {
					if (this.context) restoreStableFocus(this.context.contentEl, '.academic-dashboard-review__update');
				});
			}).catch(() => {
				context.setState({
					status: 'error',
					message: 'Undo is unavailable because the review note changed.',
					code: 'review_undo_conflict',
				});
				focusElement(button);
			});
		}, { signal: this.events?.signal });
		banner.append(button);
		return banner;
	}
}

export function registerReviewQueueWidget(
	registry: WidgetRegistry,
	services: ReviewQueueWidgetServices,
): void {
	registry.register({
		definition: {
			id: 'study.review-queue',
			title: 'Review Queue',
			allowedPages: ['study'],
			allowedSizes: ['medium', 'large'],
			defaultSize: 'large',
		},
		create: () => new ReviewQueueWidget(services),
	});
}
