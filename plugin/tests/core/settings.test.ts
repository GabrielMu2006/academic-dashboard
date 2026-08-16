import { describe, expect, it } from 'vitest';
import {
	DEFAULT_DASHBOARD_SETTINGS,
	migrateDashboardSettings,
	restoreDashboardSettings,
	SETTINGS_SCHEMA_VERSION,
	validateDashboardSettings,
} from '../../src/core/settings';
import { DEFAULT_METADATA_SETTINGS } from '../../src/core/metadata-settings';
import { DEFAULT_TEMPLATE_SETTINGS } from '../../src/core/template-settings';
import { DEFAULT_AGENT_SETTINGS } from '../../src/core/agent-settings';
import { DEFAULT_LOCAL_WRITE_SETTINGS } from '../../src/core/local-write-settings';
import { DEFAULT_GITHUB_SETTINGS } from '../../src/core/github-settings';
import { DEFAULT_LOCALE_SETTINGS } from '../../src/core/localization';

function emptyPages(): Record<string, unknown[]> {
	return { home: [], study: [], research: [], agent: [] };
}

function validSettings(): Record<string, unknown> {
	return {
		schemaVersion: SETTINGS_SCHEMA_VERSION,
		defaultPage: 'study',
		layouts: { schemaVersion: 3, pages: emptyPages() },
		metadata: DEFAULT_METADATA_SETTINGS,
		templates: DEFAULT_TEMPLATE_SETTINGS,
		agent: DEFAULT_AGENT_SETTINGS,
		localWrites: DEFAULT_LOCAL_WRITE_SETTINGS,
		github: DEFAULT_GITHUB_SETTINGS,
		locale: DEFAULT_LOCALE_SETTINGS,
	};
}

describe('Dashboard settings validation', () => {
	it('accepts valid settings without mutating the stored input', () => {
		const input = validSettings();
		const before = JSON.stringify(input);

		const result = validateDashboardSettings(input);

		expect(result.ok).toBe(true);
		expect(JSON.stringify(input)).toBe(before);
		if (result.ok) {
			expect(result.value.defaultPage).toBe('study');
			expect(result.value.widgets.commands).not.toHaveLength(0);
			expect(Object.isFrozen(result.value)).toBe(true);
		}
	});

	it('rejects malformed local Widget configuration', () => {
		const input = validSettings();
		input.widgets = {
			quickLinks: [{ label: 'Outside', path: '../private.md' }],
			commands: [],
			quotes: [],
		};

		const result = validateDashboardSettings(input);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues.map(({ code }) => code)).toContain('invalid_vault_path');
		}
	});

	it('validates unique namespaced hidden Widget IDs', () => {
		const input = validSettings();
		input.hiddenWidgetIds = ['home.quote', 'home.quote'];
		const result = validateDashboardSettings(input);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues.map(({ code }) => code)).toContain(
				'invalid_hidden_widget_id',
			);
		}
	});

	it('reports invalid default pages and nested layouts', () => {
		const input = validSettings();
		input.defaultPage = 'tasks';
		input.layouts = { schemaVersion: 8, pages: emptyPages() };

		const result = validateDashboardSettings(input);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues.map(({ code }) => code)).toContain('invalid_default_page');
			expect(result.issues.map(({ code }) => code)).toContain(
				'unsupported_layout_schema',
			);
		}
	});

	it('passes known-widget validation into nested layouts', () => {
		const input = validSettings();
		(input.layouts as Record<string, unknown>).pages = {
			...emptyPages(),
			home: [
				{
					widgetId: 'core.date-time',
					pageId: 'home',
					x: 0,
					y: 0,
					size: 'small',
				},
			],
		};
		const result = validateDashboardSettings(input, new Set(['core.quote']));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues.map(({ code }) => code)).toContain('unknown_widget_id');
		}
	});
});

describe('Dashboard settings migration and recovery', () => {
	it('restores the current schema with Agent preferences and minimal logs intact', () => {
		const input = validSettings();
		input.agent = { selectedTarget: 'opencode', writeLogRetentionDays: 45 };
		input.agentWriteLog = [
			{
				timestamp: '2026-08-12T00:00:00.000Z',
				workflowId: 'create-course-note',
				target: 'opencode',
				affectedPaths: ['Courses'],
				outcome: 'prepared-for-review',
			},
		];

		const restored = restoreDashboardSettings(input);

		expect(restored.source).toBe('stored');
		expect(restored.value.agent).toEqual(input.agent);
		expect(restored.value.agentWriteLog).toEqual(input.agentWriteLog);
		expect(Object.isFrozen(restored.value.agentWriteLog)).toBe(true);
	});

	it('migrates version 0 field names and version 0 layouts', () => {
		const input = {
			schemaVersion: 0,
			startPage: 'research',
			layout: { schemaVersion: 0, pages: emptyPages() },
		};
		const before = JSON.stringify(input);

		const result = migrateDashboardSettings(input);

		expect(result.ok).toBe(true);
		expect(JSON.stringify(input)).toBe(before);
		if (result.ok) {
			expect(result.value.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
			expect(result.value.defaultPage).toBe('research');
			expect(result.value.layouts.schemaVersion).toBe(3);
			expect(result.value.metadata).toEqual(DEFAULT_METADATA_SETTINGS);
		}
	});

	it('migrates version 1 settings without losing Widget preferences', () => {
		const result = migrateDashboardSettings({
			schemaVersion: 1,
			defaultPage: 'agent',
			layouts: { schemaVersion: 1, pages: emptyPages() },
			widgets: {
				quickLinks: [{ label: 'Course', path: 'Course' }],
				commands: [],
				quotes: ['Read carefully.'],
			},
			hiddenWidgetIds: ['home.quote'],
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
			expect(result.value.widgets.quotes).toEqual(['Read carefully.']);
			expect(result.value.hiddenWidgetIds).toEqual(['home.quote']);
			expect(result.value.metadata).toEqual(DEFAULT_METADATA_SETTINGS);
			expect(result.value.templates).toEqual(DEFAULT_TEMPLATE_SETTINGS);
		}
	});

	it('migrates version 2 metadata settings and adds safe template defaults', () => {
		const result = migrateDashboardSettings({
			schemaVersion: 2,
			defaultPage: 'research',
			layouts: { schemaVersion: 1, pages: emptyPages() },
			metadata: {
				fields: { ...DEFAULT_METADATA_SETTINGS.fields, noteType: 'kind' },
				values: { courseNoteType: 'class', paperType: 'literature' },
			},
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
			expect(result.value.metadata.fields.noteType).toBe('kind');
			expect(result.value.templates).toEqual(DEFAULT_TEMPLATE_SETTINGS);
		}
	});

	it('migrates version 3 settings and adds Agent defaults without losing templates', () => {
		const templates = {
			...DEFAULT_TEMPLATE_SETTINGS,
			courseNote: {
				...DEFAULT_TEMPLATE_SETTINGS.courseNote,
				destinationFolder: 'My Courses',
			},
		};
		const result = migrateDashboardSettings({
			schemaVersion: 3,
			defaultPage: 'agent',
			layouts: { schemaVersion: 1, pages: emptyPages() },
			metadata: DEFAULT_METADATA_SETTINGS,
			templates,
			hiddenWidgetIds: ['home.quote'],
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
			expect(result.value.templates.courseNote.destinationFolder).toBe('My Courses');
			expect(result.value.hiddenWidgetIds).toEqual(['home.quote']);
			expect(result.value.agent).toEqual(DEFAULT_AGENT_SETTINGS);
		}
	});

	it('migrates version 4 without losing layout schema 3, Widgets, Agent state, or handoff logs', () => {
		const result = migrateDashboardSettings({
			schemaVersion: 4,
			defaultPage: 'agent',
			layouts: { schemaVersion: 3, pages: emptyPages() },
			widgets: {
				quickLinks: [{ label: 'Lab', path: 'Lab' }],
				commands: [{ label: 'Search', commandId: 'global-search:open' }],
				quotes: ['Preserved.'],
			},
			metadata: DEFAULT_METADATA_SETTINGS,
			templates: DEFAULT_TEMPLATE_SETTINGS,
			agent: { selectedTarget: 'opencode', writeLogRetentionDays: 30 },
			agentWriteLog: [{
				timestamp: '2026-08-12T00:00:00.000Z',
				workflowId: 'create-course-note',
				target: 'opencode',
				affectedPaths: ['Courses'],
				outcome: 'prepared-for-review',
			}],
			hiddenWidgetIds: ['home.quote'],
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
			expect(result.value.layouts.schemaVersion).toBe(3);
			expect(result.value.widgets.quotes).toEqual(['Preserved.']);
			expect(result.value.hiddenWidgetIds).toEqual(['home.quote']);
			expect(result.value.agent.selectedTarget).toBe('opencode');
			expect(result.value.agent.writeLogRetentionDays).toBe(30);
			expect(result.value.agentWriteLog).toHaveLength(1);
			expect(result.value.localWrites).toEqual(DEFAULT_LOCAL_WRITE_SETTINGS);
			expect(result.value.github).toEqual(DEFAULT_GITHUB_SETTINGS);
			expect(result.value.locale).toEqual(DEFAULT_LOCALE_SETTINGS);
		}
	});

	it('migrates version 5 by adding book notes without losing local-write or GitHub state', () => {
		const { bookReading: _bookReading, ...legacyTemplates } = DEFAULT_TEMPLATE_SETTINGS;
		const result = migrateDashboardSettings({
			schemaVersion: 5,
			defaultPage: 'home',
			layouts: { schemaVersion: 3, pages: emptyPages() },
			widgets: {
				...DEFAULT_DASHBOARD_SETTINGS.widgets,
				quoteFilePath: 'Reading/每日引言.md',
			},
			metadata: DEFAULT_METADATA_SETTINGS,
			templates: {
				...legacyTemplates,
				courseNote: { ...legacyTemplates.courseNote, destinationFolder: 'Course' },
				paperReading: { ...legacyTemplates.paperReading, destinationFolder: 'Paper' },
			},
			agent: DEFAULT_AGENT_SETTINGS,
			agentWriteLog: [],
			localWrites: DEFAULT_LOCAL_WRITE_SETTINGS,
			localWriteLog: [{
				timestamp: '2026-08-15T00:00:00.000Z',
				operation: 'create-course-note',
				path: 'Course/Test/Test.md',
				outcome: 'committed',
			}],
			github: DEFAULT_GITHUB_SETTINGS,
			locale: DEFAULT_LOCALE_SETTINGS,
			hiddenWidgetIds: [],
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
			expect(result.value.templates.bookReading).toEqual(
				DEFAULT_TEMPLATE_SETTINGS.bookReading,
			);
			expect(result.value.templates.courseNote.destinationFolder).toBe('Course');
			expect(result.value.widgets.quoteFilePath).toBe('Reading/每日引言.md');
			expect(result.value.localWriteLog).toHaveLength(1);
			expect(result.value.github).toEqual(DEFAULT_GITHUB_SETTINGS);
		}
	});

	it('falls back safely for unsupported future settings', () => {
		const restored = restoreDashboardSettings({
			schemaVersion: 99,
			defaultPage: 'agent',
			layouts: { schemaVersion: 1, pages: emptyPages() },
			metadata: DEFAULT_METADATA_SETTINGS,
			templates: DEFAULT_TEMPLATE_SETTINGS,
			agent: DEFAULT_AGENT_SETTINGS,
		});

		expect(restored.source).toBe('fallback');
		expect(restored.value).toEqual(DEFAULT_DASHBOARD_SETTINGS);
		expect(restored.issues.map(({ code }) => code)).toContain(
			'unsupported_settings_schema',
		);
	});

	it('recovers invalid Agent settings without discarding layouts', () => {
		const input = validSettings();
		input.agent = { selectedTarget: 'unknown', writeLogRetentionDays: -1 };

		const restored = restoreDashboardSettings(input);

		expect(restored.source).toBe('fallback');
		expect(restored.value.layouts.pages.home).toEqual([]);
		expect(restored.value.agent).toEqual(DEFAULT_AGENT_SETTINGS);
		expect(restored.issues.map(({ code }) => code)).toContain(
			'invalid_agent_target',
		);
	});

	it('recovers a malformed write log without discarding settings', () => {
		const input = validSettings();
		input.agentWriteLog = [{ prompt: 'note contents', affectedPaths: ['../bad'] }];
		const restored = restoreDashboardSettings(input);
		expect(restored.source).toBe('fallback');
		expect(restored.value.defaultPage).toBe('study');
		expect(restored.value.layouts.pages.home).toEqual([]);
		expect(restored.value.agentWriteLog).toEqual([]);
		expect(restored.issues.map(({ code }) => code)).toContain(
			'invalid_agent_write_log_timestamp',
		);
	});

	it('returns a validated custom fallback rather than the input object', () => {
		const fallback = validateDashboardSettings(validSettings());
		expect(fallback.ok).toBe(true);
		if (!fallback.ok) return;

		const restored = restoreDashboardSettings(null, {
			fallback: fallback.value,
		});
		expect(restored.source).toBe('fallback');
		expect(restored.value).toEqual(fallback.value);
		expect(restored.value).not.toBe(fallback.value);
	});

	it('recovers malformed Widget fields without discarding a valid layout', () => {
		const input = validSettings();
		input.widgets = { quickLinks: 'broken', commands: [], quotes: [] };
		input.hiddenWidgetIds = ['not-an-id'];

		const restored = restoreDashboardSettings(input);
		expect(restored.source).toBe('fallback');
		expect(restored.value.defaultPage).toBe('study');
		expect(restored.value.layouts.pages.home).toEqual([]);
		expect(restored.value.hiddenWidgetIds).toEqual([]);
		expect(restored.issues.map(({ code }) => code)).toContain(
			'invalid_quick_links',
		);
	});

	it('recovers an invalid metadata mapping without discarding other settings', () => {
		const input = validSettings();
		input.metadata = {
			fields: { ...DEFAULT_METADATA_SETTINGS.fields, title: 'type' },
			values: DEFAULT_METADATA_SETTINGS.values,
		};

		const restored = restoreDashboardSettings(input);

		expect(restored.source).toBe('fallback');
		expect(restored.value.defaultPage).toBe('study');
		expect(restored.value.layouts.pages.home).toEqual([]);
		expect(restored.value.metadata).toEqual(DEFAULT_METADATA_SETTINGS);
		expect(restored.issues.map(({ code }) => code)).toContain(
			'duplicate_metadata_field',
		);
	});

	it('recovers invalid template settings without discarding metadata or layouts', () => {
		const input = validSettings();
		input.templates = {
			...DEFAULT_TEMPLATE_SETTINGS,
			courseNote: {
				...DEFAULT_TEMPLATE_SETTINGS.courseNote,
				destinationFolder: '../outside',
			},
		};

		const restored = restoreDashboardSettings(input);

		expect(restored.source).toBe('fallback');
		expect(restored.value.metadata).toEqual(DEFAULT_METADATA_SETTINGS);
		expect(restored.value.layouts.pages.home).toEqual([]);
		expect(restored.value.templates).toEqual(DEFAULT_TEMPLATE_SETTINGS);
		expect(restored.issues.map(({ code }) => code)).toContain(
			'invalid_destination_folder',
		);
	});
});
