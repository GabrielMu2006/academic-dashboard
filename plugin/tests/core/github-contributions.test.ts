import { describe, expect, it, vi } from 'vitest';
import {
	GITHUB_VIEWER_CONTRIBUTIONS_QUERY,
	GithubContributionClient,
	GithubContributionError,
	type GithubGraphqlPort,
	type GithubSecretPort,
} from '../../src/core/github-contributions';

function secretValue(): string {
	return String.fromCodePoint(0x2603, 45, 0x2602);
}

function secrets(value: string | null = secretValue()): GithubSecretPort {
	return {
		getSecret: () => value,
		setSecret: vi.fn(),
		listSecretIds: () => [],
	};
}

function response(includePrivate = false): unknown {
	return {
		data: {
			viewer: {
				contributionsCollection: {
					contributionCalendar: {
						weeks: [{ contributionDays: [
							{ date: '2026-08-11', contributionCount: 2 },
							{ date: '2026-08-12', contributionCount: 4 },
						] }],
					},
					...(includePrivate ? { restrictedContributionsCount: 7 } : {}),
				},
			},
		},
	};
}

function graphql(json: unknown = response()): GithubGraphqlPort {
	return { postViewerContributions: vi.fn(async () => ({ status: 200, json })) };
}

describe('GitHub viewer contribution boundary', () => {
	it('uses a constant viewer-only query and conditionally requests an anonymous private count', async () => {
		const port = graphql(response(true));
		const client = new GithubContributionClient(secrets(), port);
		const result = await client.fetch({
			secretStorageKey: 'academic-dashboard-github-pat',
			from: '2026-08-11',
			to: '2026-08-12',
			includePrivate: true,
		});

		expect(GITHUB_VIEWER_CONTRIBUTIONS_QUERY).toContain('viewer');
		expect(GITHUB_VIEWER_CONTRIBUTIONS_QUERY).toContain('restrictedContributionsCount @include');
		expect(GITHUB_VIEWER_CONTRIBUTIONS_QUERY).not.toMatch(/\brepositor(?:y|ies)\b/iu);
		expect(result).toEqual({
			from: '2026-08-11',
			to: '2026-08-12',
			days: [
				{ date: '2026-08-11', count: 2 },
				{ date: '2026-08-12', count: 4 },
			],
			privateContributionCount: 7,
		});
		const call = vi.mocked(port.postViewerContributions).mock.calls[0];
		expect(call?.[0]).toBe(secretValue());
		expect(call?.[1].variables.includePrivate).toBe(true);
	});

	it('omits a returned private count unless the user enabled it', async () => {
		const result = await new GithubContributionClient(
			secrets(),
			graphql(response(true)),
		).fetch({
			secretStorageKey: 'academic-dashboard-github-pat',
			from: '2026-08-11',
			to: '2026-08-12',
			includePrivate: false,
		});
		expect(result).not.toHaveProperty('privateContributionCount');
	});

	it('rejects missing secrets, excessive ranges, duplicate dates, and malformed counts', async () => {
		await expect(new GithubContributionClient(secrets(null), graphql()).fetch({
			secretStorageKey: 'academic-dashboard-github-pat',
			from: '2026-08-11', to: '2026-08-12', includePrivate: false,
		})).rejects.toMatchObject({ code: 'secret-unavailable' });

		await expect(new GithubContributionClient(secrets(), graphql()).fetch({
			secretStorageKey: 'academic-dashboard-github-pat',
			from: '2025-08-11', to: '2026-08-12', includePrivate: false,
		})).rejects.toBeInstanceOf(GithubContributionError);

		for (const contributionDays of [
			[
				{ date: '2026-08-11', contributionCount: 1 },
				{ date: '2026-08-11', contributionCount: 2 },
			],
			[{ date: '2026-08-11', contributionCount: -1 }],
		]) {
			const malformed = response() as {
				data: { viewer: { contributionsCollection: {
					contributionCalendar: { weeks: Array<{ contributionDays: unknown[] }> };
				} } };
			};
			malformed.data.viewer.contributionsCollection.contributionCalendar.weeks[0] = {
				contributionDays,
			};
			await expect(new GithubContributionClient(secrets(), graphql(malformed)).fetch({
				secretStorageKey: 'academic-dashboard-github-pat',
				from: '2026-08-11', to: '2026-08-12', includePrivate: false,
			})).rejects.toMatchObject({ code: 'malformed-response' });
		}
	});

	it('maps transport and GraphQL failures to finite content-free codes', async () => {
		for (const [status, code] of [[401, 'unauthorized'], [403, 'forbidden'], [429, 'rate-limited']] as const) {
			await expect(new GithubContributionClient(secrets(), {
				postViewerContributions: async () => ({ status, json: { body: 'not retained' } }),
			}).fetch({
				secretStorageKey: 'academic-dashboard-github-pat',
				from: '2026-08-11', to: '2026-08-12', includePrivate: false,
			})).rejects.toMatchObject({ code });
		}
		await expect(new GithubContributionClient(secrets(), graphql({ errors: [{ message: 'sensitive' }] })).fetch({
			secretStorageKey: 'academic-dashboard-github-pat',
			from: '2026-08-11', to: '2026-08-12', includePrivate: false,
		})).rejects.toMatchObject({ code: 'graphql-failed' });
	});
});
