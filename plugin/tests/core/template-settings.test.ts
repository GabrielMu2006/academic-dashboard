import { describe, expect, it } from 'vitest';
import {
	DEFAULT_TEMPLATE_SETTINGS,
	isSafeVaultRelativePath,
	validateAcademicTemplateSettings,
} from '../../src/core/template-settings';

describe('academic template settings', () => {
	it('accepts and freezes the editable default templates', () => {
		const result = validateAcademicTemplateSettings(DEFAULT_TEMPLATE_SETTINGS);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.courseNote.customTemplate).toContain(
				'{{value.courseNoteType}}',
			);
			expect(Object.isFrozen(result.value.courseNote)).toBe(true);
		}
	});

	it('accepts a selected Vault Markdown template and custom destination', () => {
		const result = validateAcademicTemplateSettings({
			...DEFAULT_TEMPLATE_SETTINGS,
			paperReading: {
				...DEFAULT_TEMPLATE_SETTINGS.paperReading,
				source: 'vault',
				customTemplate: '',
				vaultTemplatePath: 'Templates/paper.md',
				destinationFolder: 'Reading/Papers',
			},
		});

		expect(result.ok).toBe(true);
	});

	it('rejects traversal, hidden configuration paths, and non-Markdown templates', () => {
		expect(isSafeVaultRelativePath('../outside')).toBe(false);
		expect(isSafeVaultRelativePath('.hidden/plugins')).toBe(false);
		expect(
			isSafeVaultRelativePath('Templates/paper.txt', { markdownFile: true }),
		).toBe(false);

		const result = validateAcademicTemplateSettings({
			...DEFAULT_TEMPLATE_SETTINGS,
			courseNote: {
				...DEFAULT_TEMPLATE_SETTINGS.courseNote,
				source: 'vault',
				vaultTemplatePath: '../template.md',
				destinationFolder: '.hidden/notes',
			},
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues.map(({ code }) => code)).toEqual(
				expect.arrayContaining([
					'invalid_template_path',
					'invalid_destination_folder',
				]),
			);
		}
	});
});
