import { describe, expect, it } from 'vitest';
import { isPageId, PAGE_DEFINITIONS, PAGE_IDS } from '../../src/core/pages';

describe('page contracts', () => {
	it('defines the four pages in toolbar order', () => {
		expect(PAGE_IDS).toEqual(['home', 'study', 'research', 'agent']);
		expect(PAGE_DEFINITIONS.map(({ id }) => id)).toEqual(PAGE_IDS);
		expect(PAGE_DEFINITIONS.map(({ title }) => title)).toEqual([
			'Home',
			'Study',
			'Research',
			'Agent',
		]);
	});

	it.each(['home', 'study', 'research', 'agent'])('accepts page ID %s', (pageId) => {
		expect(isPageId(pageId)).toBe(true);
	});

	it.each(['Home', 'tasks', '', 1, null, undefined])(
		'rejects unsupported page ID %s',
		(pageId) => {
			expect(isPageId(pageId)).toBe(false);
		},
	);
});
