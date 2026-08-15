import { describe, expect, it } from 'vitest';
import {
	DEFAULT_LOCAL_WRITE_SETTINGS,
	isSafeDailyFilenameFormat,
	validateLocalWriteSettings,
} from '../../src/core/local-write-settings';

describe('local write settings', () => {
	it('provides conservative Daily Note, paper field, and retention defaults', () => {
		expect(DEFAULT_LOCAL_WRITE_SETTINGS.dailyNote).toEqual(expect.objectContaining({
			folder: 'Daily Notes',
			filenameFormat: 'YYYY-MM-DD.md',
			templateSource: 'dashboard',
		}));
		expect(DEFAULT_LOCAL_WRITE_SETTINGS.paper).toEqual({
			statusField: 'status',
			favoriteField: 'favorite',
		});
		expect(DEFAULT_LOCAL_WRITE_SETTINGS.logRetentionDays).toBe(30);
	});

	it('accepts a safe configurable filename and rejects traversal or folders', () => {
		expect(isSafeDailyFilenameFormat('YYYY_MM_DD.md')).toBe(true);
		expect(isSafeDailyFilenameFormat('../YYYY-MM-DD.md')).toBe(false);
		expect(isSafeDailyFilenameFormat('Daily/YYYY-MM-DD.md')).toBe(false);
	});

	it('rejects hidden/traversing folders, unsafe templates, and duplicate paper fields', () => {
		for (const candidate of [
			{
				...DEFAULT_LOCAL_WRITE_SETTINGS,
				dailyNote: { ...DEFAULT_LOCAL_WRITE_SETTINGS.dailyNote, folder: '../Daily' },
			},
			{
				...DEFAULT_LOCAL_WRITE_SETTINGS,
				dailyNote: {
					...DEFAULT_LOCAL_WRITE_SETTINGS.dailyNote,
					templateSource: 'vault',
					vaultTemplatePath: '.templates/daily.md',
				},
			},
			{
				...DEFAULT_LOCAL_WRITE_SETTINGS,
				paper: { statusField: 'status', favoriteField: 'status' },
			},
		]) {
			expect(validateLocalWriteSettings(candidate).ok).toBe(false);
		}
	});
});
