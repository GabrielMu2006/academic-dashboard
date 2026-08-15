import { describe, expect, it } from 'vitest';
import type { PersistedWidgetLayout } from '../../src/core/layout';
import {
	fromGridStackRecord,
	fromGridStackRecords,
	toGridStackRecord,
	toGridStackRecords,
} from '../../src/layout/gridstack-records';

const LAYOUTS: readonly PersistedWidgetLayout[] = [
	{ widgetId: 'test.small', pageId: 'home', x: 0, y: 0, size: 'small' },
	{ widgetId: 'test.medium', pageId: 'home', x: 1, y: 2, size: 'medium' },
	{ widgetId: 'test.large', pageId: 'home', x: 3, y: 4, size: 'large' },
];

describe('GridStack record conversion', () => {
	it('maps project sizes to fixed spans with resizing disabled', () => {
		expect(LAYOUTS.map((layout) => toGridStackRecord(layout))).toEqual([
			{ id: 'test.small', x: 0, y: 0, w: 1, h: 1, noResize: true, minW: 1, maxW: 1, minH: 1, maxH: 1 },
			{ id: 'test.medium', x: 1, y: 2, w: 2, h: 1, noResize: true, minW: 2, maxW: 2, minH: 1, maxH: 1 },
			{ id: 'test.large', x: 3, y: 4, w: 2, h: 2, noResize: true, minW: 2, maxW: 2, minH: 2, maxH: 2 },
		]);
	});

	it('constrains resizable records to declared project sizes', () => {
		expect(toGridStackRecord(LAYOUTS[1]!, ['medium', 'large'])).toEqual({
			id: 'test.medium',
			x: 1,
			y: 2,
			w: 2,
			h: 1,
			noResize: false,
			minW: 2,
			maxW: 2,
			minH: 1,
			maxH: 2,
		});
	});

	it('round-trips project records without GridStack types escaping', () => {
		const records = toGridStackRecords(LAYOUTS);
		const restored = fromGridStackRecords(records, 'home');

		expect(restored).toEqual(LAYOUTS);
		expect(Object.isFrozen(records)).toBe(true);
		expect(Object.isFrozen(restored)).toBe(true);
	});

	it.each([
		[
			'invalid ID',
			{ id: 'clock', x: 0, y: 0, w: 1, h: 1, noResize: true },
		],
		[
			'invalid coordinates',
			{ id: 'test.clock', x: -1, y: 0, w: 1, h: 1, noResize: true },
		],
		[
			'unsupported spans',
			{ id: 'test.clock', x: 0, y: 0, w: 3, h: 3, noResize: true },
		],
	] as const)('rejects %s', (_label, record) => {
		expect(() => fromGridStackRecord(record, 'home')).toThrow();
	});
});
