import { describe, expect, it } from 'vitest';
import {
	basesResearchAvailability,
	selectAcademicPaperRows,
} from '../../src/core/bases-research';
import { DEFAULT_METADATA_SETTINGS } from '../../src/core/metadata-settings';

describe('Bases research adapter', () => {
	it('maps only Base query entries matching the configured paper mapping', () => {
		const entries = [
			{
				path: 'Papers/graph.md',
				basename: 'graph',
				value: (propertyId: `note.${string}`) =>
					({
						'note.kind': 'literature',
						'note.name': 'Graph Learning',
						'note.creators': 'Ada, Grace',
						'note.progress': 'reading',
					} as Record<string, string>)[propertyId] ?? null,
			},
			{
				path: 'Course/week-1.md',
				basename: 'week-1',
				value: () => 'course-note',
			},
		];
		const rows = selectAcademicPaperRows(entries, {
			fields: {
				...DEFAULT_METADATA_SETTINGS.fields,
				noteType: 'kind',
				title: 'name',
				authors: 'creators',
				status: 'progress',
			},
			values: { courseNoteType: 'class', paperType: 'literature' },
		});

		expect(rows).toEqual([
			{
				path: 'Papers/graph.md',
				title: 'Graph Learning',
				authors: 'Ada, Grace',
				status: 'reading',
			},
		]);
		expect(Object.isFrozen(rows)).toBe(true);
	});

	it('normalizes malformed optional values without dropping a valid paper', () => {
		const rows = selectAcademicPaperRows(
			[{
				path: 'Papers/untitled.md',
				basename: 'untitled',
				value: (propertyId) =>
					propertyId === 'note.type'
						? 'paper'
						: propertyId === 'note.status'
							? 'finished'
							: null,
			}],
			DEFAULT_METADATA_SETTINGS,
		);
		expect(rows).toEqual([
			{ path: 'Papers/untitled.md', title: 'untitled', authors: '' },
		]);
	});

	it('represents missing, disabled, and available Bases capabilities explicitly', () => {
		expect(basesResearchAvailability(false)).toEqual(
			expect.objectContaining({ status: 'unavailable', source: 'core-plugin' }),
		);
		expect(basesResearchAvailability(true, false)).toEqual(
			expect.objectContaining({ status: 'unavailable', source: 'core-plugin' }),
		);
		expect(basesResearchAvailability(true, true)).toEqual({
			status: 'available',
			source: 'core-plugin',
		});
	});

	it('returns an empty immutable result for an empty Base query', () => {
		const rows = selectAcademicPaperRows([], DEFAULT_METADATA_SETTINGS);
		expect(rows).toEqual([]);
		expect(Object.isFrozen(rows)).toBe(true);
	});
});
