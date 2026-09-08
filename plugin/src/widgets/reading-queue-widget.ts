import type { DataAdapter } from '../core/data-adapter';
import type { ReadingQueueQuery } from '../adapters/native-reading-queue-adapter';
import { READING_STATUSES, type ReadingPositionUnit, type ReadingProgressRecord, type ReadingQueueItem, type ReadingStatus } from '../core/reading-queue';
import type { WidgetRegistry } from '../core/widget-registry';
import type { WidgetLifecycle, WidgetMountContext } from '../core/widgets';
import { t, translateEnglishSource, type LocaleResourceKey } from '../core/localization';

export interface ReadingQueuePatch { readonly status?: ReadingStatus; readonly nextStep?: string; readonly position?: string; readonly positionUnit?: ReadingPositionUnit }
export interface ReadingQueueWidgetServices {
	readonly queue: DataAdapter<ReadingQueueQuery, readonly ReadingQueueItem[]>;
	readonly getRecords: () => readonly ReadingProgressRecord[];
	readonly updateRecord: (item: ReadingQueueItem, patch: ReadingQueuePatch) => boolean;
	readonly moveRecord: (item: ReadingQueueItem, direction: -1 | 1, visible: readonly ReadingQueueItem[]) => boolean;
	readonly openNote: (path: string) => Promise<void>;
	readonly subscribeToVaultChanges: (callback: () => void) => () => void;
}
interface ObsidianWindowDom { createEl<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] }
function el<K extends keyof HTMLElementTagNameMap>(document: Document, tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
	const node = (document.win as Window & ObsidianWindowDom).createEl(tag); node.className = cls;
	if (text !== undefined) node.textContent = translateEnglishSource(text); return node;
}

export class ReadingQueueWidget implements WidgetLifecycle {
	private context: WidgetMountContext | null = null;
	private events: AbortController | null = null;
	private unsubscribe: (() => void) | null = null;
	private generation = 0;
	private kind: 'paper' | 'book' = 'paper';
	private status: ReadingStatus | 'all' = 'all';
	constructor(private readonly services: ReadingQueueWidgetServices) {}
	mount(context: WidgetMountContext): void { this.context = context; this.unsubscribe = this.services.subscribeToVaultChanges(() => { if (this.context) void this.render(this.context); }); void this.render(context); }
	update(context: WidgetMountContext): void { this.context = context; void this.render(context); }
	destroy(): void { this.generation += 1; this.events?.abort(); this.unsubscribe?.(); this.context = null; }

	private async render(context: WidgetMountContext): Promise<void> {
		const generation = ++this.generation; this.events?.abort(); this.events = new AbortController();
		context.contentEl.replaceChildren(); context.setState({ status: 'loading' });
		let items: readonly ReadingQueueItem[];
		try { items = await this.services.queue.query({ records: this.services.getRecords(), kind: this.kind, status: this.status, limit: 100 }); }
		catch { if (generation === this.generation) context.setState({ status: 'error', message: t('reading.loadFailed'), code: 'reading_queue_failed' }); return; }
		if (generation !== this.generation) return;
		const document = context.contentEl.ownerDocument;
		const filters = el(document, 'div', 'academic-dashboard-reading-queue__filters');
		const kind = el(document, 'select', 'academic-dashboard-filter');
		for (const [value, label] of [['paper', t('reading.papers')], ['book', t('reading.books')]] as const) { const option = el(document, 'option', '', label); option.value = value; kind.append(option); }
		kind.value = this.kind; kind.addEventListener('change', () => { this.kind = kind.value as 'paper' | 'book'; void this.render(context); }, { signal: this.events.signal });
		const status = el(document, 'select', 'academic-dashboard-filter');
		for (const value of ['all', ...READING_STATUSES] as const) { const option = el(document, 'option', '', t(`reading.status.${value}` as LocaleResourceKey)); option.value = value; status.append(option); }
		status.value = this.status; status.addEventListener('change', () => { this.status = status.value as ReadingStatus | 'all'; void this.render(context); }, { signal: this.events.signal });
		filters.append(kind, status); context.contentEl.append(filters);
		if (items.length === 0) { context.setState({ status: 'empty', message: t('reading.empty') }); return; }
		const list = el(document, 'div', 'academic-dashboard-reading-queue');
		for (const item of items) list.append(this.row(document, item, items));
		context.contentEl.append(list); context.setState({ status: 'ready' });
	}

	private row(document: Document, item: ReadingQueueItem, visible: readonly ReadingQueueItem[]): HTMLElement {
		const row = el(document, 'div', 'academic-dashboard-reading-item');
		const open = el(document, 'button', 'academic-dashboard-reading-item__open', item.title); open.type = 'button'; open.title = item.path;
		open.addEventListener('click', () => { void this.services.openNote(item.path).catch(() => this.context?.setState({ status: 'error', message: t('course.openFailed'), code: 'reading_note_open_failed' })); }, { signal: this.events?.signal }); row.append(open);
		const status = el(document, 'select', 'academic-dashboard-filter');
		for (const value of READING_STATUSES) { const option = el(document, 'option', '', t(`reading.status.${value}` as LocaleResourceKey)); option.value = value; status.append(option); } status.value = item.status;
		const next = el(document, 'input', 'academic-dashboard-filter'); next.value = item.nextStep; next.placeholder = t('reading.nextStep');
		const position = el(document, 'input', 'academic-dashboard-filter'); position.value = item.position; position.placeholder = item.kind === 'book' ? t('reading.pageOrChapter') : t('reading.stage');
		const unit = el(document, 'select', 'academic-dashboard-filter');
		for (const value of item.kind === 'book' ? ['page', 'chapter'] as const : ['stage'] as const) { const option = el(document, 'option', '', t(`reading.unit.${value}` as LocaleResourceKey)); option.value = value; unit.append(option); } unit.value = item.positionUnit;
		const save = el(document, 'button', 'academic-dashboard-reading-item__action', t('common.save')); save.type = 'button';
		save.addEventListener('click', () => { if (this.services.updateRecord(item, { status: status.value as ReadingStatus, nextStep: next.value, position: position.value, positionUnit: unit.value as ReadingPositionUnit }) && this.context) void this.render(this.context); }, { signal: this.events?.signal });
		const up = el(document, 'button', 'academic-dashboard-reading-item__action', '↑'); up.type = 'button'; up.title = t('reading.moveUp'); up.addEventListener('click', () => { if (this.services.moveRecord(item, -1, visible) && this.context) void this.render(this.context); }, { signal: this.events?.signal });
		const down = el(document, 'button', 'academic-dashboard-reading-item__action', '↓'); down.type = 'button'; down.title = t('reading.moveDown'); down.addEventListener('click', () => { if (this.services.moveRecord(item, 1, visible) && this.context) void this.render(this.context); }, { signal: this.events?.signal });
		row.append(status, next, position, unit, save, up, down); return row;
	}
}

export function registerReadingQueueWidget(registry: WidgetRegistry, services: ReadingQueueWidgetServices): void {
	registry.register({ definition: { id: 'research.reading-queue', title: 'Reading Queue', allowedPages: ['research'], allowedSizes: ['large'], defaultSize: 'large' }, create: () => new ReadingQueueWidget(services) });
}
