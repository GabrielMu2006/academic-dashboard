import { describe, expect, it } from 'vitest';
import { buildWeeklyReviewDraft, localWeekRange } from '../../src/core/weekly-review';

describe('weekly review evidence', () => {
	it('uses the local Monday-through-Sunday range', () => {
		const range = localWeekRange(new Date(2026, 8, 8, 14));
		expect(range.startDate).toBe('2026-09-07');
		expect(range.endDate).toBe('2026-09-13');
		expect(range.start.getHours()).toBe(0);
		expect(range.endExclusive.getDate()).toBe(14);
	});

	it('includes only in-range recorded evidence and states its limits', () => {
		const inWeek = new Date(2026, 8, 8, 9).getTime();
		const draft = buildWeeklyReviewDraft({
			now: new Date(2026, 8, 8, 14),
			files: [
				{ path: 'Course/Algebra.md', basename: 'Algebra', modifiedAt: inWeek },
				{ path: 'Old.md', basename: 'Old', modifiedAt: new Date(2026, 8, 6, 23).getTime() },
			],
			localWrites: [{ timestamp: new Date(inWeek).toISOString(), operation: 'review-date', path: 'Course/Algebra.md', outcome: 'committed' }],
			agentWrites: [{ timestamp: new Date(inWeek + 1).toISOString(), workflowId: 'organize-current-note', target: 'codex', affectedPaths: ['Course/Algebra.md'], outcome: 'prepared-for-review' }],
		});
		expect(draft.path).toBe('Weekly Reviews/2026-09-07 Weekly Review.md');
		expect(draft.modifiedNoteCount).toBe(1);
		expect(draft.content).toContain('[Algebra](<Course/Algebra.md>)');
		expect(draft.content).not.toContain('Old.md');
		expect(draft.content).toContain('`review-date` · committed');
		expect(draft.content).toContain('`organize-current-note` · codex · prepared-for-review');
		expect(draft.content).toContain('does not show study duration, completion, or the full edit history');
		expect(draft.content).toContain('Reading-queue progress has no event timestamp');
		expect(draft.content).toContain('<!-- Write your own gains');
	});
});
