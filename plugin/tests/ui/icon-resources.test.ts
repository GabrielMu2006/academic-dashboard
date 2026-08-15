import { describe, expect, it } from 'vitest';
import { PAGE_IDS } from '../../src/core/pages';
import {
	createPageIconResources,
	PAGE_ICON_RESOURCES,
} from '../../src/ui/icon-resources';

describe('page icon resources', () => {
	it('provides a replaceable resource for every page', () => {
		expect(Object.keys(PAGE_ICON_RESOURCES)).toEqual(PAGE_IDS);
		expect(PAGE_ICON_RESOURCES).toEqual({
			home: 'house',
			study: 'graduation-cap',
			research: 'library',
			agent: 'bot',
		});
	});

	it('applies trimmed overrides without changing the defaults', () => {
		const resources = createPageIconResources({ home: '  panels-top-left  ' });

		expect(resources.home).toBe('panels-top-left');
		expect(resources.study).toBe(PAGE_ICON_RESOURCES.study);
		expect(PAGE_ICON_RESOURCES.home).toBe('house');
		expect(Object.isFrozen(resources)).toBe(true);
	});

	it('falls back to the default for an empty override', () => {
		expect(createPageIconResources({ agent: '   ' }).agent).toBe('bot');
	});
});
