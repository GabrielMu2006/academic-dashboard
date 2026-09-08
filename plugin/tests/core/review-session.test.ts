import { describe, expect, it } from 'vitest';
import { startReviewSession, updateReviewSession } from '../../src/core/review-session';
import type { ReviewQueueItem } from '../../src/core/review-queue';

const item = (index: number): ReviewQueueItem => ({ path: `Course/${index}.md`, title: `${index}`, kind: index % 2 ? 'note' : 'flashcard', dueCount: 1, totalCount: 1 });

describe('review session state', () => {
	it('starts an immutable session at the selected finite limit', () => {
		const state = startReviewSession(Array.from({ length: 25 }, (_, index) => item(index)), 10);
		expect(state.items).toHaveLength(10);
		expect(Object.isFrozen(state.items)).toBe(true);
	});

	it('keeps skipped and viewed outcomes distinct without claiming mastery', () => {
		const started = startReviewSession([item(1), item(2)], 20);
		const viewed = updateReviewSession(started, started.items[0]!.key, 'view');
		const skipped = updateReviewSession(viewed, started.items[1]!.key, 'skip');
		expect(skipped.items.map(({ state }) => state)).toEqual(['viewed', 'skipped']);
	});
});
