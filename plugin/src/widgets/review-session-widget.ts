import { toIsoDate } from '../core/calendar-tasks';
import type { ReviewKindFilter, ReviewQueueItem, ReviewQueueQuery } from '../core/review-queue';
import { reviewDateChoices } from '../core/review-queue';
import { startReviewSession, updateReviewSession, type ReviewSessionLimit, type ReviewSessionState } from '../core/review-session';
import type { DataAdapter } from '../core/data-adapter';
import type { WidgetRegistry } from '../core/widget-registry';
import type { WidgetLifecycle, WidgetMountContext } from '../core/widgets';
import { t, translateEnglishSource, type LocaleResourceKey } from '../core/localization';

export interface ReviewSessionWidgetServices {
	readonly now: () => Date;
	readonly reviews: DataAdapter<ReviewQueueQuery, readonly ReviewQueueItem[]>;
	readonly openNote: (path: string) => Promise<void>;
	readonly reviewDate: (item: ReviewQueueItem, nextReviewDate: string) => Promise<{ readonly outcome: 'cancelled' } | { readonly outcome: 'committed'; readonly undoToken: string; readonly path: string }>;
}
interface ObsidianWindowDom { createEl<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] }
function el<K extends keyof HTMLElementTagNameMap>(document: Document, tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
	const node = (document.win as Window & ObsidianWindowDom).createEl(tag); node.className = cls;
	if (text !== undefined) node.textContent = translateEnglishSource(text); return node;
}

export class ReviewSessionWidget implements WidgetLifecycle {
	private context: WidgetMountContext | null = null;
	private events: AbortController | null = null;
	private generation = 0;
	private session: ReviewSessionState | null = null;
	private kind: ReviewKindFilter = 'all';
	private course = '';
	private limit: ReviewSessionLimit = 10;
	constructor(private readonly services: ReviewSessionWidgetServices) {}
	mount(context: WidgetMountContext): void { this.context = context; void this.render(context); }
	update(context: WidgetMountContext): void { this.context = context; void this.render(context); }
	destroy(): void { this.generation += 1; this.events?.abort(); this.context = null; this.session = null; }

	private async render(context: WidgetMountContext): Promise<void> {
		const generation = ++this.generation; this.events?.abort(); this.events = new AbortController();
		context.contentEl.replaceChildren(); context.setState({ status: 'loading' });
		if (this.session) { this.renderSession(context); context.setState({ status: 'ready' }); return; }
		const now = this.services.now(); const date = toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
		let items: readonly ReviewQueueItem[];
		try { items = await this.services.reviews.query({ date, limit: 100, kind: this.kind }); }
		catch { if (generation === this.generation) context.setState({ status: 'error', message: t('session.loadFailed'), code: 'review_session_failed' }); return; }
		if (generation !== this.generation) return;
		const document = context.contentEl.ownerDocument; const controls = el(document, 'div', 'academic-dashboard-review-session__setup');
		const course = el(document, 'select', 'academic-dashboard-filter');
		const allCourses = el(document, 'option', '', t('session.allCourses')); allCourses.value = ''; course.append(allCourses);
		const courses = [...new Set(items.map((item) => item.course).filter((value): value is string => Boolean(value)))].sort();
		if (this.course && !courses.includes(this.course)) this.course = '';
		for (const name of courses) { const option = el(document, 'option', '', name); option.value = name; course.append(option); }
		course.value = this.course; course.addEventListener('change', () => { this.course = course.value; }, { signal: this.events.signal });
		const kind = el(document, 'select', 'academic-dashboard-filter');
		for (const [value, label] of [['all', t('filter.allReviews')], ['note', t('filter.notes')], ['flashcard', t('filter.flashcards')]] as const) { const option = el(document, 'option', '', label); option.value = value; kind.append(option); }
		kind.value = this.kind; kind.addEventListener('change', () => { this.kind = kind.value as ReviewKindFilter; void this.render(context); }, { signal: this.events.signal });
		const limit = el(document, 'select', 'academic-dashboard-filter'); for (const value of [10, 20] as const) { const option = el(document, 'option', '', t('session.itemLimit', { count: value })); option.value = `${value}`; limit.append(option); } limit.value = `${this.limit}`; limit.addEventListener('change', () => { this.limit = Number(limit.value) === 20 ? 20 : 10; }, { signal: this.events.signal });
		const start = el(document, 'button', 'academic-dashboard-review-session__action', t('session.start')); start.type = 'button';
		start.addEventListener('click', () => { const selected = this.course ? items.filter((item) => item.course === this.course) : items; this.session = startReviewSession(selected, this.limit); void this.render(context); }, { signal: this.events.signal });
		controls.append(course, kind, limit, start); context.contentEl.append(controls);
		context.contentEl.append(el(document, 'div', 'academic-dashboard-review-session__help', t('session.explanation')));
		context.setState(items.length === 0 ? { status: 'empty', message: t('session.empty') } : { status: 'ready' });
	}

	private renderSession(context: WidgetMountContext): void {
		const session = this.session; if (!session) return; const document = context.contentEl.ownerDocument;
		const viewed = session.items.filter(({ state }) => state === 'viewed').length; const skipped = session.items.filter(({ state }) => state === 'skipped').length;
		const header = el(document, 'div', 'academic-dashboard-review-session__header', t('session.progress', { viewed, skipped, total: session.items.length }));
		const cancel = el(document, 'button', 'academic-dashboard-review-session__action', t('session.end')); cancel.type = 'button'; cancel.addEventListener('click', () => { this.session = null; void this.render(context); }, { signal: this.events?.signal }); header.append(cancel); context.contentEl.append(header);
		const list = el(document, 'div', 'academic-dashboard-review-session__list');
		for (const entry of session.items) {
			const row = el(document, 'div', 'academic-dashboard-review-session__item'); row.setAttribute('data-state', entry.state);
			const open = el(document, 'button', 'academic-dashboard-review-session__open', entry.item.title); open.type = 'button'; open.title = entry.item.path; open.addEventListener('click', () => { void this.services.openNote(entry.item.path).catch(() => context.setState({ status: 'error', message: t('session.openFailed'), code: 'review_session_open_failed' })); }, { signal: this.events?.signal }); row.append(open, el(document, 'span', 'academic-dashboard-review-session__state', t(`session.state.${entry.state}` as LocaleResourceKey)));
			for (const [action, label] of [['view', t('session.viewed')], ['skip', t('session.skip')]] as const) { const button = el(document, 'button', 'academic-dashboard-review-session__action', label); button.type = 'button'; button.addEventListener('click', () => { if (this.session) { this.session = updateReviewSession(this.session, entry.key, action); this.renderSessionInto(context); } }, { signal: this.events?.signal }); row.append(button); }
			if (entry.item.reviewTarget) { const dates = el(document, 'select', 'academic-dashboard-filter'); const choices = reviewDateChoices(this.services.now()); for (const choice of choices) { const option = el(document, 'option', '', `${choice.label} — ${choice.date}`); option.value = choice.date; dates.append(option); } dates.value = choices[0]?.date ?? ''; const update = el(document, 'button', 'academic-dashboard-review-session__action', t('session.reviewDate')); update.type = 'button'; update.addEventListener('click', () => { void this.services.reviewDate(entry.item, dates.value).then((result) => { if (result.outcome === 'committed' && this.session) { this.session = updateReviewSession(this.session, entry.key, 'view'); this.renderSessionInto(context); } }).catch(() => context.setState({ status: 'error', message: t('session.dateFailed'), code: 'review_session_date_failed' })); }, { signal: this.events?.signal }); row.append(dates, update); }
			list.append(row);
		}
		context.contentEl.append(list);
	}

	private renderSessionInto(context: WidgetMountContext): void { context.contentEl.replaceChildren(); this.renderSession(context); context.setState({ status: 'ready' }); }
}

export function registerReviewSessionWidget(registry: WidgetRegistry, services: ReviewSessionWidgetServices): void {
	registry.register({ definition: { id: 'study.review-session', title: 'Review Session', allowedPages: ['study'], allowedSizes: ['large'], defaultSize: 'large' }, create: () => new ReviewSessionWidget(services) });
}
