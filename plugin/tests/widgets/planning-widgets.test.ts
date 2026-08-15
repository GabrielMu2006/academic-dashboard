import { describe, expect, it, vi } from 'vitest';
import {
	adapterAvailable,
	adapterFallback,
} from '../../src/core/data-adapter';
import { WidgetRegistry } from '../../src/core/widget-registry';
import type { WidgetMountContext, WidgetState } from '../../src/core/widgets';
import {
	CalendarWidget,
	TodayTasksWidget,
	registerPlanningWidgets,
	type PlanningWidgetServices,
} from '../../src/widgets/planning-widgets';

class FakeElement {
	className = '';
	textContent = '';
	type = '';
	title = '';
	disabled = false;
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

	toggleAttribute(name: string, enabled: boolean): void {
		if (enabled) this.attributes.set(name, '');
		else this.attributes.delete(name);
	}

	addEventListener(
		type: string,
		listener: () => void,
		options?: AddEventListenerOptions,
	): void {
		this.listeners.set(type, listener);
		options?.signal?.addEventListener('abort', () => this.listeners.delete(type));
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

function context(widgetId: 'home.calendar' | 'home.today-tasks') {
	const document = new FakeDocument();
	const content = new FakeElement('div', document);
	const states: WidgetState[] = [];
	return {
		content,
		states,
		value: {
			widgetId,
			pageId: 'home',
			size: 'medium',
			contentEl: content as unknown as HTMLElement,
			setState: (state: WidgetState) => states.push(state),
		} satisfies WidgetMountContext,
	};
}

function services(
	overrides: Partial<PlanningWidgetServices> = {},
): PlanningWidgetServices {
	return {
		now: () => new Date(2026, 7, 11, 9),
		calendar: {
			id: 'native-vault.calendar',
			availability: async () => adapterAvailable('native-vault'),
			query: async () => ({
				year: 2026,
				month: 8,
				startsOn: 6,
				days: [
					{ date: '2026-08-11', day: 11, notePaths: ['Daily/2026-08-11.md'] },
				],
			}),
		},
		todayTasks: {
			id: 'optional-tasks.today-tasks',
			availability: async () =>
				adapterFallback(
					'optional-plugin',
					'Tasks missing.',
					'native-vault.today-tasks',
				),
			query: async () => [
				{ path: 'Daily/2026-08-11.md', line: 3, text: 'Read chapter' },
			],
		},
		openNote: vi.fn(async () => undefined),
		reviewTaskToggle: vi.fn(async () => ({ outcome: 'cancelled' as const })),
		undoTaskToggle: vi.fn(async () => undefined),
		getTaskUndos: () => [],
		createDailyNote: vi.fn(async () => 'cancelled' as const),
		createAcademicNote: vi.fn(async () => undefined),
		...overrides,
	};
}

describe('planning Widgets', () => {
	it('renders the current calendar and opens only an existing daily note', async () => {
		const openNote = vi.fn(async () => undefined);
		const mounted = context('home.calendar');
		await new CalendarWidget(services({ openNote })).mount(mounted.value);

		expect(mounted.states.at(-1)).toEqual({ status: 'ready' });
		const grid = mounted.content.children[1];
		const dayButton = grid?.children.at(-1);
		expect(dayButton?.attributes.has('data-today')).toBe(true);
		dayButton?.click();
		expect(openNote).toHaveBeenCalledWith('Daily/2026-08-11.md');
	});

	it('renders Native fallback tasks and their source location', async () => {
		const mounted = context('home.today-tasks');
		await new TodayTasksWidget(services()).mount(mounted.value);

		expect(mounted.states.at(-1)).toEqual({ status: 'ready' });
		expect(mounted.content.children[0]?.textContent).toBe(
			'Native Markdown fallback',
		);
		const task = mounted.content.children[1]?.children[0];
		expect(task?.children[1]?.children[0]?.textContent).toBe('Read chapter');
		expect(task?.children[1]?.children[1]?.textContent).toBe('2026-08-11.md:3');
	});

	it('reviews one Native Markdown task and exposes session Undo', async () => {
		const reviewTaskToggle = vi.fn(async () => ({
			outcome: 'committed' as const,
			undoToken: 'session-1',
			path: 'Daily/2026-08-11.md',
		}));
		const undoTaskToggle = vi.fn(async () => undefined);
		let undos: readonly { readonly token: string; readonly path: string }[] = [];
		reviewTaskToggle.mockImplementation(async () => {
			undos = [{ token: 'session-1', path: 'Daily/2026-08-11.md' }];
			return {
				outcome: 'committed' as const,
				undoToken: 'session-1',
				path: 'Daily/2026-08-11.md',
			};
		});
		undoTaskToggle.mockImplementation(async () => {
			undos = [];
		});
		const mounted = context('home.today-tasks');
		await new TodayTasksWidget(
			services({ reviewTaskToggle, undoTaskToggle, getTaskUndos: () => undos }),
		).mount(mounted.value);

		mounted.content.children[1]?.children[0]?.children[0]?.click();
		await vi.waitFor(() => expect(reviewTaskToggle).toHaveBeenCalledWith({
			path: 'Daily/2026-08-11.md',
			line: 3,
			text: 'Read chapter',
		}));
		await vi.waitFor(() => {
			expect(mounted.content.children[0]?.className).toBe('academic-dashboard-task-undo');
		});
		mounted.content.children[0]?.children[1]?.click();
		await vi.waitFor(() => expect(undoTaskToggle).toHaveBeenCalledWith('session-1'));
	});

	it('disables task mutation for optional-plugin results', async () => {
		const reviewTaskToggle = vi.fn(async () => ({ outcome: 'cancelled' as const }));
		const mounted = context('home.today-tasks');
		await new TodayTasksWidget(services({
			reviewTaskToggle,
			todayTasks: {
				...services().todayTasks,
				availability: async () => adapterAvailable('optional-plugin'),
			},
		})).mount(mounted.value);

		const toggle = mounted.content.children[1]?.children[0]?.children[0];
		expect(toggle?.disabled).toBe(true);
		toggle?.click();
		expect(reviewTaskToggle).not.toHaveBeenCalled();
	});

	it('reviews a missing Daily Note and exposes course and paper entry points', async () => {
		const createDailyNote = vi.fn(async () => 'cancelled' as const);
		const createAcademicNote = vi.fn(async () => undefined);
		const mounted = context('home.calendar');
		await new CalendarWidget(services({
			createDailyNote,
			createAcademicNote,
			calendar: {
				...services().calendar,
				query: async () => ({
					year: 2026,
					month: 8,
					startsOn: 0,
					days: [{ date: '2026-08-12', day: 12, notePaths: [] }],
				}),
			},
		})).mount(mounted.value);

		mounted.content.children[1]?.children.at(-1)?.click();
		await vi.waitFor(() => expect(createDailyNote).toHaveBeenCalledWith('2026-08-12'));
		const actions = mounted.content.children[0]?.children[1];
		actions?.children[0]?.click();
		actions?.children[1]?.click();
		expect(createAcademicNote).toHaveBeenNthCalledWith(1, 'course-note');
		expect(createAcademicNote).toHaveBeenNthCalledWith(2, 'paper-reading');
	});

	it('reports an explicit empty Native fallback state', async () => {
		const mounted = context('home.today-tasks');
		await new TodayTasksWidget(
			services({
				todayTasks: {
					...services().todayTasks,
					query: async () => [],
				},
			}),
		).mount(mounted.value);

		expect(mounted.states.at(-1)).toEqual({
			status: 'empty',
			message: 'No Native Markdown tasks are due today.',
		});
	});

	it('does not render stale calendar data after destruction', async () => {
		let release: ((value: {
			year: number;
			month: number;
			startsOn: number;
			days: never[];
		}) => void) | undefined;
		const pending = new Promise<{
			year: number;
			month: number;
			startsOn: number;
			days: never[];
		}>((resolve) => {
			release = resolve;
		});
		const mounted = context('home.calendar');
		const widget = new CalendarWidget(
			services({ calendar: { ...services().calendar, query: async () => pending } }),
		);
		const mount = widget.mount(mounted.value);
		await Promise.resolve();
		widget.destroy();
		release?.({ year: 2026, month: 8, startsOn: 6, days: [] });
		await mount;

		expect(mounted.content.children).toEqual([]);
		expect(mounted.states.at(-1)).toEqual({ status: 'loading' });
	});

	it('registers the pre-allocated Home planning Widget IDs', () => {
		const registry = new WidgetRegistry();
		registerPlanningWidgets(registry, services());
		expect(registry.definitions().map(({ id }) => id)).toEqual([
			'home.calendar',
			'home.today-tasks',
		]);
	});
});
