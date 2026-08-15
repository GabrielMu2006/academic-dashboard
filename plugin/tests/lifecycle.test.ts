import { describe, expect, it } from 'vitest';
import {
	CREATE_COURSE_NOTE_COMMAND,
	CREATE_PAPER_READING_NOTE_COMMAND,
	DASHBOARD_VIEW_TITLE,
	DASHBOARD_VIEW_TYPE,
	OPEN_DASHBOARD_COMMAND,
	PLUGIN_ID,
} from '../src/constants';
import {
	buildDashboardViewState,
	decideRevealStrategy,
	type DashboardViewState,
	type RevealStrategy,
} from '../src/lifecycle';

describe('dashboard lifecycle constants', () => {
	it('exposes the plugin id and a namespaced view type', () => {
		expect(PLUGIN_ID).toBe('academic-dashboard');
		expect(DASHBOARD_VIEW_TYPE).toBe('academic-dashboard-view');
	});

	it('exposes a display title for the dashboard view', () => {
		expect(DASHBOARD_VIEW_TITLE).toBe('Academic Dashboard');
	});

	it('exposes a stable command id for opening the dashboard', () => {
		expect(OPEN_DASHBOARD_COMMAND).toBe('open-dashboard');
	});

	it('exposes stable narrow note-creation command ids', () => {
		expect(CREATE_COURSE_NOTE_COMMAND).toBe('create-course-note');
		expect(CREATE_PAPER_READING_NOTE_COMMAND).toBe('create-paper-reading-note');
	});
});

describe('buildDashboardViewState', () => {
	it('builds an active view state for the dashboard view type by default', () => {
		const state: DashboardViewState = buildDashboardViewState();
		expect(state).toEqual({ type: DASHBOARD_VIEW_TYPE, active: true });
	});

	it('builds a view state for an explicit view type', () => {
		const state: DashboardViewState = buildDashboardViewState('custom-view');
		expect(state).toEqual({ type: 'custom-view', active: true });
	});
});

describe('decideRevealStrategy', () => {
	it('creates a new leaf when no dashboard leaf is open', () => {
		const strategy: RevealStrategy = decideRevealStrategy(0);
		expect(strategy).toBe('create');
	});

	it('reveals an existing leaf when one is open', () => {
		const strategy: RevealStrategy = decideRevealStrategy(1);
		expect(strategy).toBe('reveal');
	});

	it('reveals the first leaf when several are open', () => {
		const strategy: RevealStrategy = decideRevealStrategy(3);
		expect(strategy).toBe('reveal');
	});
});
