import { GridStack } from 'gridstack';
import type {
	GridItemHTMLElement,
	GridStackNode,
	GridStackOptions,
	GridStackWidget,
} from 'gridstack';
import type { PersistedWidgetLayout } from '../core/layout';
import type { PageId } from '../core/pages';
import type { WidgetId, WidgetSize } from '../core/widgets';
import { getWidgetSizePolicy } from '../core/default-layouts';
import { fromGridStackRecord, toGridStackRecord } from './gridstack-records';
import { t } from '../core/localization';
import type {
	LayoutChangeListener,
	LayoutEngine,
	LayoutEngineItem,
} from './layout-engine';

export interface GridStackPort {
	makeWidget(element: HTMLElement, options: GridStackWidget): GridItemHTMLElement;
	enableMove(enabled: boolean): GridStackPort;
	enableResize(enabled: boolean): GridStackPort;
	getColumn(): number;
	update(element: HTMLElement, options: GridStackWidget): GridStackPort;
	on(
		name: 'change',
		callback: (event: Event, nodes: GridStackNode[]) => void,
	): GridStackPort;
	off(name: 'change'): GridStackPort;
	removeAll(removeDom: boolean, triggerEvent: boolean): GridStackPort;
	destroy(removeDom: boolean): GridStackPort;
}

const CANONICAL_GRID_COLUMNS = 4;

export type GridStackInitializer = (
	options: GridStackOptions,
	container: HTMLElement,
) => GridStackPort | null;

const GRIDSTACK_OPTIONS: GridStackOptions = Object.freeze({
	column: CANONICAL_GRID_COLUMNS,
	columnOpts: {
		columnMax: CANONICAL_GRID_COLUMNS,
		layout: 'list' as const,
		breakpoints: [
			{ w: 900, c: 2 },
			{ w: 560, c: 1 },
		],
	},
	cellHeight: 132,
	margin: 8,
	float: true,
	animate: true,
	disableDrag: true,
	disableResize: true,
	resizable: { handles: 'se' },
});

const defaultInitializer: GridStackInitializer = (options, container) =>
	GridStack.init(options, container);

interface OwnedElement {
	readonly item: HTMLElement;
	readonly content?: Element;
	readonly keydown: (event: KeyboardEvent) => void;
	readonly allowedSizes: readonly WidgetSize[];
}

export class GridStackLayoutEngine implements LayoutEngine {
	private container: HTMLElement | null = null;
	private grid: GridStackPort | null = null;
	private editing = false;
	private interactive = false;
	private readonly listeners = new Set<LayoutChangeListener>();
	private readonly layouts = new Map<WidgetId, PersistedWidgetLayout>();
	private readonly ownedElements = new Map<WidgetId, OwnedElement>();

	constructor(
		private readonly pageId: PageId,
		private readonly initialize: GridStackInitializer = defaultInitializer,
	) {}

	mount(container: HTMLElement): void {
		if (this.grid) throw new Error('Layout engine is already mounted.');
		container.classList.add('grid-stack', 'academic-dashboard-grid');
		const grid = this.initialize(GRIDSTACK_OPTIONS, container);
		if (!grid) {
			container.classList.remove('grid-stack', 'academic-dashboard-grid');
			throw new Error('GridStack could not mount the layout container.');
		}
		this.container = container;
		this.grid = grid;
		grid.on('change', this.handleGridChange);
		grid.enableResize(false);
		grid.enableMove(this.editing);
	}

	setItems(items: readonly LayoutEngineItem[]): void {
		const grid = this.requireGrid();
		const container = this.requireContainer();
		this.releaseOwnedElements();
		grid.removeAll(false, false);
		this.layouts.clear();

		for (const { layout, element, allowedSizes } of items) {
			if (layout.pageId !== this.pageId) continue;
			const record = toGridStackRecord(layout, allowedSizes);
			element.classList.add('grid-stack-item', 'academic-dashboard-grid__item');
			element.setAttribute('data-widget-id', layout.widgetId);
			element.setAttribute('tabindex', this.editing ? '0' : '-1');
			const title = element.dataset.widgetTitle ?? layout.widgetId;
			element.setAttribute('aria-label', t('layout.widget', { title }));
			const content = element.firstElementChild ?? undefined;
			content?.classList.add(
				'grid-stack-item-content',
				'academic-dashboard-grid__content',
			);
			const keydown = (event: KeyboardEvent): void =>
				this.handleKeydown(event, element, layout.widgetId);
			element.addEventListener('keydown', keydown);
			container.append(element);
			// GridStack annotates the supplied options with runtime-only fields.
			// Keep project conversion records immutable and copy at the adapter edge.
			grid.makeWidget(element, { ...record });
			this.layouts.set(layout.widgetId, layout);
			this.ownedElements.set(layout.widgetId, {
				item: element,
				content,
				keydown,
				allowedSizes,
			});
		}
	}

	canEditCanonical(): boolean {
		return this.grid?.getColumn() === CANONICAL_GRID_COLUMNS;
	}

	enableEditing(enabled: boolean): void {
		this.editing = enabled;
		const grid = this.grid;
		if (!grid) return;
		const interactive = enabled && grid.getColumn() === CANONICAL_GRID_COLUMNS;
		this.interactive = interactive;
		grid.enableMove(interactive);
		grid.enableResize(interactive);
		for (const { item, allowedSizes } of this.ownedElements.values()) {
			item.setAttribute('tabindex', enabled ? '0' : '-1');
			item.toggleAttribute('data-layout-editing', interactive);
			item.toggleAttribute('data-layout-resizable', interactive && allowedSizes.length > 1);
			const title = item.dataset.widgetTitle ?? item.dataset.widgetId ?? 'Dashboard';
			item.setAttribute(
				'aria-label',
				interactive
					? t('layout.widgetInstructions', { title })
					: enabled
						? t('layout.widgetWiden', { title })
						: t('layout.widget', { title }),
			);
		}
	}

	subscribeToChange(listener: LayoutChangeListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	destroy(): void {
		const grid = this.grid;
		if (grid) {
			grid.off('change');
			grid.destroy(false);
		}
		this.releaseOwnedElements();
		this.container?.classList.remove('grid-stack', 'academic-dashboard-grid');
		this.layouts.clear();
		this.listeners.clear();
		this.container = null;
		this.grid = null;
		this.interactive = false;
	}

	private readonly handleGridChange = (
		_event: Event,
		nodes: GridStackNode[],
	): void => {
		// Responsive column changes are presentation-only. Persist coordinates only
		// while the user is explicitly editing the canonical four-column layout.
		if (
			!this.editing ||
			this.requireGrid().getColumn() !== CANONICAL_GRID_COLUMNS
		) {
			return;
		}
		let changed = false;
		for (const node of nodes) {
			if (typeof node.id !== 'string') continue;
			const widgetId = node.id;
			const current = this.layouts.get(widgetId);
			if (!current || node.x === undefined || node.y === undefined) continue;
			const owned = this.ownedElements.get(widgetId);
			if (!owned) continue;
			const currentRecord = toGridStackRecord(current, owned.allowedSizes);
			const nextRecord = {
				...currentRecord,
				x: node.x,
				y: node.y,
				w: node.w ?? currentRecord.w,
				h: node.h ?? currentRecord.h,
			};
			let next: PersistedWidgetLayout;
			try {
				next = fromGridStackRecord(nextRecord, this.pageId);
			} catch {
				continue;
			}
			if (!owned.allowedSizes.includes(next.size)) continue;
			if (
				next.x === current.x &&
				next.y === current.y &&
				next.size === current.size
			) continue;
			this.layouts.set(widgetId, next);
			changed = true;
		}
		if (changed) this.emitSnapshot();
	};

	private handleKeydown(
		event: KeyboardEvent,
		element: HTMLElement,
		widgetId: WidgetId,
	): void {
		if (!this.interactive) return;
		const current = this.layouts.get(widgetId);
		if (!current) return;
		const owned = this.ownedElements.get(widgetId);
		if (!owned) return;
		if (event.shiftKey) {
			const direction =
				event.key === 'ArrowRight' || event.key === 'ArrowDown'
					? 1
					: event.key === 'ArrowLeft' || event.key === 'ArrowUp'
						? -1
						: 0;
			if (direction === 0 || owned.allowedSizes.length < 2) return;
			event.preventDefault();
			const currentIndex = owned.allowedSizes.indexOf(current.size);
			const nextIndex = Math.max(
				0,
				Math.min(owned.allowedSizes.length - 1, currentIndex + direction),
			);
			const nextSize = owned.allowedSizes[nextIndex];
			if (!nextSize || nextSize === current.size) return;
			const updated = { ...current, size: nextSize };
			this.layouts.set(widgetId, updated);
			const policy = getWidgetSizePolicy(nextSize);
			this.requireGrid().update(element, {
				w: policy.columns,
				h: policy.rows,
			});
			this.emitSnapshot();
			return;
		}
		const delta: readonly [number, number] | undefined = {
			ArrowLeft: [-1, 0],
			ArrowRight: [1, 0],
			ArrowUp: [0, -1],
			ArrowDown: [0, 1],
		}[event.key] as readonly [number, number] | undefined;
		if (!delta) return;
		event.preventDefault();
		const updated = {
			...current,
			x: Math.max(0, current.x + delta[0]),
			y: Math.max(0, current.y + delta[1]),
		};
		this.layouts.set(widgetId, updated);
		this.requireGrid().update(element, { x: updated.x, y: updated.y });
		this.emitSnapshot();
	}

	private emitSnapshot(): void {
		const snapshot = Object.freeze([...this.layouts.values()]);
		for (const listener of this.listeners) listener(snapshot);
	}

	private releaseOwnedElements(): void {
		for (const { item, content, keydown } of this.ownedElements.values()) {
			item.removeEventListener('keydown', keydown);
			item.classList.remove('grid-stack-item', 'academic-dashboard-grid__item');
			item.removeAttribute('data-widget-id');
			item.removeAttribute('data-layout-editing');
			item.removeAttribute('data-layout-resizable');
			item.removeAttribute('tabindex');
			item.removeAttribute('aria-label');
			content?.classList.remove(
				'grid-stack-item-content',
				'academic-dashboard-grid__content',
			);
		}
		this.ownedElements.clear();
	}

	private requireGrid(): GridStackPort {
		if (!this.grid) throw new Error('Layout engine is not mounted.');
		return this.grid;
	}

	private requireContainer(): HTMLElement {
		if (!this.container) throw new Error('Layout engine is not mounted.');
		return this.container;
	}
}
