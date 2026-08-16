import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT_STATE } from '../../src/core/default-layouts';
import { DEFAULT_METADATA_SETTINGS } from '../../src/core/metadata-settings';
import { DEFAULT_TEMPLATE_SETTINGS } from '../../src/core/template-settings';
import { DEFAULT_AGENT_SETTINGS } from '../../src/core/agent-settings';
import { DEFAULT_LOCAL_WRITE_SETTINGS } from '../../src/core/local-write-settings';
import { DEFAULT_GITHUB_SETTINGS } from '../../src/core/github-settings';
import { DEFAULT_LOCALE_SETTINGS } from '../../src/core/localization';
import {
	SETTINGS_SCHEMA_VERSION,
	validateDashboardSettings,
} from '../../src/core/settings';
import {
	PageLayoutStore,
	restoreLayoutStoreData,
	type LayoutStoreDiagnostic,
} from '../../src/layout/page-layout-store';

function initialSettings() {
	const result = validateDashboardSettings({
		schemaVersion: SETTINGS_SCHEMA_VERSION,
		defaultPage: 'home',
		layouts: DEFAULT_LAYOUT_STATE,
		metadata: DEFAULT_METADATA_SETTINGS,
		templates: DEFAULT_TEMPLATE_SETTINGS,
		agent: DEFAULT_AGENT_SETTINGS,
		localWrites: DEFAULT_LOCAL_WRITE_SETTINGS,
		github: DEFAULT_GITHUB_SETTINGS,
		locale: DEFAULT_LOCALE_SETTINGS,
	});
	if (!result.ok) throw new Error('Invalid test settings.');
	return result.value;
}

function movedHome(x: number) {
	return DEFAULT_LAYOUT_STATE.pages.home.map((item, index) =>
		index === 0 ? { ...item, x } : item,
	);
}

describe('restoreLayoutStoreData', () => {
	it('loads the formal settings shape', () => {
		const input = initialSettings();
		const restored = restoreLayoutStoreData(input);

		expect(restored.source).toBe('stored');
		expect(restored.settings).toEqual(input);
	});

	it('upgrades exact Phase 5 default pages to content-safe Phase 6 geometry', () => {
		const settings = initialSettings();
		const restored = restoreLayoutStoreData({
			...settings,
			layouts: {
				schemaVersion: 1,
				pages: {
					home: [
						{ widgetId: 'home.date-time', pageId: 'home', x: 0, y: 0, size: 'small' },
						{ widgetId: 'home.calendar', pageId: 'home', x: 1, y: 0, size: 'medium' },
						{ widgetId: 'home.today-tasks', pageId: 'home', x: 0, y: 1, size: 'medium' },
						{ widgetId: 'home.recent-notes', pageId: 'home', x: 2, y: 1, size: 'medium' },
						{ widgetId: 'home.shortcuts', pageId: 'home', x: 0, y: 2, size: 'medium' },
						{ widgetId: 'home.quote', pageId: 'home', x: 2, y: 2, size: 'small' },
						{ widgetId: 'home.commands', pageId: 'home', x: 2, y: 3, size: 'medium' },
					],
					study: settings.layouts.pages.study,
					research: settings.layouts.pages.research,
					agent: settings.layouts.pages.agent,
				},
			},
		});

		expect(restored.source).toBe('migrated');
		expect(restored.settings.layouts.schemaVersion).toBe(3);
		expect(
			restored.settings.layouts.pages.home.find(
				({ widgetId }) => widgetId === 'home.calendar',
			)?.size,
		).toBe('large');
	});

	it('preserves custom version 1 page geometry during the schema migration', () => {
		const settings = initialSettings();
		const customHome = DEFAULT_LAYOUT_STATE.pages.home.map((layout) =>
			layout.widgetId === 'home.date-time' ? { ...layout, x: 3, y: 8 } : layout,
		);
		const restored = restoreLayoutStoreData({
			...settings,
			layouts: {
				schemaVersion: 1,
				pages: { ...settings.layouts.pages, home: customHome },
			},
		});

		expect(restored.source).toBe('migrated');
		expect(restored.settings.layouts.pages.home[0]).toEqual(
			expect.objectContaining({ x: 3, y: 8 }),
		);
	});

	it('repairs undersized custom Agent cards without resetting safe coordinates', () => {
		const settings = initialSettings();
		const restored = restoreLayoutStoreData({
			...settings,
			layouts: {
				schemaVersion: 1,
				pages: {
					...settings.layouts.pages,
					agent: [
						{ widgetId: 'agent.status', pageId: 'agent', x: 0, y: 0, size: 'small' },
						{ widgetId: 'agent.prompt', pageId: 'agent', x: 0, y: 3, size: 'large' },
						{ widgetId: 'agent.workflows', pageId: 'agent', x: 0, y: 1, size: 'medium' },
						{ widgetId: 'agent.claudian-entry', pageId: 'agent', x: 2, y: 0, size: 'small' },
					],
				},
			},
		});

		const byId = new Map(
			restored.settings.layouts.pages.agent.map((layout) => [layout.widgetId, layout]),
		);
		expect(byId.get('agent.status')).toEqual(
			expect.objectContaining({ x: 0, y: 0, size: 'medium' }),
		);
		expect(byId.get('agent.workflows')).toEqual(
			expect.objectContaining({ x: 0, y: 1, size: 'large' }),
		);
		expect(byId.get('agent.claudian-entry')).toEqual(
			expect.objectContaining({ x: 2, y: 0, size: 'medium' }),
		);
		expect(byId.get('agent.prompt')).toEqual(
			expect.objectContaining({ x: 0, y: 3, size: 'large' }),
		);
	});

	it('moves only colliding custom cards downward after a content-safe size repair', () => {
		const settings = initialSettings();
		const restored = restoreLayoutStoreData({
			...settings,
			layouts: {
				schemaVersion: 1,
				pages: {
					...settings.layouts.pages,
					agent: [
						{ widgetId: 'agent.status', pageId: 'agent', x: 0, y: 0, size: 'small' },
						{ widgetId: 'agent.claudian-entry', pageId: 'agent', x: 1, y: 0, size: 'small' },
					],
				},
			},
		});

		const [status, claudian] = restored.settings.layouts.pages.agent;
		expect(status).toEqual(
			expect.objectContaining({ x: 0, y: 0, size: 'medium' }),
		);
		expect(claudian).toEqual(
			expect.objectContaining({ x: 1, y: 1, size: 'medium' }),
		);
	});

	it('prefers formal settings when a stale spike field is also present', () => {
		const restored = restoreLayoutStoreData({
			...initialSettings(),
			gridstackSpikeLayout: {
				...DEFAULT_LAYOUT_STATE,
				pages: {
					...DEFAULT_LAYOUT_STATE.pages,
					home: movedHome(3),
				},
			},
		});

		expect(restored.source).toBe('stored');
		expect(restored.settings.layouts.pages.home[0]?.x).toBe(0);
	});

	it('migrates the GridStack spike field without discarding layouts', () => {
		const restored = restoreLayoutStoreData({
			gridstackSpikeLayout: {
				...DEFAULT_LAYOUT_STATE,
				pages: {
					...DEFAULT_LAYOUT_STATE.pages,
					home: movedHome(3),
				},
			},
		});

		expect(restored.source).toBe('migrated');
		expect(restored.settings.layouts.pages.home[0]?.x).toBe(3);
	});

	it('falls back to project defaults with content-free diagnostics', () => {
		const restored = restoreLayoutStoreData({
			schemaVersion: 1,
			defaultPage: 'home',
			layouts: { schemaVersion: 1, pages: 'private note text' },
		});

		expect(restored.source).toBe('fallback');
		expect(restored.settings.layouts).toEqual(DEFAULT_LAYOUT_STATE);
		expect(restored.issues.map(({ code }) => code)).toContain('invalid_pages');
		expect(JSON.stringify(restored.issues)).not.toContain('private note text');
	});
});

describe('PageLayoutStore', () => {
	it('updates one page independently and persists a frozen snapshot', async () => {
		const saves: unknown[] = [];
		const store = new PageLayoutStore({
			initial: initialSettings(),
			save: async (settings) => {
				saves.push(settings);
			},
		});
		const originalStudy = store.getPage('study');

		expect(store.updatePage('home', movedHome(2))).toBe(true);
		await store.flush();

		expect(store.getPage('home')[0]?.x).toBe(2);
		expect(store.getPage('study')).toEqual(originalStudy);
		expect(saves).toHaveLength(1);
		expect(Object.isFrozen(saves[0])).toBe(true);
	});

	it('serializes rapid changes so the newest layout is saved last', async () => {
		const releases: Array<() => void> = [];
		const savedX: number[] = [];
		const store = new PageLayoutStore({
			initial: initialSettings(),
			save: async (settings) => {
				savedX.push(settings.layouts.pages.home[0]?.x ?? -1);
				await new Promise<void>((resolve) => releases.push(resolve));
			},
		});

		store.updatePage('home', movedHome(1));
		store.updatePage('home', movedHome(2));
		store.updatePage('home', movedHome(3));
		expect(savedX).toEqual([1]);

		releases.shift()?.();
		await Promise.resolve();
		await Promise.resolve();
		expect(savedX).toEqual([1, 3]);
		releases.shift()?.();
		await store.flush();

		expect(savedX.at(-1)).toBe(3);
	});

	it('coalesces mixed settings and layout changes into the newest complete snapshot', async () => {
		const releases: Array<() => void> = [];
		const saves: ReturnType<PageLayoutStore['getSnapshot']>[] = [];
		const store = new PageLayoutStore({
			initial: initialSettings(),
			save: async (settings) => {
				saves.push(settings);
				await new Promise<void>((resolve) => releases.push(resolve));
			},
		});

		store.updatePage('home', movedHome(1));
		store.updateAgentSettings({
			selectedTarget: 'opencode',
			writeLogRetentionDays: 45,
		});
		store.updateDefaultPage('research');
		releases.shift()?.();
		await Promise.resolve();
		await Promise.resolve();
		releases.shift()?.();
		await store.flush();

		expect(saves).toHaveLength(2);
		expect(saves[1]?.layouts.pages.home[0]?.x).toBe(1);
		expect(saves[1]?.agent).toEqual({
			selectedTarget: 'opencode',
			writeLogRetentionDays: 45,
		});
		expect(saves[1]?.defaultPage).toBe('research');
	});

	it('resets only the requested page to project defaults', async () => {
		const store = new PageLayoutStore({
			initial: initialSettings(),
			save: async () => undefined,
		});
		store.updatePage('home', movedHome(3));
		store.updatePage(
			'study',
			DEFAULT_LAYOUT_STATE.pages.study.map((item) => ({ ...item, y: item.y + 2 })),
		);

		store.resetPage('home');
		await store.flush();

		expect(store.getPage('home')).toEqual(DEFAULT_LAYOUT_STATE.pages.home);
		expect(store.getPage('study')).not.toEqual(DEFAULT_LAYOUT_STATE.pages.study);
	});

	it('persists validated local Widget settings without changing layouts', async () => {
		const saves: unknown[] = [];
		const store = new PageLayoutStore({
			initial: initialSettings(),
			save: async (settings) => {
				saves.push(settings);
			},
		});
		const originalLayouts = store.getSnapshot().layouts;

		expect(
			store.updateWidgetSettings({
				quickLinks: [{ label: 'Course', path: 'Course' }],
				commands: [],
				quotes: ['Focus.'],
			}),
		).toBe(true);
		await store.flush();

		expect(store.getWidgetSettings().quickLinks[0]?.path).toBe('Course');
		expect(store.getSnapshot().layouts).toEqual(originalLayouts);
		expect(saves).toHaveLength(1);
	});

	it('persists validated metadata mappings without changing layouts', async () => {
		const saves: unknown[] = [];
		const store = new PageLayoutStore({
			initial: initialSettings(),
			save: async (settings) => {
				saves.push(settings);
			},
		});
		const originalLayouts = store.getSnapshot().layouts;
		const metadata = {
			fields: { ...DEFAULT_METADATA_SETTINGS.fields, noteType: 'category' },
			values: { courseNoteType: 'class-note', paperType: 'literature' },
		};

		expect(store.updateMetadataSettings(metadata)).toBe(true);
		await store.flush();

		expect(store.getMetadataSettings().fields.noteType).toBe('category');
		expect(store.getSnapshot().layouts).toEqual(originalLayouts);
		expect(saves).toHaveLength(1);
	});

	it('rejects ambiguous metadata mappings without scheduling a save', async () => {
		const diagnostics: LayoutStoreDiagnostic[] = [];
		let saves = 0;
		const store = new PageLayoutStore({
			initial: initialSettings(),
			save: async () => {
				saves += 1;
			},
			onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
		});

		expect(
			store.updateMetadataSettings({
				fields: { ...DEFAULT_METADATA_SETTINGS.fields, title: 'type' },
				values: DEFAULT_METADATA_SETTINGS.values,
			}),
		).toBe(false);
		await store.flush();

		expect(saves).toBe(0);
		expect(diagnostics[0]?.code).toBe('settings_update_rejected');
	});

	it('persists validated template settings without changing layouts', async () => {
		const saves: unknown[] = [];
		const store = new PageLayoutStore({
			initial: initialSettings(),
			save: async (settings) => {
				saves.push(settings);
			},
		});
		const templates = {
			...DEFAULT_TEMPLATE_SETTINGS,
			courseNote: {
				...DEFAULT_TEMPLATE_SETTINGS.courseNote,
				destinationFolder: 'Courses',
			},
		};

		expect(store.updateTemplateSettings(templates)).toBe(true);
		await store.flush();

		expect(store.getTemplateSettings().courseNote.destinationFolder).toBe('Courses');
		expect(store.getPage('home')).toEqual(DEFAULT_LAYOUT_STATE.pages.home);
		expect(saves).toHaveLength(1);
	});

	it('persists only validated Agent target and retention preferences', async () => {
		const saves: unknown[] = [];
		const store = new PageLayoutStore({
			initial: initialSettings(),
			save: async (settings) => {
				saves.push(settings);
			},
		});

		expect(
			store.updateAgentSettings({
				selectedTarget: 'opencode',
				writeLogRetentionDays: 45,
			}),
		).toBe(true);
		await store.flush();

		expect(store.getAgentSettings()).toEqual({
			selectedTarget: 'opencode',
			writeLogRetentionDays: 45,
		});
		expect(saves).toHaveLength(1);
	});

	it('appends minimal write handoffs and cleans expired entries', async () => {
		const saves: unknown[] = [];
		const store = new PageLayoutStore({
			initial: initialSettings(),
			save: async (settings) => { saves.push(settings); },
		});
		expect(store.appendAgentWriteLog({
			timestamp: '2026-07-01T00:00:00.000Z',
			workflowId: 'organize-current-note',
			target: 'codex',
			affectedPaths: ['Course/Week 1.md'],
			outcome: 'prepared-for-review',
			prompt: 'must not persist',
		})).toBe(true);
		expect(store.appendAgentWriteLog({
			timestamp: '2026-08-11T00:00:00.000Z',
			workflowId: 'create-course-note',
			target: 'opencode',
			affectedPaths: ['Courses'],
			outcome: 'handoff-failed',
			errorCode: 'request-invalid',
		})).toBe(true);
		expect(store.cleanAgentWriteLog(new Date('2026-08-12T00:00:00.000Z'))).toBe(1);
		await store.flush();

		expect(store.getAgentWriteLog()).toHaveLength(1);
		expect(store.getAgentWriteLog()[0]?.target).toBe('opencode');
		expect(JSON.stringify(store.getAgentWriteLog())).not.toContain('must not persist');
		expect(saves.length).toBeGreaterThan(0);
	});

	it('preserves write logs across unrelated layout updates', async () => {
		const store = new PageLayoutStore({
			initial: initialSettings(),
			save: async () => undefined,
		});
		store.appendAgentWriteLog({
			timestamp: '2026-08-12T00:00:00.000Z',
			workflowId: 'repair-current-note-markdown',
			target: 'codex',
			affectedPaths: ['Course/Week 1.md'],
			outcome: 'prepared-for-review',
		});
		store.updatePage('home', movedHome(2));
		await store.flush();
		expect(store.getAgentWriteLog()).toHaveLength(1);
	});

	it('persists content-free local write events and cleans them independently', async () => {
		const store = new PageLayoutStore({
			initial: initialSettings(),
			save: async () => undefined,
		});
		expect(store.appendLocalWriteLog({
			timestamp: '2026-07-01T00:00:00.000Z',
			operation: 'task-toggle',
			path: 'Daily Notes/Old.md',
			outcome: 'committed',
			noteContent: 'must not persist',
		})).toBe(true);
		expect(store.appendLocalWriteLog({
			timestamp: '2026-08-11T00:00:00.000Z',
			operation: 'create-course-note',
			path: 'Courses/New.md',
			outcome: 'committed',
		})).toBe(true);
		expect(store.cleanLocalWriteLog(new Date('2026-08-12T00:00:00.000Z'))).toBe(1);
		await store.flush();

		expect(store.getLocalWriteLog()).toHaveLength(1);
		expect(JSON.stringify(store.getLocalWriteLog())).not.toContain('must not persist');
		expect(store.getAgentWriteLog()).toHaveLength(0);
	});

	it('persists validated paper write mappings without changing layouts or logs', async () => {
		const store = new PageLayoutStore({
			initial: initialSettings(),
			save: async () => undefined,
		});
		const beforeLayouts = store.getSnapshot().layouts;
		expect(store.updateLocalWriteSettings({
			...store.getLocalWriteSettings(),
			paper: { statusField: 'progress', favoriteField: 'starred' },
		})).toBe(true);
		await store.flush();
		expect(store.getLocalWriteSettings().paper).toEqual({
			statusField: 'progress',
			favoriteField: 'starred',
		});
		expect(store.getSnapshot().layouts).toEqual(beforeLayouts);
		expect(store.getLocalWriteLog()).toEqual([]);
	});

	it('rejects duplicate paper write mappings without scheduling a save', async () => {
		let saves = 0;
		const store = new PageLayoutStore({
			initial: initialSettings(),
			save: async () => { saves += 1; },
		});
		expect(store.updateLocalWriteSettings({
			...store.getLocalWriteSettings(),
			paper: { statusField: 'status', favoriteField: 'status' },
		})).toBe(false);
		await store.flush();
		expect(saves).toBe(0);
	});

	it('changes default page and visibility without deleting stored layouts', async () => {
		const store = new PageLayoutStore({
			initial: initialSettings(),
			save: async () => undefined,
		});

		expect(store.updateDefaultPage('research')).toBe(true);
		expect(store.setWidgetVisible('home.quote', false)).toBe(true);
		await store.flush();

		expect(store.getDefaultPage()).toBe('research');
		expect(store.getVisiblePage('home').some(({ widgetId }) => widgetId === 'home.quote')).toBe(
			false,
		);
		expect(store.getPage('home').some(({ widgetId }) => widgetId === 'home.quote')).toBe(
			true,
		);
	});

	it('resets all page layouts while preserving non-layout settings', async () => {
		const store = new PageLayoutStore({
			initial: initialSettings(),
			save: async () => undefined,
		});
		store.updateDefaultPage('agent');
		store.updatePage('home', movedHome(3));

		store.resetAllPages();
		await store.flush();

		expect(store.getPage('home')).toEqual(DEFAULT_LAYOUT_STATE.pages.home);
		expect(store.getDefaultPage()).toBe('agent');
	});

	it('rejects invalid page membership without scheduling a save', async () => {
		const diagnostics: LayoutStoreDiagnostic[] = [];
		let saves = 0;
		const store = new PageLayoutStore({
			initial: initialSettings(),
			save: async () => {
				saves += 1;
			},
			onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
		});

		const accepted = store.updatePage('home', [
			{ ...DEFAULT_LAYOUT_STATE.pages.home[0]!, pageId: 'study' },
		]);
		await store.flush();

		expect(accepted).toBe(false);
		expect(saves).toBe(0);
		expect(diagnostics[0]?.code).toBe('layout_update_rejected');
	});

	it('reports save failures and retries only after a newer change', async () => {
		const diagnostics: LayoutStoreDiagnostic[] = [];
		let attempts = 0;
		const store = new PageLayoutStore({
			initial: initialSettings(),
			save: async () => {
				attempts += 1;
				if (attempts === 1) throw new Error('disk unavailable');
			},
			onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
		});

		store.updatePage('home', movedHome(1));
		await store.flush();
		expect(attempts).toBe(1);
		expect(diagnostics[0]?.code).toBe('layout_save_failed');

		store.updatePage('home', movedHome(2));
		await store.flush();
		expect(attempts).toBe(2);
	});
});
