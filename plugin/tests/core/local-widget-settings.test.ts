import { describe, expect, it } from 'vitest';
import {
	DEFAULT_LOCAL_WIDGET_SETTINGS,
	validateLocalWidgetSettings,
} from '../../src/core/local-widget-settings';

describe('local Widget settings', () => {
	it('accepts, trims, clones, and freezes local-only configuration', () => {
		const input = {
			quickLinks: [{ label: ' Course ', path: 'Course/Notes.md' }],
			commands: [{ label: ' Search ', commandId: 'global-search:open' }],
			quotes: [' Keep going. '],
			quoteFilePath: ' Reading/Quotes.md ',
			todayFocus: [{ label: ' Exam ', path: 'Course/Exam.md', line: 4 }],
			currentTerm: ' 2026 Fall ',
			readingQueue: [],
			savedResearchViews: [{ id: 'view-ml', name: ' ML reading ', search: ' graph ', status: 'reading', tags: ['#ML'], year: 2026, pinned: true }],
		};
		const result = validateLocalWidgetSettings(input);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.quickLinks[0]).toEqual({
				label: 'Course',
				path: 'Course/Notes.md',
			});
			expect(result.value.commands[0]?.label).toBe('Search');
			expect(result.value.quotes).toEqual(['Keep going.']);
			expect(result.value.quoteFilePath).toBe('Reading/Quotes.md');
			expect(result.value.todayFocus).toEqual([{ label: 'Exam', path: 'Course/Exam.md', line: 4 }]);
			expect(result.value.currentTerm).toBe('2026 Fall');
			expect(result.value.savedResearchViews[0]).toEqual({ id: 'view-ml', name: 'ML reading', search: 'graph', status: 'reading', tags: ['ml'], year: 2026, pinned: true });
			expect(Object.isFrozen(result.value)).toBe(true);
		}
	});

	it.each([
		[
			'invalid_widget_settings',
			null,
		],
		[
			'invalid_vault_path',
			{ ...DEFAULT_LOCAL_WIDGET_SETTINGS, quickLinks: [{ label: 'Bad', path: '../x' }] },
		],
		[
			'invalid_command_id',
			{ ...DEFAULT_LOCAL_WIDGET_SETTINGS, commands: [{ label: 'Bad', commandId: '' }] },
		],
		[
			'invalid_quote',
			{ ...DEFAULT_LOCAL_WIDGET_SETTINGS, quotes: ['   '] },
		],
		[
			'invalid_quote_file_path',
			{ ...DEFAULT_LOCAL_WIDGET_SETTINGS, quoteFilePath: '../Quotes.md' },
		],
		[
			'invalid_today_focus',
			{ ...DEFAULT_LOCAL_WIDGET_SETTINGS, todayFocus: [1, 2, 3, 4] },
		],
		[
			'invalid_current_term',
			{ ...DEFAULT_LOCAL_WIDGET_SETTINGS, currentTerm: 'x'.repeat(121) },
		],
		[
			'invalid_reading_records',
			{ ...DEFAULT_LOCAL_WIDGET_SETTINGS, readingQueue: Array.from({ length: 201 }, () => ({})) },
		],
		[
			'invalid_saved_research_views',
			{ ...DEFAULT_LOCAL_WIDGET_SETTINGS, savedResearchViews: Array.from({ length: 13 }, () => ({})) },
		],
		[
			'invalid_saved_research_view',
			{ ...DEFAULT_LOCAL_WIDGET_SETTINGS, savedResearchViews: [{ id: 'bad', name: 'Bad', search: '', status: 'done', tags: [], pinned: true }] },
		],
	] as const)('reports %s for malformed configuration', (code, input) => {
		const result = validateLocalWidgetSettings(input);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues.map((issue) => issue.code)).toContain(code);
		}
	});
});
