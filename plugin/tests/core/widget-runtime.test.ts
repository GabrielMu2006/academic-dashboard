import { describe, expect, it, vi } from 'vitest';
import type { PersistedWidgetLayout } from '../../src/core/layout';
import { WidgetRegistry } from '../../src/core/widget-registry';
import {
	WidgetRuntime,
	type WidgetPageHost,
	type WidgetSlot,
} from '../../src/core/widget-runtime';
import type {
	WidgetDefinition,
	WidgetLifecycle,
	WidgetRegistration,
	WidgetState,
} from '../../src/core/widgets';

interface FakeSlot extends WidgetSlot {
	readonly states: WidgetState[];
	readonly removed: ReturnType<typeof vi.fn>;
}

function createHost(): WidgetPageHost & {
	readonly slots: FakeSlot[];
	readonly clearMock: ReturnType<typeof vi.fn>;
} {
	const slots: FakeSlot[] = [];
	const clear = vi.fn();
	return {
		slots,
		clearMock: clear,
		createSlot: () => {
			const removed = vi.fn();
			const slot: FakeSlot = {
				contentEl: {} as HTMLElement,
				states: [],
				removed,
				setState(state): void {
					this.states.push(state);
				},
				remove: removed,
			};
			slots.push(slot);
			return slot;
		},
		clear,
	};
}

function layout(widgetId: string): PersistedWidgetLayout {
	return { widgetId, pageId: 'home', x: 0, y: 0, size: 'small' };
}

function definition(id: string): WidgetDefinition {
	return {
		id,
		title: id,
		allowedPages: ['home'],
		allowedSizes: ['small'],
		defaultSize: 'small',
	};
}

function register(
	registry: WidgetRegistry,
	id: string,
	instance: WidgetLifecycle,
): void {
	const registration: WidgetRegistration = {
		definition: definition(id),
		create: () => instance,
	};
	registry.register(registration);
}

describe('WidgetRuntime', () => {
	it('starts independent widget mounts without serializing the page', async () => {
		const registry = new WidgetRegistry();
		let releaseFirst: (() => void) | undefined;
		const firstPending = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const secondMount = vi.fn();
		register(registry, 'test.slow', {
			mount: () => firstPending,
			update: vi.fn(),
			destroy: vi.fn(),
		});
		register(registry, 'test.fast', {
			mount: secondMount,
			update: vi.fn(),
			destroy: vi.fn(),
		});

		const mounting = new WidgetRuntime(registry).mountPage(createHost(), 'home', [
			layout('test.slow'),
			layout('test.fast'),
		]);
		await Promise.resolve();

		expect(secondMount).toHaveBeenCalledOnce();
		releaseFirst?.();
		await mounting;
	});

	it('suppresses stale state after a page mount is aborted', async () => {
		const registry = new WidgetRegistry();
		let release: (() => void) | undefined;
		const pending = new Promise<void>((resolve) => {
			release = resolve;
		});
		register(registry, 'test.stale', {
			mount: async (context) => {
				await pending;
				context.setState({ status: 'empty', message: 'Stale result' });
			},
			update: vi.fn(),
			destroy: vi.fn(),
		});
		const host = createHost();
		const controller = new AbortController();
		const mounting = new WidgetRuntime(registry).mountPage(
			host,
			'home',
			[layout('test.stale')],
			{ signal: controller.signal },
		);
		await Promise.resolve();
		controller.abort();
		release?.();
		await mounting;

		expect(host.slots[0]?.states).toEqual([{ status: 'loading' }]);
	});

	it('isolates a failing widget from its siblings', async () => {
		const registry = new WidgetRegistry();
		const siblingMount = vi.fn();
		register(registry, 'test.failing', {
			mount: () => {
				throw new Error('deliberate failure');
			},
			update: vi.fn(),
			destroy: vi.fn(),
		});
		register(registry, 'test.sibling', {
			mount: siblingMount,
			update: vi.fn(),
			destroy: vi.fn(),
		});
		const host = createHost();

		await new WidgetRuntime(registry).mountPage(host, 'home', [
			layout('test.failing'),
			layout('test.sibling'),
		]);

		expect(host.slots[0]?.states.at(-1)).toEqual(
			expect.objectContaining({ status: 'error', code: 'widget_mount_failed' }),
		);
		expect(siblingMount).toHaveBeenCalledOnce();
		expect(host.slots[1]?.states[0]).toEqual({ status: 'loading' });
	});

	it('isolates factory failures before mount and continues the page', async () => {
		const registry = new WidgetRegistry();
		registry.register({
			definition: definition('test.factory-failure'),
			create: () => {
				throw new Error('factory failure');
			},
		});
		const siblingMount = vi.fn();
		register(registry, 'test.after-factory', {
			mount: siblingMount,
			update: vi.fn(),
			destroy: vi.fn(),
		});
		const host = createHost();

		await new WidgetRuntime(registry).mountPage(host, 'home', [
			layout('test.factory-failure'),
			layout('test.after-factory'),
		]);

		expect(host.slots[0]?.states.at(-1)).toEqual(
			expect.objectContaining({ status: 'error', code: 'widget_create_failed' }),
		);
		expect(siblingMount).toHaveBeenCalledOnce();
	});

	it('passes state control and DOM ownership to a mounted widget', async () => {
		const registry = new WidgetRegistry();
		register(registry, 'test.empty', {
			mount: (context) => context.setState({ status: 'empty', message: 'None' }),
			update: vi.fn(),
			destroy: vi.fn(),
		});
		const host = createHost();

		await new WidgetRuntime(registry).mountPage(host, 'home', [
			layout('test.empty'),
		]);

		expect(host.slots[0]?.states).toEqual([
			{ status: 'loading' },
			{ status: 'empty', message: 'None' },
		]);
	});

	it('renders unknown layout widgets as unavailable without constructing them', async () => {
		const host = createHost();
		const session = await new WidgetRuntime(new WidgetRegistry()).mountPage(
			host,
			'home',
			[layout('missing.widget')],
		);

		expect(host.slots[0]?.states.at(-1)).toEqual(
			expect.objectContaining({ status: 'unavailable' }),
		);
		expect(await session.update('missing.widget')).toBe(false);
	});

	it('isolates update failures and reports them on the affected slot', async () => {
		const registry = new WidgetRegistry();
		register(registry, 'test.updater', {
			mount: vi.fn(),
			update: () => {
				throw new Error('update failure');
			},
			destroy: vi.fn(),
		});
		const host = createHost();
		const session = await new WidgetRuntime(registry).mountPage(host, 'home', [
			layout('test.updater'),
		]);

		expect(await session.update('test.updater')).toBe(false);
		expect(host.slots[0]?.states.at(-1)).toEqual(
			expect.objectContaining({ status: 'error', code: 'widget_update_failed' }),
		);
	});

	it('destroys every widget and releases slot and page ownership once', async () => {
		const registry = new WidgetRegistry();
		const firstDestroy = vi.fn(() => {
			throw new Error('cleanup failure');
		});
		const siblingDestroy = vi.fn();
		register(registry, 'test.first', {
			mount: vi.fn(),
			update: vi.fn(),
			destroy: firstDestroy,
		});
		register(registry, 'test.second', {
			mount: vi.fn(),
			update: vi.fn(),
			destroy: siblingDestroy,
		});
		const host = createHost();
		const session = await new WidgetRuntime(registry).mountPage(host, 'home', [
			layout('test.first'),
			layout('test.second'),
		]);

		await session.destroy();
		await session.destroy();

		expect(firstDestroy).toHaveBeenCalledOnce();
		expect(siblingDestroy).toHaveBeenCalledOnce();
		expect(host.slots.every(({ removed }) => removed.mock.calls.length === 1)).toBe(
			true,
		);
		expect(host.clearMock).toHaveBeenCalledOnce();
		expect(await session.update('test.second')).toBe(false);
	});
});
