import {
	adapterAvailable,
	adapterUnavailable,
	type Availability,
} from '../core/data-adapter';
import {
	normalizeActivityDays,
	type ActivityDay,
	type ActivityQuery,
	type GithubActivitySeries,
} from '../core/activity';
import { isIsoDate } from '../core/calendar-tasks';
import {
	GithubContributionError,
	type GithubContributionClient,
	type GithubContributionErrorCode,
} from '../core/github-contributions';
import type {
	GithubContributionCache,
	GithubSettings,
} from '../core/github-settings';

const GITHUB_CACHE_TTL_MS = 6 * 60 * 60 * 1_000;

export interface GithubActivityAdapterOptions {
	readonly client: GithubContributionClient;
	readonly getSettings: () => GithubSettings;
	readonly updateSettings: (settings: GithubSettings) => boolean;
	readonly hasSecret: (id: string) => boolean;
	readonly now?: () => Date;
}

function intensity(count: number, maximum: number): 0 | 1 | 2 | 3 | 4 {
	if (count <= 0 || maximum <= 0) return 0;
	const normalized = Math.log1p(count) / Math.log1p(maximum);
	return Math.min(4, Math.max(1, Math.ceil(normalized * 4))) as 1 | 2 | 3 | 4;
}

function addUtcDays(date: string, offset: number): string {
	const value = new Date(`${date}T00:00:00.000Z`);
	value.setUTCDate(value.getUTCDate() + offset);
	return value.toISOString().slice(0, 10);
}

function visibleSeries(
	query: ActivityQuery,
	settings: GithubSettings,
	cache: GithubContributionCache | null,
	now: Date,
	errorCode?: GithubContributionErrorCode,
): GithubActivitySeries {
	const count = normalizeActivityDays(query.days);
	const from = addUtcDays(query.endDate, -(count - 1));
	const counts = new Map(cache?.days.map((day) => [day.date, day.count]) ?? []);
	const raw = Array.from({ length: count }, (_, index) => {
		const date = addUtcDays(from, index);
		return { date, count: counts.get(date) ?? 0 };
	});
	const maximum = Math.max(0, ...raw.map((day) => day.count));
	const days: ActivityDay[] = raw.map(({ date, count: dayCount }) => Object.freeze({
		date,
		count: dayCount,
		intensity: intensity(dayCount, maximum),
	}));
	const age = cache ? now.getTime() - Date.parse(cache.updatedAt) : Number.POSITIVE_INFINITY;
	const fresh = cache !== null &&
		cache.from <= from && cache.to >= query.endDate &&
		cache.includesPrivate === settings.includePrivateContributions &&
		cache.credentialRevision === settings.credentialRevision &&
		age >= 0 && age < GITHUB_CACHE_TTL_MS;
	return Object.freeze({
		source: 'github',
		days: Object.freeze(days),
		total: days.reduce((sum, day) => sum + day.count, 0),
		cacheState: fresh ? 'fresh' : 'stale',
		lastUpdated: cache?.updatedAt ?? null,
		...(errorCode ? { errorCode } : {}),
		...(settings.includePrivateContributions && cache?.includesPrivate &&
			cache.privateContributionCount !== undefined
			? { privateContributionCount: cache.privateContributionCount }
			: {}),
	});
}

export class GithubActivityAdapter {
	readonly id = 'github.viewer-contributions';
	private inFlight: Promise<GithubActivitySeries> | null = null;
	private lastError: GithubContributionErrorCode | undefined;

	constructor(private readonly options: GithubActivityAdapterOptions) {}

	availability(): Promise<Availability> {
		const key = this.options.getSettings().secretStorageKey;
		if (key && this.options.hasSecret(key)) {
			return Promise.resolve(adapterAvailable('remote'));
		}
		return Promise.resolve(adapterUnavailable(
			'remote',
			'GitHub contributions are not configured.',
			'Add a PAT in Academic Dashboard settings. It is stored only in Obsidian SecretStorage.',
		));
	}

	query(input: ActivityQuery): Promise<GithubActivitySeries> {
		if (!isIsoDate(input.endDate)) {
			return Promise.reject(new GithubContributionError('malformed-response'));
		}
		const settings = this.options.getSettings();
		return Promise.resolve(visibleSeries(
			input,
			settings,
			settings.cache,
			(this.options.now ?? (() => new Date()))(),
			this.lastError,
		));
	}

	refresh(input: ActivityQuery): Promise<GithubActivitySeries> {
		if (this.inFlight) return this.inFlight;
		this.inFlight = this.performRefresh(input).finally(() => { this.inFlight = null; });
		return this.inFlight;
	}

	private async performRefresh(input: ActivityQuery): Promise<GithubActivitySeries> {
		if (!isIsoDate(input.endDate)) throw new GithubContributionError('malformed-response');
		const settings = this.options.getSettings();
		const now = (this.options.now ?? (() => new Date()))();
		try {
			const snapshot = await this.options.client.fetch({
				secretStorageKey: settings.secretStorageKey,
				from: addUtcDays(input.endDate, -365),
				to: input.endDate,
				includePrivate: settings.includePrivateContributions,
			});
			const cache: GithubContributionCache = Object.freeze({
				from: snapshot.from,
				to: snapshot.to,
				updatedAt: now.toISOString(),
				includesPrivate: settings.includePrivateContributions,
				credentialRevision: settings.credentialRevision,
				days: snapshot.days,
				...(snapshot.privateContributionCount === undefined
					? {}
					: { privateContributionCount: snapshot.privateContributionCount }),
			});
			const current = this.options.getSettings();
			if (
				current.credentialRevision !== settings.credentialRevision ||
				current.secretStorageKey !== settings.secretStorageKey ||
				current.includePrivateContributions !== settings.includePrivateContributions
			) {
				throw new GithubContributionError('configuration-changed');
			}
			const updated = Object.freeze({
				...settings,
				lastSuccessfulUpdate: cache.updatedAt,
				cache,
			});
			if (!this.options.updateSettings(updated)) {
				throw new GithubContributionError('malformed-response');
			}
			this.lastError = undefined;
			return visibleSeries(input, updated, cache, now);
		} catch (error) {
			this.lastError = error instanceof GithubContributionError
				? error.code
				: 'network-failed';
			const current = this.options.getSettings();
			return visibleSeries(input, current, current.cache, now, this.lastError);
		}
	}
}
