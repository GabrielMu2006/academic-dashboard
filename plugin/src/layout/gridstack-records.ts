import { getWidgetSizePolicy, WIDGET_SIZE_POLICIES } from '../core/default-layouts';
import type { PersistedWidgetLayout } from '../core/layout';
import type { PageId } from '../core/pages';
import { isWidgetId, type WidgetSize } from '../core/widgets';

/** Structural subset of GridStackWidget used at the adapter boundary. */
export interface GridStackRecord {
	readonly id: string;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
	readonly noResize: boolean;
	readonly minW?: number;
	readonly maxW?: number;
	readonly minH?: number;
	readonly maxH?: number;
}

function isCoordinate(value: number): boolean {
	return Number.isInteger(value) && value >= 0;
}

function sizeFromSpans(width: number, height: number): WidgetSize | undefined {
	const entry = Object.entries(WIDGET_SIZE_POLICIES).find(
		([, policy]) => policy.columns === width && policy.rows === height,
	);
	return entry?.[0] as WidgetSize | undefined;
}

export function toGridStackRecord(
	layout: PersistedWidgetLayout,
	allowedSizes: readonly WidgetSize[] = [layout.size],
): GridStackRecord {
	const policy = getWidgetSizePolicy(layout.size);
	const allowedPolicies = allowedSizes.map(getWidgetSizePolicy);
	const widths = allowedPolicies.map(({ columns }) => columns);
	const heights = allowedPolicies.map(({ rows }) => rows);
	return Object.freeze({
		id: layout.widgetId,
		x: layout.x,
		y: layout.y,
		w: policy.columns,
		h: policy.rows,
		noResize: allowedSizes.length < 2,
		minW: Math.min(...widths),
		maxW: Math.max(...widths),
		minH: Math.min(...heights),
		maxH: Math.max(...heights),
	});
}

export function fromGridStackRecord(
	record: GridStackRecord,
	pageId: PageId,
): PersistedWidgetLayout {
	if (!isWidgetId(record.id)) {
		throw new Error('Invalid GridStack widget ID.');
	}
	if (!isCoordinate(record.x) || !isCoordinate(record.y)) {
		throw new Error(`Invalid GridStack coordinates for: ${record.id}`);
	}
	const size = sizeFromSpans(record.w, record.h);
	if (!size) {
		throw new Error(`Unsupported GridStack spans for: ${record.id}`);
	}

	return Object.freeze({
		widgetId: record.id,
		pageId,
		x: record.x,
		y: record.y,
		size,
	});
}

export function toGridStackRecords(
	layouts: readonly PersistedWidgetLayout[],
): readonly GridStackRecord[] {
	return Object.freeze(layouts.map((layout) => toGridStackRecord(layout)));
}

export function fromGridStackRecords(
	records: readonly GridStackRecord[],
	pageId: PageId,
): readonly PersistedWidgetLayout[] {
	return Object.freeze(records.map((record) => fromGridStackRecord(record, pageId)));
}
