import { describe, expect, it, vi } from 'vitest';
import { adapterAvailable, adapterUnavailable } from '../../src/core/data-adapter';
import { WidgetRegistry } from '../../src/core/widget-registry';
import type { WidgetMountContext, WidgetState } from '../../src/core/widgets';
import {
	RecentNotesWidget,
	RecentPapersWidget,
	registerAcademicWidgets,
	type AcademicWidgetServices,
} from '../../src/widgets/academic-widgets';

class FakeElement {
	className = '';
	textContent = '';
	type = '';
	title = '';
	disabled = false;
	value = '';
	placeholder = '';
	readonly children: FakeElement[] = [];
	readonly listeners = new Map<string, () => void>();
	readonly attributes = new Map<string, string>();

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

	addEventListener(
		type: string,
		listener: () => void,
		options?: AddEventListenerOptions,
	): void {
		this.listeners.set(type, listener);
		options?.signal?.addEventListener('abort', () => this.listeners.delete(type));
	}

	setAttribute(name: string, value: string): void {
		this.attributes.set(name, value);
	}

	click(): void {
		if (!this.disabled) this.listeners.get('click')?.();
	}

	change(): void {
		this.listeners.get('change')?.();
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

function context(pageId: 'home' | 'research' = 'home') {
	const document = new FakeDocument();
	const content = new FakeElement('div', document);
	const states: WidgetState[] = [];
	return {
		content,
		states,
		value: {
			widgetId: pageId === 'home' ? 'home.recent-notes' : 'research.recent-papers',
			pageId,
			size: pageId === 'home' ? 'medium' : 'large',
			contentEl: content as unknown as HTMLElement,
			setState: (state: WidgetState) => states.push(state),
		} satisfies WidgetMountContext,
	};
}

function services(
	overrides: Partial<AcademicWidgetServices> = {},
): AcademicWidgetServices {
	return {
		recentNotes: {
			id: 'native-vault.recent-notes',
			availability: async () => adapterAvailable('native-vault'),
			query: async () => [
				{
					path: 'Notes/latest.md',
					basename: 'latest',
					title: 'Latest note',
					modifiedAt: new Date('2026-08-11').getTime(),
				},
			],
		},
		recentPapers: {
			id: 'native-vault.recent-papers',
			availability: async () => adapterAvailable('native-vault'),
			query: async () => [
				{
					path: 'Papers/example.md',
					basename: 'example',
					title: 'Example paper',
					modifiedAt: 1,
					authors: ['Ada'],
					year: 2026,
					status: 'reading',
					tags: [],
					relations: [],
					actions: {
						identity: { field: 'type', value: 'paper' },
						status: { state: 'available', field: 'status', current: 'reading' },
						favorite: {
							state: 'available', field: 'favorite', current: false, present: false,
						},
					},
				},
			],
		},
		openNote: vi.fn(async () => undefined),
		...overrides,
	};
}

function descendants(root: FakeElement): FakeElement[] {
	return root.children.flatMap((child) => [child, ...descendants(child)]);
}

describe('academic Widgets', () => {
	it('renders recent notes and opens only the selected Vault path', async () => {
		const openNote = vi.fn(async () => undefined);
		const mounted = context();
		await new RecentNotesWidget(services({ openNote })).mount(mounted.value);

		expect(mounted.states.at(-1)).toEqual({ status: 'ready' });
		const button = mounted.content.children[0]?.children[0];
		expect(button?.children[0]?.textContent).toBe('Latest note');
		button?.click();
		expect(openNote).toHaveBeenCalledWith('Notes/latest.md');
	});

	it('renders mapped paper metadata without note body content', async () => {
		const mounted = context('research');
		await new RecentPapersWidget(services()).mount(mounted.value);

		const button = descendants(mounted.content).find(({ className }) => className === 'academic-dashboard-note academic-dashboard-paper');
		expect(button?.children[0]?.textContent).toBe('Example paper');
		expect(button?.children[1]?.textContent).toBe('Ada · 2026');
		expect(button?.children[2]?.textContent).toBe('reading');
		const actions = descendants(mounted.content).find(({ className }) => className === 'academic-dashboard-paper-actions');
		expect(actions?.children[0]?.attributes.get('aria-label')).toBe(
			'Set reading status for Example paper',
		);
		expect(actions?.children[0]?.children[1]?.disabled).toBe(true);
		expect(actions?.children[0]?.children[1]?.attributes.get('aria-pressed')).toBe('true');
		expect(actions?.children[1]?.attributes.get('aria-label')).toBe(
			'Add Example paper to favorites',
		);
		expect(actions?.children[1]?.attributes.get('aria-pressed')).toBe('false');
	});

	it('renders malformed and mapped-field mismatch paper actions as read-only', async () => {
		const mounted = context('research');
		await new RecentPapersWidget(services({
			recentPapers: {
				...services().recentPapers,
				query: async () => [{
					path: 'Papers/unsafe.md',
					basename: 'unsafe',
					title: 'Unsafe paper',
					modifiedAt: 1,
					authors: [],
					tags: [],
					relations: [],
					actions: {
						identity: { field: 'type', value: 'paper' },
						status: {
							state: 'unavailable',
							field: 'progress',
							reason: 'Reading uses “status”, but writes are mapped to “progress”.',
						},
						favorite: {
							state: 'unavailable',
							field: 'favorite',
							current: false,
							present: true,
							reason: '“favorite” must be a YAML Boolean true or false.',
						},
					},
				}],
			},
		})).mount(mounted.value);

		const actions = descendants(mounted.content).find(({ className }) => className === 'academic-dashboard-paper-actions');
		expect(actions?.children[0]?.children.every((control) => control.disabled)).toBe(true);
		expect(actions?.children[1]?.disabled).toBe(true);
		expect(actions?.children[2]?.textContent).toContain('progress');
	});

	it('commits a status click immediately, refreshes, and exposes conditional Undo', async () => {
		let undos: readonly {
			readonly token: string;
			readonly path: string;
			readonly field: string;
			readonly label: string;
		}[] = [];
		const setPaperStatus = vi.fn(async () => {
			undos = [{
				token: 'session-paper-1',
				path: 'Papers/example.md',
				field: 'status',
				label: 'Reading status',
			}];
			return {
				outcome: 'committed' as const,
				undoToken: 'session-paper-1',
				path: 'Papers/example.md',
				field: 'status',
			};
		});
		const undoPaperAction = vi.fn(async () => { undos = []; });
		const mounted = context('research');
		await new RecentPapersWidget(services({
			setPaperStatus,
			setPaperFavorite: vi.fn(async () => ({
				outcome: 'committed' as const,
				undoToken: 'unused',
				path: 'Papers/example.md',
				field: 'favorite',
			})),
			undoPaperAction,
			getPaperUndos: () => undos,
		})).mount(mounted.value);

		const reviewed = descendants(mounted.content).find(({ className }) => className === 'academic-dashboard-paper-actions__status')?.children[2];
		reviewed?.click();
		await vi.waitFor(() => expect(setPaperStatus).toHaveBeenCalledWith(
			expect.objectContaining({ path: 'Papers/example.md' }),
			'reviewed',
		));
		await vi.waitFor(() => expect(descendants(mounted.content).some(({ className }) => className === 'academic-dashboard-task-undo')).toBe(true));
		descendants(mounted.content).find(({ className }) => className === 'academic-dashboard-task-undo')?.children[1]?.click();
		await vi.waitFor(() => expect(undoPaperAction).toHaveBeenCalledWith('session-paper-1'));
	});

	it('serializes same-paper clicks and contains completion after destroy', async () => {
		let resolveCommit: (() => void) | undefined;
		const setPaperStatus = vi.fn(() => new Promise<{
			outcome: 'committed';
			undoToken: string;
			path: string;
			field: string;
		}>((resolve) => {
			resolveCommit = () => resolve({
				outcome: 'committed',
				undoToken: 'session-paper-race',
				path: 'Papers/example.md',
				field: 'status',
			});
		}));
		const mounted = context('research');
		const widget = new RecentPapersWidget(services({ setPaperStatus }));
		await widget.mount(mounted.value);
		const statusControls = descendants(mounted.content).find(({ className }) => className === 'academic-dashboard-paper-actions__status');
		statusControls?.children[0]?.click();
		statusControls?.children[2]?.click();
		expect(setPaperStatus).toHaveBeenCalledTimes(1);

		const stateCount = mounted.states.length;
		widget.destroy();
		resolveCommit?.();
		await Promise.resolve();
		await Promise.resolve();
		expect(mounted.states).toHaveLength(stateCount);
	});

	it('passes research filters through the project-owned query contract', async () => {
		const query = vi.fn(async () => services().recentPapers.query({ limit: 50 }));
		const mounted = context('research');
		await new RecentPapersWidget(
			services({ recentPapers: { ...services().recentPapers, query } }),
		).mount(mounted.value);
		const status = mounted.content.children[0]?.children[1];
		if (status) {
			status.value = 'reviewed';
			status.change();
		}
		await vi.waitFor(() => {
			expect(query).toHaveBeenLastCalledWith(
				expect.objectContaining({ status: 'reviewed', limit: 100 }),
			);
		});
	});

	it('saves a reproducible pinned research view in plugin settings', async () => {
		const setSavedResearchViews = vi.fn(() => true);
		const mounted = context('research');
		await new RecentPapersWidget(services({ getSavedResearchViews: () => [], setSavedResearchViews })).mount(mounted.value);
		const name = descendants(mounted.content).find(({ placeholder }) => placeholder === 'Saved view name');
		if (name) name.value = 'My reading';
		descendants(mounted.content).find(({ textContent }) => textContent === 'Save pinned view')?.click();
		expect(setSavedResearchViews).toHaveBeenCalledWith([
			expect.objectContaining({ name: 'My reading', search: '', status: 'all', tags: [], pinned: true }),
		]);
	});

	it('reapplies a saved query with the same structured filters', async () => {
		const query = vi.fn(async () => services().recentPapers.query({ limit: 1 }));
		const mounted = context('research');
		await new RecentPapersWidget(services({
			recentPapers: { ...services().recentPapers, query },
			getSavedResearchViews: () => [{ id: 'view-ml', name: 'ML view', search: 'graph', status: 'reading', tags: ['ml'], year: 2026, pinned: true }],
		})).mount(mounted.value);
		descendants(mounted.content).find(({ textContent }) => textContent === 'ML view')?.click();
		await vi.waitFor(() => expect(query).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'graph', status: 'reading', tags: ['ml'], year: 2026 })));
	});

	it('paginates visible results and opens explainable related material', async () => {
		const openNote = vi.fn(async () => undefined);
		const papers = Array.from({ length: 15 }, (_, index) => ({
			path: `Papers/${index}.md`, basename: `${index}`, title: `Paper ${index}`, modifiedAt: index,
			authors: [], tags: ['ml'], relations: index === 0 ? [{ path: 'Papers/related.md', title: 'Related', basis: 'shared-tag' as const, detail: 'ml' }] : [],
			actions: { identity: { field: 'type', value: 'paper' }, status: { state: 'unavailable' as const, field: 'status' }, favorite: { state: 'unavailable' as const, field: 'favorite', current: false, present: false } },
		}));
		const mounted = context('research');
		await new RecentPapersWidget(services({ recentPapers: { ...services().recentPapers, query: async () => papers }, openNote })).mount(mounted.value);
		expect(descendants(mounted.content).some(({ textContent }) => textContent === 'Showing 1–10 of 15 visible papers')).toBe(true);
		descendants(mounted.content).find(({ textContent }) => textContent === 'Related')?.click();
		expect(openNote).toHaveBeenCalledWith('Papers/related.md');
		descendants(mounted.content).find(({ textContent }) => textContent === 'Next')?.click();
		await vi.waitFor(() => expect(descendants(mounted.content).some(({ textContent }) => textContent === 'Showing 11–15 of 15 visible papers')).toBe(true));
	});

	it('shows empty and unavailable states explicitly', async () => {
		const empty = context();
		await new RecentNotesWidget(
			services({
				recentNotes: {
					id: 'native-vault.recent-notes',
					availability: async () => adapterAvailable('native-vault'),
					query: async () => [],
				},
			}),
		).mount(empty.value);
		expect(empty.states.at(-1)?.status).toBe('empty');

		const unavailable = context();
		await new RecentNotesWidget(
			services({
				recentNotes: {
					id: 'native-vault.recent-notes',
					availability: async () =>
						adapterUnavailable('native-vault', 'Vault index unavailable.'),
					query: async () => [],
				},
			}),
		).mount(unavailable.value);
		expect(unavailable.states.at(-1)).toEqual({
			status: 'unavailable',
			reason: 'Vault index unavailable.',
		});
	});

	it('releases note-button event ownership when destroyed', async () => {
		const openNote = vi.fn(async () => undefined);
		const mounted = context();
		const widget = new RecentNotesWidget(services({ openNote }));
		await widget.mount(mounted.value);
		const button = mounted.content.children[0]?.children[0];

		widget.destroy();
		button?.click();
		expect(openNote).not.toHaveBeenCalled();
	});

	it('registers stable Home and Research Widget IDs', () => {
		const registry = new WidgetRegistry();
		registerAcademicWidgets(registry, services());
		expect(registry.definitions().map(({ id }) => id)).toEqual([
			'home.recent-notes',
			'research.recent-papers',
		]);
	});
});
