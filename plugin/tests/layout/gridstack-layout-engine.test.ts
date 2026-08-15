import { describe, expect, it, vi } from 'vitest';
import type { GridStackNode, GridStackOptions, GridStackWidget } from 'gridstack';
import type { PersistedWidgetLayout } from '../../src/core/layout';
import {
	GridStackLayoutEngine,
	type GridStackPort,
} from '../../src/layout/gridstack-layout-engine';

class FakeClassList {
	private readonly values = new Set<string>();

	add(...values: string[]): void {
		for (const value of values) this.values.add(value);
	}

	remove(...values: string[]): void {
		for (const value of values) this.values.delete(value);
	}

	contains(value: string): boolean {
		return this.values.has(value);
	}
}

class FakeElement {
	readonly classList = new FakeClassList();
	readonly attributes = new Map<string, string>();
	readonly children: FakeElement[] = [];
	readonly dataset: Record<string, string> = {};
	firstElementChild: FakeElement | null = null;
	private keydown?: (event: KeyboardEvent) => void;

	setAttribute(name: string, value: string): void {
		this.attributes.set(name, value);
	}

	removeAttribute(name: string): void {
		this.attributes.delete(name);
	}

	toggleAttribute(name: string, force?: boolean): void {
		if (force) this.attributes.set(name, '');
		else this.attributes.delete(name);
	}

	addEventListener(name: string, listener: EventListenerOrEventListenerObject): void {
		if (name === 'keydown') this.keydown = listener as (event: KeyboardEvent) => void;
	}

	removeEventListener(name: string): void {
		if (name === 'keydown') this.keydown = undefined;
	}

	append(element: HTMLElement): void {
		this.children.push(element as unknown as FakeElement);
	}

	press(key: string, shiftKey = false): boolean {
		let prevented = false;
		this.keydown?.({
			key,
			shiftKey,
			preventDefault: () => {
				prevented = true;
			},
		} as KeyboardEvent);
		return prevented;
	}
}

class FakeGrid implements GridStackPort {
	readonly made: Array<{ element: HTMLElement; options: GridStackWidget }> = [];
	readonly moveStates: boolean[] = [];
	readonly resizeStates: boolean[] = [];
	readonly updates: GridStackWidget[] = [];
	readonly removeAllCalls: Array<readonly [boolean, boolean]> = [];
	readonly destroyCalls: boolean[] = [];
	offCount = 0;
	columnCount = 4;
	private change?: (event: Event, nodes: GridStackNode[]) => void;

	makeWidget(element: HTMLElement, options: GridStackWidget): HTMLElement {
		Object.defineProperty(options, 'el', { value: element });
		this.made.push({ element, options });
		return element;
	}

	enableMove(enabled: boolean): this {
		this.moveStates.push(enabled);
		return this;
	}

	enableResize(enabled: boolean): this {
		this.resizeStates.push(enabled);
		return this;
	}

	getColumn(): number {
		return this.columnCount;
	}

	update(_element: HTMLElement, options: GridStackWidget): this {
		this.updates.push(options);
		return this;
	}

	on(
		_name: 'change',
		callback: (event: Event, nodes: GridStackNode[]) => void,
	): this {
		this.change = callback;
		return this;
	}

	off(): this {
		this.offCount += 1;
		this.change = undefined;
		return this;
	}

	removeAll(removeDom: boolean, triggerEvent: boolean): this {
		this.removeAllCalls.push([removeDom, triggerEvent]);
		return this;
	}

	destroy(removeDom: boolean): this {
		this.destroyCalls.push(removeDom);
		return this;
	}

	emit(nodes: GridStackNode[]): void {
		this.change?.({} as Event, nodes);
	}
}

function element(): FakeElement {
	const item = new FakeElement();
	item.firstElementChild = new FakeElement();
	return item;
}

function asHtmlElement(value: FakeElement): HTMLElement {
	return value as unknown as HTMLElement;
}

const HOME_LAYOUT: PersistedWidgetLayout = {
	widgetId: 'test.clock',
	pageId: 'home',
	x: 1,
	y: 2,
	size: 'medium',
};

function layoutItem(item: FakeElement = element()) {
	return {
		layout: HOME_LAYOUT,
		element: asHtmlElement(item),
		allowedSizes: ['medium', 'large'] as const,
	};
}

describe('GridStackLayoutEngine', () => {
	it('mounts with dragging and resizing disabled', () => {
		const grid = new FakeGrid();
		const container = element();
		let options: GridStackOptions | undefined;
		const engine = new GridStackLayoutEngine('home', (received) => {
			options = received;
			return grid;
		});

		engine.mount(asHtmlElement(container));

		expect(options).toEqual(
			expect.objectContaining({
				column: 4,
				columnOpts: {
					columnMax: 4,
					layout: 'list',
					breakpoints: [
						{ w: 900, c: 2 },
						{ w: 560, c: 1 },
					],
				},
				disableDrag: true,
				disableResize: true,
			}),
		);
		expect(container.classList.contains('grid-stack')).toBe(true);
		expect(grid.moveStates).toEqual([false]);
		expect(grid.resizeStates).toEqual([false]);
	});

	it('adopts project DOM and enables bounded move and resize only in edit mode', () => {
		const grid = new FakeGrid();
		const container = element();
		const item = element();
		const engine = new GridStackLayoutEngine('home', () => grid);
		engine.mount(asHtmlElement(container));

		engine.setItems([layoutItem(item)]);
		engine.enableEditing(true);

		expect(grid.made[0]?.options).toEqual(
			expect.objectContaining({
				id: 'test.clock',
				w: 2,
				h: 1,
				noResize: false,
				minW: 2,
				maxW: 2,
				minH: 1,
				maxH: 2,
			}),
		);
		expect(grid.moveStates).toEqual([false, true]);
		expect(grid.resizeStates).toEqual([false, true]);
		expect(item.attributes.get('tabindex')).toBe('0');
		expect(item.attributes.has('data-layout-editing')).toBe(true);
	});

	it('emits project-owned snapshots from GridStack changes', () => {
		const grid = new FakeGrid();
		const engine = new GridStackLayoutEngine('home', () => grid);
		engine.mount(asHtmlElement(element()));
		engine.setItems([layoutItem()]);
		engine.enableEditing(true);
		const listener = vi.fn();
		engine.subscribeToChange(listener);

		grid.emit([{ id: 'test.clock', x: 3, y: 4 }]);

		expect(listener).toHaveBeenCalledWith([
			{ ...HOME_LAYOUT, x: 3, y: 4 },
		]);
	});

	it('persists only supported pointer resize spans', () => {
		const grid = new FakeGrid();
		const engine = new GridStackLayoutEngine('home', () => grid);
		engine.mount(asHtmlElement(element()));
		engine.setItems([layoutItem()]);
		engine.enableEditing(true);
		const listener = vi.fn();
		engine.subscribeToChange(listener);

		grid.emit([{ id: 'test.clock', x: 1, y: 2, w: 2, h: 2 }]);
		expect(listener).toHaveBeenLastCalledWith([
			{ ...HOME_LAYOUT, size: 'large' },
		]);

		grid.emit([{ id: 'test.clock', x: 1, y: 2, w: 1, h: 2 }]);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it('does not persist presentation-only responsive reflow', () => {
		const grid = new FakeGrid();
		grid.columnCount = 2;
		const engine = new GridStackLayoutEngine('home', () => grid);
		engine.mount(asHtmlElement(element()));
		engine.setItems([layoutItem()]);
		engine.enableEditing(true);
		const listener = vi.fn();
		engine.subscribeToChange(listener);

		grid.emit([{ id: 'test.clock', x: 0, y: 4 }]);

		expect(listener).not.toHaveBeenCalled();
		expect(engine.canEditCanonical()).toBe(false);
	});

	it('reports canonical edit capability only for four columns', () => {
		const grid = new FakeGrid();
		const engine = new GridStackLayoutEngine('home', () => grid);
		engine.mount(asHtmlElement(element()));
		expect(engine.canEditCanonical()).toBe(true);
		grid.columnCount = 1;
		expect(engine.canEditCanonical()).toBe(false);
	});

	it('supports keyboard movement only while editing', () => {
		const grid = new FakeGrid();
		const item = element();
		const engine = new GridStackLayoutEngine('home', () => grid);
		engine.mount(asHtmlElement(element()));
		engine.setItems([layoutItem(item)]);

		expect(item.press('ArrowRight')).toBe(false);
		engine.enableEditing(true);
		expect(item.press('ArrowRight')).toBe(true);
		expect(grid.updates).toEqual([{ x: 2, y: 2 }]);
	});

	it('labels edit-mode keyboard controls and applies repeated movement', () => {
		const grid = new FakeGrid();
		const item = element();
		item.dataset.widgetTitle = 'Clock';
		const engine = new GridStackLayoutEngine('home', () => grid);
		engine.mount(asHtmlElement(element()));
		engine.setItems([layoutItem(item)]);
		engine.enableEditing(true);

		item.press('ArrowRight');
		item.press('ArrowRight');

		expect(item.attributes.get('aria-label')).toBe(
			'Clock widget. Use arrow keys to move and Shift plus arrow keys to resize.',
		);
		expect(grid.updates).toEqual([
			{ x: 2, y: 2 },
			{ x: 3, y: 2 },
		]);
	});

	it('supports bounded keyboard resizing and emits the persisted size', () => {
		const grid = new FakeGrid();
		const item = element();
		const engine = new GridStackLayoutEngine('home', () => grid);
		engine.mount(asHtmlElement(element()));
		engine.setItems([layoutItem(item)]);
		engine.enableEditing(true);
		const listener = vi.fn();
		engine.subscribeToChange(listener);

		expect(item.press('ArrowDown', true)).toBe(true);
		expect(grid.updates).toContainEqual({ w: 2, h: 2 });
		expect(listener).toHaveBeenLastCalledWith([
			{ ...HOME_LAYOUT, size: 'large' },
		]);
		expect(item.press('ArrowDown', true)).toBe(true);
		expect(listener).toHaveBeenCalledTimes(1);
		expect(item.press('ArrowUp', true)).toBe(true);
		expect(listener).toHaveBeenLastCalledWith([HOME_LAYOUT]);
	});

	it('detaches GridStack and keyboard ownership deterministically', () => {
		const grid = new FakeGrid();
		const container = element();
		const item = element();
		const engine = new GridStackLayoutEngine('home', () => grid);
		engine.mount(asHtmlElement(container));
		engine.setItems([layoutItem(item)]);
		engine.enableEditing(true);

		engine.destroy();

		expect(grid.offCount).toBe(1);
		expect(grid.destroyCalls).toEqual([false]);
		expect(container.classList.contains('grid-stack')).toBe(false);
		expect(item.classList.contains('grid-stack-item')).toBe(false);
		expect(item.press('ArrowLeft')).toBe(false);
	});
});
