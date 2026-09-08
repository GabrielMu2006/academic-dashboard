import { describe, expect, it } from 'vitest';
import {
	DEFAULT_METADATA_SETTINGS,
	RECOMMENDED_COURSE_NOTE_SCHEMA,
	RECOMMENDED_BOOK_NOTE_SCHEMA,
	RECOMMENDED_PAPER_NOTE_SCHEMA,
	validateMetadataSettings,
} from '../../src/core/metadata-settings';

describe('metadata settings', () => {
	it('publishes the recommended course and paper schemas', () => {
		expect(RECOMMENDED_COURSE_NOTE_SCHEMA).toMatchObject({
			type: 'course-note',
			course: '',
			term: '',
		});
		expect(RECOMMENDED_PAPER_NOTE_SCHEMA).toMatchObject({
			type: 'paper',
			status: 'unread',
		});
		expect(RECOMMENDED_BOOK_NOTE_SCHEMA).toMatchObject({ type: 'book-note', edition: '', 'reading-id': '' });
	});

	it('accepts common custom property names without requiring a Vault migration', () => {
		const input = {
			fields: {
				...DEFAULT_METADATA_SETTINGS.fields,
				noteType: 'category',
				course: '课程',
				authors: 'paper-authors',
			},
			values: { courseNoteType: 'lecture', paperType: 'literature' },
		};
		const before = JSON.stringify(input);

		const result = validateMetadataSettings(input);

		expect(result.ok).toBe(true);
		expect(JSON.stringify(input)).toBe(before);
		if (result.ok) {
			expect(result.value.fields.course).toBe('课程');
			expect(result.value.values.bookType).toBe('book-note');
			expect(Object.isFrozen(result.value.fields)).toBe(true);
		}
	});

	it('trims mapping values before persistence', () => {
		const result = validateMetadataSettings({
			fields: { ...DEFAULT_METADATA_SETTINGS.fields, noteType: ' category ' },
			values: { courseNoteType: ' lecture ', paperType: ' literature ' },
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.fields.noteType).toBe('category');
			expect(result.value.values.paperType).toBe('literature');
		}
	});

	it('rejects empty, unsafe, duplicate, and ambiguous mappings', () => {
		const result = validateMetadataSettings({
			fields: {
				...DEFAULT_METADATA_SETTINGS.fields,
				noteType: '__proto__',
				title: 'course',
				venue: '',
			},
			values: { courseNoteType: 'note', paperType: 'note', bookType: 'book-note' },
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			const codes = result.issues.map(({ code }) => code);
			expect(codes).toContain('invalid_metadata_field');
			expect(codes).toContain('duplicate_metadata_field');
			expect(codes).toContain('duplicate_metadata_type_value');
		}
	});
});
