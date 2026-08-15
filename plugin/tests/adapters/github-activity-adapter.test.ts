import { describe, expect, it, vi } from 'vitest';
import { GithubActivityAdapter } from '../../src/adapters/github-activity-adapter';
import {
	GithubContributionClient,
	type GithubGraphqlPort,
} from '../../src/core/github-contributions';
import {
	DEFAULT_GITHUB_SETTINGS,
	GITHUB_SECRET_STORAGE_KEY,
	type GithubSettings,
} from '../../src/core/github-settings';

function secretValue(): string {
	return String.fromCodePoint(0x2603, 45, 0x2602);
}

function githubResponse(includePrivate = false): unknown {
	return {
		data: { viewer: { contributionsCollection: {
			contributionCalendar: { weeks: [{ contributionDays: [
				{ date: '2026-08-11', contributionCount: 2 },
				{ date: '2026-08-12', contributionCount: 4 },
			] }] },
			...(includePrivate ? { restrictedContributionsCount: 5 } : {}),
		} } },
	};
}

function harness(input: {
	settings?: GithubSettings;
	response?: unknown;
	status?: number;
	deferred?: Promise<{ readonly status: number; readonly json: unknown }>;
} = {}) {
	let settings = input.settings ?? Object.freeze({
		...DEFAULT_GITHUB_SETTINGS,
		secretStorageKey: GITHUB_SECRET_STORAGE_KEY,
	});
	const post: GithubGraphqlPort['postViewerContributions'] = vi.fn(async () => input.deferred ?? {
		status: input.status ?? 200,
		json: input.response ?? githubResponse(settings.includePrivateContributions),
	});
	const client = new GithubContributionClient(
		{
			getSecret: () => secretValue(),
			setSecret: vi.fn(),
			listSecretIds: () => [GITHUB_SECRET_STORAGE_KEY],
		},
		{ postViewerContributions: post },
	);
	const updateSettings = vi.fn((candidate: GithubSettings) => {
		settings = candidate;
		return true;
	});
	const adapter = new GithubActivityAdapter({
		client,
		getSettings: () => settings,
		updateSettings,
		hasSecret: () => true,
		now: () => new Date('2026-08-12T06:00:00.000Z'),
	});
	return {
		adapter,
		post,
		updateSettings,
		getSettings: () => settings,
		setSettings: (value: GithubSettings) => { settings = value; },
	};
}

describe('GitHub contribution cache adapter', () => {
	it('refreshes one normalized year and persists only last-good cache metadata', async () => {
		const target = harness();
		const result = await target.adapter.refresh({ endDate: '2026-08-12', days: 70 });

		expect(result.cacheState).toBe('fresh');
		expect(result.total).toBe(6);
		expect(target.post).toHaveBeenCalledTimes(1);
		expect(target.getSettings().cache).toMatchObject({
			from: '2025-08-12',
			to: '2026-08-12',
			updatedAt: '2026-08-12T06:00:00.000Z',
		});
		expect(target.getSettings().cache?.days).toHaveLength(2);
		expect(JSON.stringify(target.getSettings())).not.toMatch(/authorization|bearer|repo|path/iu);
	});

	it('uses a logarithmic five-level scale so one busy day does not flatten the rest', async () => {
		const settings: GithubSettings = Object.freeze({
			...DEFAULT_GITHUB_SETTINGS,
			secretStorageKey: GITHUB_SECRET_STORAGE_KEY,
			cache: Object.freeze({
				from: '2026-08-08',
				to: '2026-08-12',
				updatedAt: '2026-08-12T05:00:00.000Z',
				includesPrivate: false,
				credentialRevision: 0,
				days: Object.freeze([
					{ date: '2026-08-08', count: 0 },
					{ date: '2026-08-09', count: 1 },
					{ date: '2026-08-10', count: 2 },
					{ date: '2026-08-11', count: 5 },
					{ date: '2026-08-12', count: 26 },
				]),
			}),
		});
		const result = await harness({ settings }).adapter.query({
			endDate: '2026-08-12',
			days: 5,
		});

		expect(result.days.slice(-5).map((day) => day.intensity)).toEqual([0, 1, 2, 3, 4]);
	});

	it('uses a six-hour boundary and retains last-good data with a finite error', async () => {
		const cached: GithubSettings = Object.freeze({
			...DEFAULT_GITHUB_SETTINGS,
			secretStorageKey: GITHUB_SECRET_STORAGE_KEY,
			lastSuccessfulUpdate: '2026-08-12T00:00:00.000Z',
			cache: Object.freeze({
				from: '2025-08-12', to: '2026-08-12',
				updatedAt: '2026-08-12T00:00:00.000Z',
				includesPrivate: false,
				credentialRevision: 0,
				days: Object.freeze([{ date: '2026-08-12', count: 3 }]),
			}),
		});
		const target = harness({ settings: cached, status: 401 });
		expect((await target.adapter.query({ endDate: '2026-08-12', days: 70 })).cacheState).toBe('stale');
		const fallback = await target.adapter.refresh({ endDate: '2026-08-12', days: 70 });
		expect(fallback).toMatchObject({
			cacheState: 'stale', total: 3, errorCode: 'unauthorized',
			lastUpdated: '2026-08-12T00:00:00.000Z',
		});
		expect(target.updateSettings).not.toHaveBeenCalled();
		expect(target.getSettings()).toBe(cached);
	});

	it('deduplicates concurrent refreshes and includes only an anonymous private total after opt-in', async () => {
		let release: ((value: { status: number; json: unknown }) => void) | undefined;
		const deferred = new Promise<{ status: number; json: unknown }>((resolve) => { release = resolve; });
		const target = harness({
			settings: Object.freeze({
				...DEFAULT_GITHUB_SETTINGS,
				secretStorageKey: GITHUB_SECRET_STORAGE_KEY,
				includePrivateContributions: true,
			}),
			deferred,
		});
		const first = target.adapter.refresh({ endDate: '2026-08-12', days: 70 });
		const second = target.adapter.refresh({ endDate: '2026-08-12', days: 70 });
		expect(first).toBe(second);
		release?.({ status: 200, json: githubResponse(true) });
		const result = await first;
		expect(target.post).toHaveBeenCalledTimes(1);
		expect(result.privateContributionCount).toBe(5);
		expect(JSON.stringify(target.getSettings().cache)).not.toContain('viewer');
	});

	it('discards an old viewer response when the credential revision changes in flight', async () => {
		let release: ((value: { status: number; json: unknown }) => void) | undefined;
		const deferred = new Promise<{ status: number; json: unknown }>((resolve) => { release = resolve; });
		const target = harness({ deferred });
		const refresh = target.adapter.refresh({ endDate: '2026-08-12', days: 70 });
		target.setSettings(Object.freeze({
			...target.getSettings(),
			credentialRevision: target.getSettings().credentialRevision + 1,
			cache: null,
			lastSuccessfulUpdate: null,
		}));
		release?.({ status: 200, json: githubResponse() });

		expect(await refresh).toMatchObject({
			cacheState: 'stale', errorCode: 'configuration-changed', lastUpdated: null,
		});
		expect(target.updateSettings).not.toHaveBeenCalled();
		expect(target.getSettings().cache).toBeNull();
	});
});
