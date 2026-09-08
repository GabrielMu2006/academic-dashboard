import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOCAL_WIDGET_SETTINGS } from '../../src/core/local-widget-settings';
import type { WidgetMountContext, WidgetState } from '../../src/core/widgets';
import {
	CommandLauncherWidget,
	CourseFoldersWidget,
	createLocalWidgetRegistry,
	DateTimeWidget,
	LocalQuoteWidget,
	MAX_QUOTE_FILE_ENTRIES,
	parseQuoteFile,
	QuickLinksWidget,
	type LocalWidgetServices,
} from '../../src/widgets/local-widgets';

class FakeElement {
	className = '';
	textContent = '';
	type = '';
	title = '';
	disabled = false;
	readonly children: FakeElement[] = [];
	readonly attributes = new Map<string, string>();
	readonly listeners = new Map<string, () => void>();
	readonly ownerDocument: FakeDocument;

	constructor(readonly tagName: string, document: FakeDocument) {
		this.ownerDocument = document;
	}

	append(...children: FakeElement[]): void {
		this.children.push(...children);
	}

	replaceChildren(...children: FakeElement[]): void {
		this.children.length = 0;
		this.children.push(...children);
	}

	toggleAttribute(name: string, enabled: boolean): void {
		if (enabled) this.attributes.set(name, '');
		else this.attributes.delete(name);
	}

	setAttribute(name: string, value: string): void {
		this.attributes.set(name, value);
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

	createEl(
		tagName: string,
		options?: { readonly cls?: string; readonly text?: string },
	): FakeElement {
		const result = this.createElement(tagName);
		result.className = options?.cls ?? '';
		result.textContent = options?.text ?? '';
		return result;
	}

	createDiv(): FakeElement {
		return this.createElement('div');
	}
}

function context() {
	const document = new FakeDocument();
	const content = new FakeElement('div', document);
	const states: WidgetState[] = [];
	return {
		content,
		states,
		value: {
			widgetId: 'home.test',
			pageId: 'home',
			size: 'small',
			contentEl: content as unknown as HTMLElement,
			setState: (state: WidgetState) => states.push(state),
		} satisfies WidgetMountContext,
	};
}

function services(
	overrides: Partial<LocalWidgetServices> = {},
): LocalWidgetServices {
	return {
		now: () => new Date('2026-08-11T08:30:00Z'),
		scheduler: { set: vi.fn(() => 7), clear: vi.fn() },
		getSettings: () => DEFAULT_LOCAL_WIDGET_SETTINGS,
		getCourseFolderRoot: () => 'Course',
		resolveQuickLink: () => null,
		listChildFolders: () => Object.freeze([]),
		subscribeToFolderChanges: () => () => undefined,
		openQuickLink: vi.fn(async () => undefined),
		hasCommand: () => true,
		executeCommand: vi.fn(async () => undefined),
		readQuoteFile: vi.fn(async () => null),
		...overrides,
	};
}

describe('local Widgets', () => {
	it('renders date/time and releases its interval', () => {
		const clearInterval = vi.fn();
		const widgetServices = services({
			scheduler: { set: vi.fn(() => 7), clear: clearInterval },
		});
		const mounted = context();
		const widget = new DateTimeWidget(widgetServices);

		widget.mount(mounted.value);
		expect(mounted.states.at(-1)).toEqual({ status: 'ready' });
		expect(mounted.content.children).toHaveLength(2);
		widget.destroy();
		expect(clearInterval).toHaveBeenCalledWith(7);
	});

	it('shows an empty quick-link state without configuration', () => {
		const mounted = context();
		new QuickLinksWidget(services()).mount(mounted.value);
		expect(mounted.states.at(-1)).toEqual(
			expect.objectContaining({ status: 'empty' }),
		);
	});

	it('marks missing quick links unavailable and opens existing targets', () => {
		const open = vi.fn(async () => undefined);
		const configured = {
			...DEFAULT_LOCAL_WIDGET_SETTINGS,
			quickLinks: [
				{ label: 'Missing', path: 'Missing.md' },
				{ label: 'Course', path: 'Course' },
			],
		};
		const mounted = context();
		new QuickLinksWidget(
			services({
				getSettings: () => configured,
				resolveQuickLink: (path) =>
					path === 'Course' ? { kind: 'folder', path } : null,
				openQuickLink: open,
			}),
		).mount(mounted.value);

		expect(mounted.states.at(-1)).toEqual({ status: 'ready' });
		const buttons = mounted.content.children[0]?.children ?? [];
		expect(buttons[0]?.disabled).toBe(true);
		buttons[1]?.click();
		expect(open).toHaveBeenCalledWith({ kind: 'folder', path: 'Course' });
	});

	it('removes quick-link event ownership when destroyed', () => {
		const open = vi.fn(async () => undefined);
		const configured = {
			...DEFAULT_LOCAL_WIDGET_SETTINGS,
			quickLinks: [{ label: 'Course', path: 'Course' }],
		};
		const mounted = context();
		const widget = new QuickLinksWidget(
			services({
				getSettings: () => configured,
				resolveQuickLink: (path) => ({ kind: 'folder', path }),
				openQuickLink: open,
			}),
		);
		widget.mount(mounted.value);
		const button = mounted.content.children[0]?.children[0];

		widget.destroy();
		button?.click();
		expect(open).not.toHaveBeenCalled();
	});

	it('renders one Study button per course folder and refreshes on folder changes', () => {
		const open = vi.fn(async () => undefined);
		const unsubscribe = vi.fn();
		let notify: () => void = () => undefined;
		let folders = [{ name: 'ICS', path: 'Course/ICS' }];
		const mounted = context();
		const widget = new CourseFoldersWidget(
			services({
				resolveQuickLink: (path) => ({ kind: 'folder', path }),
				listChildFolders: () => folders,
				subscribeToFolderChanges: (callback) => {
					notify = callback;
					return unsubscribe;
				},
				openQuickLink: open,
			}),
		);

		widget.mount(mounted.value);
		expect(mounted.content.children[0]?.textContent).toContain('1');
		mounted.content.children[1]?.children[0]?.click();
		expect(open).toHaveBeenCalledWith({ kind: 'folder', path: 'Course/ICS' });

		folders = [
			{ name: 'ICS', path: 'Course/ICS' },
			{ name: 'VCL', path: 'Course/VCL' },
		];
		notify();
		expect(mounted.content.children[1]?.children).toHaveLength(2);

		widget.destroy();
		expect(unsubscribe).toHaveBeenCalledOnce();
	});

	it('shows an empty Study state when the course root has no child folders', () => {
		const mounted = context();
		new CourseFoldersWidget(
			services({
				resolveQuickLink: (path) => ({ kind: 'folder', path }),
			}),
		).mount(mounted.value);

		expect(mounted.states.at(-1)).toEqual(
			expect.objectContaining({ status: 'empty' }),
		);
	});

	it('renders bundled local quotes when the quote file is disabled and reports empty configuration', () => {
		const ready = context();
		new LocalQuoteWidget(services({
			getSettings: () => ({
				...DEFAULT_LOCAL_WIDGET_SETTINGS,
				quoteFilePath: '',
			}),
		})).mount(ready.value);
		expect(ready.states.at(-1)).toEqual({ status: 'ready' });
		expect(ready.content.children[0]?.tagName).toBe('blockquote');

		const empty = context();
		new LocalQuoteWidget(
			services({
				getSettings: () => ({
					...DEFAULT_LOCAL_WIDGET_SETTINGS,
					quotes: [],
					quoteFilePath: '',
				}),
			}),
		).mount(empty.value);
		expect(empty.states.at(-1)?.status).toBe('empty');
	});

	it('loads quote entries from the configured Markdown file', async () => {
		const mounted = context();
		new LocalQuoteWidget(services({
			getSettings: () => ({
				...DEFAULT_LOCAL_WIDGET_SETTINGS,
				quoteFilePath: 'Reading/Quotes.md',
			}),
			readQuoteFile: vi.fn(async () => '# Quotes\n\n- First\n> Second\n'),
		})).mount(mounted.value);
		await vi.waitFor(() => {
			expect(mounted.states.at(-1)).toEqual({ status: 'ready' });
		});
		expect(mounted.content.children[0]?.textContent).toBe('First');
	});

	it('parses headings, comments, and Markdown list markers safely', () => {
		expect(parseQuoteFile('# Quotes\n<!-- note -->\n- One\n2. Two\n> Three')).toEqual([
			'One',
			'Two',
			'Three',
		]);
	});

	it('supports a leap-year quote library without expanding other widget limits', () => {
		const content = Array.from(
			{ length: MAX_QUOTE_FILE_ENTRIES + 1 },
			(_, index) => `- Quote ${index + 1}`,
		).join('\n');
		const quotes = parseQuoteFile(content);

		expect(quotes).toHaveLength(MAX_QUOTE_FILE_ENTRIES);
		expect(quotes[0]).toBe('Quote 1');
		expect(quotes.at(-1)).toBe(`Quote ${MAX_QUOTE_FILE_ENTRIES}`);
	});

	it('launches available configured commands and disables missing ones', () => {
		const execute = vi.fn(async () => undefined);
		const mounted = context();
		new CommandLauncherWidget(
			services({
				hasCommand: (id) => id === 'command-palette:open',
				executeCommand: execute,
			}),
		).mount(mounted.value);

		const buttons = mounted.content.children[0]?.children ?? [];
		buttons[0]?.click();
		expect(execute).toHaveBeenCalledWith('command-palette:open');
		expect(buttons[1]?.disabled).toBe(true);
	});

	it('registers the built-in local Widgets with stable IDs', () => {
		const registry = createLocalWidgetRegistry(services());
		expect(registry.definitions().map(({ id }) => id)).toEqual([
			'home.date-time',
			'home.shortcuts',
			'home.commands',
			'home.quote',
			'study.course-folders',
		]);
	});
});
