import {
	LAYOUT_SCHEMA_VERSION,
	type PersistedPageLayouts,
	type PersistedLayoutState,
	type PersistedWidgetLayout,
} from './layout';
import type { PageId } from './pages';
import type { WidgetSize } from './widgets';

export interface WidgetSizePolicy {
	readonly columns: number;
	readonly rows: number;
}

export const WIDGET_SIZE_POLICIES: Readonly<
	Record<WidgetSize, WidgetSizePolicy>
> = Object.freeze({
	small: Object.freeze({ columns: 1, rows: 1 }),
	medium: Object.freeze({ columns: 2, rows: 1 }),
	large: Object.freeze({ columns: 2, rows: 2 }),
});

export function getWidgetSizePolicy(size: WidgetSize): WidgetSizePolicy {
	return WIDGET_SIZE_POLICIES[size];
}

function item(
	widgetId: string,
	pageId: PageId,
	x: number,
	y: number,
	size: WidgetSize,
): PersistedWidgetLayout {
	return Object.freeze({ widgetId, pageId, x, y, size });
}

export const DEFAULT_LAYOUT_STATE: PersistedLayoutState = Object.freeze({
	schemaVersion: LAYOUT_SCHEMA_VERSION,
	pages: Object.freeze({
		home: Object.freeze([
			item('home.date-time', 'home', 0, 0, 'small'),
			item('home.quote', 'home', 1, 0, 'small'),
			item('home.commands', 'home', 2, 0, 'medium'),
			item('home.calendar', 'home', 0, 1, 'large'),
			item('home.today-tasks', 'home', 2, 1, 'large'),
			item('home.recent-notes', 'home', 0, 3, 'large'),
			item('home.shortcuts', 'home', 2, 3, 'medium'),
			item('home.weekly-review', 'home', 2, 4, 'large'),
		]),
		study: Object.freeze([
			item('study.review-queue', 'study', 0, 0, 'large'),
			item('study.activity', 'study', 2, 0, 'large'),
			item('study.contributions', 'study', 0, 2, 'large'),
			item('study.course-folders', 'study', 2, 2, 'large'),
			item('study.course-overview', 'study', 0, 4, 'large'),
			item('study.review-session', 'study', 2, 4, 'large'),
		]),
		research: Object.freeze([
			item('research.recent-papers', 'research', 0, 0, 'large'),
			item('research.reading-queue', 'research', 2, 0, 'large'),
		]),
		agent: Object.freeze([
			item('agent.status', 'agent', 0, 0, 'medium'),
			item('agent.claudian-entry', 'agent', 2, 0, 'medium'),
			item('agent.workflows', 'agent', 0, 1, 'large'),
			item('agent.prompt', 'agent', 2, 1, 'large'),
		]),
	}),
});

export const PHASE_5_DEFAULT_LAYOUT_PAGES: PersistedPageLayouts = Object.freeze({
	home: Object.freeze([
		item('home.date-time', 'home', 0, 0, 'small'),
		item('home.calendar', 'home', 1, 0, 'medium'),
		item('home.today-tasks', 'home', 0, 1, 'medium'),
		item('home.recent-notes', 'home', 2, 1, 'medium'),
		item('home.shortcuts', 'home', 0, 2, 'medium'),
		item('home.quote', 'home', 2, 2, 'small'),
		item('home.commands', 'home', 2, 3, 'medium'),
	]),
	study: Object.freeze([
		item('study.review-queue', 'study', 0, 0, 'medium'),
		item('study.activity', 'study', 2, 0, 'medium'),
		item('study.contributions', 'study', 0, 1, 'large'),
	]),
	research: Object.freeze([
		item('research.recent-papers', 'research', 0, 0, 'large'),
	]),
	agent: Object.freeze([
		item('agent.status', 'agent', 0, 0, 'small'),
		item('agent.prompt', 'agent', 1, 0, 'large'),
		item('agent.workflows', 'agent', 0, 1, 'medium'),
		item('agent.claudian-entry', 'agent', 2, 1, 'small'),
	]),
});
