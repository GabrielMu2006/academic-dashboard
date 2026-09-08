import { describe, expect, it, vi } from 'vitest';
import { adapterAvailable } from '../../src/core/data-adapter';
import { WidgetRegistry } from '../../src/core/widget-registry';
import type { WidgetMountContext, WidgetState } from '../../src/core/widgets';
import {
	CourseOverviewWidget,
	registerCourseOverviewWidget,
	type CourseOverviewWidgetServices,
} from '../../src/widgets/course-overview-widget';

class FakeElement {
	className = '';
	textContent = '';
	type = '';
	title = '';
	value = '';
	readonly children: FakeElement[] = [];
	readonly attributes = new Map<string, string>();
	readonly listeners = new Map<string, () => void>();

	constructor(readonly tagName: string, readonly ownerDocument: FakeDocument) {}

	append(...children: FakeElement[]): void { this.children.push(...children); }
	replaceChildren(...children: FakeElement[]): void {
		this.children.length = 0;
		this.children.push(...children);
	}
	setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
	addEventListener(type: string, listener: () => void, options?: AddEventListenerOptions): void {
		this.listeners.set(type, listener);
		options?.signal?.addEventListener('abort', () => this.listeners.delete(type));
	}
	click(): void { this.listeners.get('click')?.(); }
}

class FakeDocument {
	readonly win = this;
	createElement(tagName: string): FakeElement { return new FakeElement(tagName, this); }
	createEl(tagName: string): FakeElement { return this.createElement(tagName); }
}

function mountedContext() {
	const document = new FakeDocument();
	const content = new FakeElement('div', document);
	const states: WidgetState[] = [];
	return {
		content,
		states,
		context: {
			widgetId: 'study.course-overview',
			pageId: 'study',
			size: 'large',
			contentEl: content as unknown as HTMLElement,
			setState: (state: WidgetState) => states.push(state),
		} satisfies WidgetMountContext,
	};
}

function services(overrides: Partial<CourseOverviewWidgetServices> = {}): CourseOverviewWidgetServices {
	return {
		now: () => new Date(2026, 8, 8, 9),
		overview: {
			id: 'overview',
			availability: async () => adapterAvailable('native-vault'),
			query: vi.fn(async () => ({
				courses: [{
					id: '["math","fall"]', name: 'Math', term: 'Fall', basis: 'metadata' as const,
					notes: [{ path: 'Course/Math/Fall.md', kind: 'note' as const, basis: 'metadata' as const }],
					resources: [{ path: 'Course/Math/Slides.pdf', kind: 'file' as const, basis: 'course-root' as const }],
					tasks: [{ path: 'Course/Math/Fall.md', line: 8, text: 'Submit assignment' }],
					reviews: [{ path: 'Course/Math/Fall.md', title: 'Math review', kind: 'note' as const, dueCount: 1, totalCount: 2 }],
				}],
				unresolvedCount: 1,
				incomplete: false,
			})),
		},
		getRootFolder: () => 'Course',
		getCurrentTerm: () => 'Fall',
		openFile: vi.fn(async () => undefined),
		subscribeToVaultChanges: () => () => undefined,
		...overrides,
	};
}

function descendants(root: FakeElement): FakeElement[] {
	return root.children.flatMap((child) => [child, ...descendants(child)]);
}

async function flush(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

describe('CourseOverviewWidget', () => {
	it('renders an explainable course detail and opens resources without writing', async () => {
		const openFile = vi.fn(async () => undefined);
		const widget = new CourseOverviewWidget(services({ openFile }));
		const mounted = mountedContext();
		widget.mount(mounted.context);
		await flush();

		const nodes = descendants(mounted.content);
		expect(nodes.some(({ textContent }) => textContent.includes('1 courses · Fall'))).toBe(true);
		expect(nodes.some(({ textContent }) => textContent.includes('Matched by configured course metadata'))).toBe(true);
		expect(nodes.some(({ textContent }) => textContent.includes('1 notes · 1 resources · 1 due tasks · 1 due reviews'))).toBe(true);
		expect(nodes.filter(({ tagName }) => tagName === 'h4').map(({ textContent }) => textContent)).toEqual([
			'Course notes', 'Related resources', 'Due tasks', 'Due reviews',
		]);
		const slides = nodes.find(({ textContent }) => textContent === 'Slides.pdf');
		expect(slides).toBeDefined();
		slides?.click();
		await flush();
		expect(openFile).toHaveBeenCalledWith('Course/Math/Slides.pdf');
		expect(mounted.states.at(-1)).toEqual({ status: 'ready' });
	});

	it('refreshes on vault changes and unsubscribes when destroyed', async () => {
		let callback: (() => void) | undefined;
		const unsubscribe = vi.fn();
		const query = vi.fn(async () => ({ courses: [], unresolvedCount: 0, incomplete: false }));
		const widget = new CourseOverviewWidget(services({
			overview: { id: 'overview', availability: async () => adapterAvailable('native-vault'), query },
			subscribeToVaultChanges: (next) => { callback = next; return unsubscribe; },
		}));
		const mounted = mountedContext();
		widget.mount(mounted.context);
		await flush();
		callback?.();
		await flush();
		expect(query).toHaveBeenCalledTimes(2);
		widget.destroy();
		expect(unsubscribe).toHaveBeenCalledOnce();
	});

	it('shows explicit prompts for missing course material', async () => {
		const widget = new CourseOverviewWidget(services({
			overview: {
				id: 'overview', availability: async () => adapterAvailable('native-vault'),
				query: async () => ({
					courses: [{ id: '["math","fall"]', name: 'Math', term: 'Fall', basis: 'course-root', notes: [], resources: [], tasks: [], reviews: [] }],
					unresolvedCount: 0, incomplete: false,
				}),
			},
		}));
		const mounted = mountedContext();
		widget.mount(mounted.context);
		await flush();
		const messages = descendants(mounted.content).map(({ textContent }) => textContent);
		expect(messages).toEqual(expect.arrayContaining([
			'No course notes identified.',
			'No related resources identified.',
			'No due tasks identified.',
			'No due reviews identified.',
		]));
	});

	it('registers the stable Study course-overview ID', () => {
		const registry = new WidgetRegistry();
		registerCourseOverviewWidget(registry, services());
		expect(registry.get('study.course-overview')?.definition).toEqual(expect.objectContaining({
			allowedPages: ['study'], defaultSize: 'large',
		}));
	});
});
