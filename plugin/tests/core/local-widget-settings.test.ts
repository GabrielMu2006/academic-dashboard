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
	] as const)('reports %s for malformed configuration', (code, input) => {
		const result = validateLocalWidgetSettings(input);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues.map((issue) => issue.code)).toContain(code);
		}
	});
});
