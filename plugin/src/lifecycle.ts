import { DASHBOARD_VIEW_TYPE } from './constants';

export interface DashboardViewState {
	type: string;
	active: boolean;
}

export type RevealStrategy = 'reveal' | 'create';

export function buildDashboardViewState(
	viewType: string = DASHBOARD_VIEW_TYPE,
): DashboardViewState {
	return { type: viewType, active: true };
}

export function decideRevealStrategy(openLeavesOfType: number): RevealStrategy {
	return openLeavesOfType > 0 ? 'reveal' : 'create';
}
