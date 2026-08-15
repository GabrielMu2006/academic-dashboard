import { describe, expect, it } from 'vitest';
import {
	DASHBOARD_PAGES,
	getDashboardPage,
	pageForNavigationKey,
} from '../../src/app/dashboard-shell';
import { PAGE_IDS } from '../../src/core/pages';

describe('dashboard shell presentation', () => {
	it('defines presentation copy for every page in toolbar order', () => {
		expect(DASHBOARD_PAGES.map(({ id }) => id)).toEqual(PAGE_IDS);
		for (const page of DASHBOARD_PAGES) {
			expect(page.title).not.toHaveLength(0);
			expect(page.description).not.toHaveLength(0);
			expect(page.placeholder).not.toHaveLength(0);
		}
	});

	it('returns the matching page presentation', () => {
		expect(getDashboardPage('research')).toEqual(
			expect.objectContaining({ id: 'research', title: 'Research' }),
		);
	});

	it('publishes immutable page presentation records', () => {
		expect(Object.isFrozen(DASHBOARD_PAGES)).toBe(true);
		expect(DASHBOARD_PAGES.every(Object.isFrozen)).toBe(true);
	});

	it('supports wrapping tab-list keyboard navigation', () => {
		expect(pageForNavigationKey('home', 'ArrowLeft')).toBe('agent');
		expect(pageForNavigationKey('agent', 'ArrowRight')).toBe('home');
		expect(pageForNavigationKey('research', 'Home')).toBe('home');
		expect(pageForNavigationKey('study', 'End')).toBe('agent');
		expect(pageForNavigationKey('home', 'Enter')).toBeNull();
	});
});
