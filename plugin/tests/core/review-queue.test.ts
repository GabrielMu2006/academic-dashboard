import { describe, expect, it } from 'vitest';
import {
	normalizeReviewQueueQuery,
	reviewDateChoices,
} from '../../src/core/review-queue';

describe('review queue contracts', () => {
	it('offers bounded local calendar date choices', () => {
		expect(reviewDateChoices(new Date(2026, 7, 11))).toEqual([
			{ id: 'tomorrow', label: 'Tomorrow', date: '2026-08-12' },
			{ id: 'three-days', label: 'In 3 days', date: '2026-08-14' },
			{ id: 'one-week', label: 'In 1 week', date: '2026-08-18' },
			{ id: 'one-month', label: 'In 30 days', date: '2026-09-10' },
		]);
	});
	it('normalizes bounded filters without retaining mutable input', () => {
		const query = normalizeReviewQueueQuery({
			date: '2026-08-11',
			limit: 500,
			kind: 'flashcard',
			search: '  Memory  ',
		});

		expect(query).toEqual({
			date: '2026-08-11',
			limit: 100,
			kind: 'flashcard',
			search: 'memory',
		});
		expect(Object.isFrozen(query)).toBe(true);
	});

	it('recovers malformed query fields with safe defaults', () => {
		expect(
			normalizeReviewQueueQuery({
				date: 'tomorrow',
				limit: Number.NaN,
				kind: 'unknown' as 'all',
			}),
		).toEqual({ date: '1970-01-01', limit: 20, kind: 'all', search: '' });
	});
});
