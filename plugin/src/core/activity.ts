export interface ActivityQuery {
	readonly endDate: string;
	readonly days: number;
}

export interface ActivityDay {
	readonly date: string;
	readonly count: number;
	readonly intensity: 0 | 1 | 2 | 3 | 4;
}

interface ActivitySeriesBase {
	readonly days: readonly ActivityDay[];
	readonly total: number;
}

export interface LocalActivitySeries extends ActivitySeriesBase {
	readonly source: 'obsidian';
}

export interface GithubActivitySeries extends ActivitySeriesBase {
	readonly source: 'github';
	readonly cacheState: 'fresh' | 'stale';
	readonly lastUpdated: string | null;
	readonly errorCode?: string;
	readonly privateContributionCount?: number;
}

export type ActivitySeries = LocalActivitySeries | GithubActivitySeries;

export function normalizeActivityDays(days: unknown): number {
	if (typeof days !== 'number' || !Number.isFinite(days)) return 70;
	return Math.min(366, Math.max(7, Math.trunc(days)));
}
