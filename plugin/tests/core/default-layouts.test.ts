import { describe, expect, it } from 'vitest';
import {
	DEFAULT_LAYOUT_STATE,
	getWidgetSizePolicy,
	WIDGET_SIZE_POLICIES,
} from '../../src/core/default-layouts';
import type { PersistedWidgetLayout } from '../../src/core/layout';
import { validatePersistedLayoutState } from '../../src/core/layout';
import { PAGE_IDS } from '../../src/core/pages';

describe('fixed widget sizes and default layouts', () => {
	it('maps fixed sizes without depending on a layout engine', () => {
		expect(getWidgetSizePolicy('small')).toEqual({ columns: 1, rows: 1 });
		expect(getWidgetSizePolicy('medium')).toEqual({ columns: 2, rows: 1 });
		expect(getWidgetSizePolicy('large')).toEqual({ columns: 2, rows: 2 });
		expect(Object.isFrozen(WIDGET_SIZE_POLICIES)).toBe(true);
	});

	it('provides a valid non-empty default layout for every page', () => {
		const validation = validatePersistedLayoutState(DEFAULT_LAYOUT_STATE);
		expect(validation.ok).toBe(true);
		for (const pageId of PAGE_IDS) {
			expect(DEFAULT_LAYOUT_STATE.pages[pageId].length).toBeGreaterThan(0);
		}
	});

	it('keeps all default records immutable and page-local', () => {
		for (const pageId of PAGE_IDS) {
			expect(Object.isFrozen(DEFAULT_LAYOUT_STATE.pages[pageId])).toBe(true);
			expect(
				DEFAULT_LAYOUT_STATE.pages[pageId].every(
					(record) => Object.isFrozen(record) && record.pageId === pageId,
				),
			).toBe(true);
		}
	});

	it('uses content-safe sizes for the reported Home, Study, and Agent cards', () => {
		const byId = new Map(
			Object.values(DEFAULT_LAYOUT_STATE.pages)
				.flat()
				.map((layout) => [layout.widgetId, layout]),
		);
		expect(byId.get('home.calendar')?.size).toBe('large');
		expect(byId.get('home.today-tasks')?.size).toBe('large');
		expect(byId.get('home.recent-notes')?.size).toBe('large');
		expect(byId.get('home.weekly-review')?.size).toBe('large');
		expect(byId.get('study.review-queue')?.size).toBe('large');
		expect(byId.get('study.activity')?.size).toBe('large');
		expect(byId.get('study.contributions')?.size).toBe('large');
		expect(byId.get('study.course-folders')?.size).toBe('large');
		expect(byId.get('study.course-overview')?.size).toBe('large');
		expect(byId.get('study.review-session')?.size).toBe('large');
		expect(byId.get('research.reading-queue')?.size).toBe('large');
		expect(byId.get('agent.status')?.size).toBe('medium');
		expect(byId.get('agent.workflows')?.size).toBe('large');
		expect(byId.get('agent.claudian-entry')?.size).toBe('medium');
	});

	it('does not overlap any default records on the canonical four-column grid', () => {
		function cells(layout: PersistedWidgetLayout): Set<string> {
			const policy = getWidgetSizePolicy(layout.size);
			const occupied = new Set<string>();
			for (let x = layout.x; x < layout.x + policy.columns; x += 1) {
				for (let y = layout.y; y < layout.y + policy.rows; y += 1) {
					occupied.add(`${x}:${y}`);
				}
			}
			return occupied;
		}

		for (const pageId of PAGE_IDS) {
			const occupied = new Set<string>();
			for (const layout of DEFAULT_LAYOUT_STATE.pages[pageId]) {
				for (const cell of cells(layout)) {
					expect(occupied.has(cell), `${pageId} overlaps at ${cell}`).toBe(false);
					occupied.add(cell);
				}
			}
		}
	});
});
