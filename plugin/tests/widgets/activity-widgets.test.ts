import { describe, expect, it, vi } from 'vitest';
import { adapterAvailable, adapterUnavailable } from '../../src/core/data-adapter';
import { WidgetRegistry } from '../../src/core/widget-registry';
import type { WidgetMountContext, WidgetState } from '../../src/core/widgets';
import {
	registerActivityWidgets,
	type ActivityWidgetServices,
} from '../../src/widgets/activity-widgets';

class FakeElement {
	className = '';
	textContent = '';
	title = '';
	type = '';
	readonly children: FakeElement[] = [];
	readonly attributes = new Map<string, string>();
	readonly listeners = new Map<string, () => void>();

	constructor(
		readonly tagName: string,
		readonly ownerDocument: FakeDocument,
	) {}

	append(...children: FakeElement[]): void {
		this.children.push(...children);
	}

	replaceChildren(...children: FakeElement[]): void {
		this.children.length = 0;
		this.children.push(...children);
	}

	setAttribute(name: string, value: string): void {
		this.attributes.set(name, value);
	}

	addEventListener(type: string, listener: () => void): void {
		this.listeners.set(type, listener);
	}

	click(): void {
		this.listeners.get('click')?.();
	}
}

class FakeDocument {
	readonly win = this;

	createElement(tagName: string): FakeElement {
		return new FakeElement(tagName, this);
	}

	createEl(tagName: string): FakeElement {
		return this.createElement(tagName);
	}
}

function context(widgetId: 'study.activity' | 'study.contributions') {
	const document = new FakeDocument();
	const content = new FakeElement('div', document);
	const states: WidgetState[] = [];
	return {
		content,
		states,
		value: {
			widgetId,
			pageId: 'study',
			size: widgetId === 'study.activity' ? 'medium' : 'large',
			contentEl: content as unknown as HTMLElement,
			setState: (state: WidgetState) => states.push(state),
		} satisfies WidgetMountContext,
	};
}

function services(): ActivityWidgetServices {
	return {
		now: () => new Date(2026, 7, 11, 9),
		obsidian: {
			id: 'local.obsidian-activity',
			availability: async () => adapterAvailable('native-vault'),
			query: async () => ({
				source: 'obsidian',
				total: 2,
				days: [
					{ date: '2026-08-10', count: 0, intensity: 0 },
					{ date: '2026-08-11', count: 2, intensity: 4 },
				],
			}),
		},
		github: {
			id: 'local.github-activity',
			availability: async () =>
				adapterUnavailable(
					'local',
					'No local source.',
					'Remote fetching is disabled.',
				),
			query: async () => ({
				source: 'github', total: 0, days: [], cacheState: 'fresh',
				lastUpdated: '2026-08-11T00:00:00.000Z',
			}),
			refresh: async () => ({
				source: 'github', total: 0, days: [], cacheState: 'fresh',
				lastUpdated: '2026-08-11T00:00:00.000Z',
			}),
		},
	};
}

describe('activity Widgets', () => {
	it('renders a local Obsidian heatmap with non-color summary text', async () => {
		const registry = new WidgetRegistry();
		registerActivityWidgets(registry, services());
		const mounted = context('study.activity');
		await registry.get('study.activity')?.create().mount(mounted.value);

		expect(mounted.states.at(-1)).toEqual({ status: 'ready' });
		expect(mounted.content.children[0]?.textContent).toBe(
			'2 modified notes in this window',
		);
		expect(
			mounted.content.children[1]?.children[1]?.attributes.get('data-intensity'),
		).toBe('4');
		expect(mounted.content.children[2]?.attributes.get('aria-label')).toBe(
			'Activity intensity from fewer to more contributions',
		);
		expect(
			mounted.content.children[2]?.children.slice(1, 6).map((child) =>
				child.attributes.get('data-intensity')
			),
		).toEqual(['0', '1', '2', '3', '4']);
	});

	it('renders GitHub as explicitly unavailable without calling query', async () => {
		const widgetServices = services();
		const registry = new WidgetRegistry();
		registerActivityWidgets(registry, widgetServices);
		const mounted = context('study.contributions');
		await registry.get('study.contributions')?.create().mount(mounted.value);

		expect(mounted.states.at(-1)).toEqual({
			status: 'unavailable',
			reason: 'No local source.',
			recovery: 'Remote fetching is disabled.',
		});
		expect(mounted.content.children).toEqual([]);
	});

	it('shows stale last-good status, refreshes on open, and supports manual Refresh', async () => {
		const refresh = vi.fn(async () => ({
			source: 'github' as const,
			total: 4,
			days: [{ date: '2026-08-11', count: 4, intensity: 4 as const }],
			cacheState: 'fresh' as const,
			lastUpdated: '2026-08-11T09:00:00.000Z',
			privateContributionCount: 2,
		}));
		const widgetServices: ActivityWidgetServices = { ...services(), github: {
			id: 'github.viewer-contributions',
			availability: async () => adapterAvailable('remote'),
			query: async () => ({
				source: 'github', total: 3,
				days: [{ date: '2026-08-10', count: 3, intensity: 4 }],
				cacheState: 'stale', lastUpdated: '2026-08-10T00:00:00.000Z',
				errorCode: 'network-failed',
			}),
			refresh,
		} };
		const registry = new WidgetRegistry();
		registerActivityWidgets(registry, widgetServices);
		const mounted = context('study.contributions');
		await registry.get('study.contributions')?.create().mount(mounted.value);

		await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
		await vi.waitFor(() => expect(mounted.content.children[0]?.textContent).toBe(
			'4 public contributions in this window',
		));
		expect(mounted.content.children[3]?.children[0]?.textContent).toContain('Data is fresh.');
		expect(mounted.content.children[3]?.children[0]?.textContent).toContain('2 anonymous private contributions.');
		mounted.content.children[3]?.children[1]?.click();
		await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
	});

	it('registers stable Study Widget IDs', () => {
		const registry = new WidgetRegistry();
		registerActivityWidgets(registry, services());
		expect(registry.definitions().map(({ id }) => id)).toEqual([
			'study.activity',
			'study.contributions',
		]);
	});
});
