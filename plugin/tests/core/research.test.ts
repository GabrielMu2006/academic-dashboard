import { describe, expect, it } from 'vitest';
import {
	normalizeResearchPapersQuery,
	paperActionCapability,
} from '../../src/core/research';

describe('research paper query contracts', () => {
	it('normalizes status, search, year, and result bounds', () => {
		expect(
			normalizeResearchPapersQuery({
				limit: 0,
				status: 'reading',
				search: '  Graph Learning ',
				year: 2026,
			}),
		).toEqual({
			limit: 1,
			status: 'reading',
			search: 'graph learning',
			tags: [],
			year: 2026,
		});
	});

	it('drops malformed optional filters', () => {
		expect(
			normalizeResearchPapersQuery({
				limit: Number.POSITIVE_INFINITY,
				status: 'done' as 'all',
				year: 20,
			}),
		).toEqual({ limit: 20, status: 'all', search: '', tags: [] });
	});

	it('derives bounded paper action capability from read and write mappings', () => {
		expect(paperActionCapability(
			{ progress: 'reading' },
			'kind',
			'literature',
			'progress',
			{ statusField: 'progress', favoriteField: 'starred' },
		)).toEqual({
			identity: { field: 'kind', value: 'literature' },
			status: { state: 'available', field: 'progress', current: 'reading' },
			favorite: { state: 'available', field: 'starred', current: false, present: false },
		});
	});

	it('fails closed for mismatched status mappings and non-Boolean favorites', () => {
		const capability = paperActionCapability(
			{ status: 'reading', favorite: 'true' },
			'type',
			'paper',
			'status',
			{ statusField: 'progress', favoriteField: 'favorite' },
		);
		expect(capability.status).toMatchObject({
			state: 'unavailable',
			field: 'progress',
		});
		expect(capability.favorite).toMatchObject({
			state: 'unavailable',
			field: 'favorite',
			current: false,
			present: true,
		});
	});
});
