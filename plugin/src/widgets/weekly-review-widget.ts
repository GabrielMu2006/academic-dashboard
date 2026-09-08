import type { WeeklyReviewDraft } from '../core/weekly-review';
import type { WidgetRegistry } from '../core/widget-registry';
import type { WidgetLifecycle, WidgetMountContext } from '../core/widgets';
import { t, translateEnglishSource } from '../core/localization';

export interface WeeklyReviewWidgetServices {
	readonly loadDraft: () => Promise<WeeklyReviewDraft>;
	readonly reviewAndCreate: (draft: WeeklyReviewDraft, editedContent: string) => Promise<'cancelled' | 'created'>;
}

interface ObsidianWindowDom { createEl<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] }
function el<K extends keyof HTMLElementTagNameMap>(document: Document, tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
	const node = (document.win as Window & ObsidianWindowDom).createEl(tag); node.className = cls;
	if (text !== undefined) node.textContent = translateEnglishSource(text); return node;
}

export class WeeklyReviewWidget implements WidgetLifecycle {
	private context: WidgetMountContext | null = null;
	private events: AbortController | null = null;
	private generation = 0;

	constructor(private readonly services: WeeklyReviewWidgetServices) {}

	mount(context: WidgetMountContext): void { this.context = context; void this.render(context); }
	update(context: WidgetMountContext): void { this.context = context; void this.render(context); }
	destroy(): void { this.generation += 1; this.events?.abort(); this.context = null; }

	private async render(context: WidgetMountContext): Promise<void> {
		const generation = ++this.generation; this.events?.abort(); this.events = new AbortController();
		context.contentEl.replaceChildren(); context.setState({ status: 'loading' });
		let draft: WeeklyReviewDraft;
		try { draft = await this.services.loadDraft(); }
		catch { if (generation === this.generation) context.setState({ status: 'error', message: t('weekly.loadFailed'), code: 'weekly_review_failed' }); return; }
		if (generation !== this.generation) return;
		const document = context.contentEl.ownerDocument;
		const summary = el(document, 'div', 'academic-dashboard-weekly-review__summary', t('weekly.summary', {
			start: draft.range.startDate, end: draft.range.endDate, notes: draft.modifiedNoteCount,
			local: draft.localWriteCount, agent: draft.agentWriteCount,
		}));
		const path = el(document, 'div', 'academic-dashboard-weekly-review__path', draft.path);
		const limits = el(document, 'div', 'academic-dashboard-weekly-review__limits', t('weekly.limits'));
		const editor = el(document, 'textarea', 'academic-dashboard-weekly-review__editor');
		editor.value = draft.content; editor.setAttribute('aria-label', t('weekly.editorAria')); editor.spellcheck = true;
		const actions = el(document, 'div', 'academic-dashboard-weekly-review__actions');
		const refresh = el(document, 'button', 'academic-dashboard-weekly-review__action', t('common.refresh')); refresh.type = 'button';
		refresh.addEventListener('click', () => { void this.render(context); }, { signal: this.events.signal });
		const create = el(document, 'button', 'academic-dashboard-weekly-review__action mod-cta', t('weekly.reviewCreation')); create.type = 'button';
		create.addEventListener('click', () => {
			create.disabled = true; refresh.disabled = true;
			void this.services.reviewAndCreate(draft, editor.value).then((outcome) => {
				if (outcome === 'cancelled') { create.disabled = false; refresh.disabled = false; }
				else context.setState({ status: 'ready' });
			}).catch(() => { create.disabled = false; refresh.disabled = false; context.setState({ status: 'error', message: t('weekly.createFailed'), code: 'weekly_review_create_failed' }); });
		}, { signal: this.events.signal });
		actions.append(refresh, create); context.contentEl.append(summary, path, limits, editor, actions); context.setState({ status: 'ready' });
	}
}

export function registerWeeklyReviewWidget(registry: WidgetRegistry, services: WeeklyReviewWidgetServices): void {
	registry.register({ definition: { id: 'home.weekly-review', title: 'Weekly Review', allowedPages: ['home'], allowedSizes: ['large'], defaultSize: 'large' }, create: () => new WeeklyReviewWidget(services) });
}
