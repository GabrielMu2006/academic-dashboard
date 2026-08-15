import { describe, expect, it } from 'vitest';
import {
	DEFAULT_GITHUB_SETTINGS,
	GITHUB_SECRET_STORAGE_KEY,
	saveGithubPatToSecretStorage,
	validateGithubSettings,
} from '../../src/core/github-settings';

describe('future GitHub settings boundary', () => {
	it('stores only a SecretStorage reference, cache TTL, and last-success time', () => {
		const transientSecret = String.fromCodePoint(0x2603, 45, 0x2602);
		const result = validateGithubSettings({
			secretStorageKey: 'academic-dashboard-github-pat',
			cacheTtlHours: 6,
			lastSuccessfulUpdate: '2026-08-12T00:00:00.000Z',
			pat: transientSecret,
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).toEqual({
				secretStorageKey: 'academic-dashboard-github-pat',
				cacheTtlHours: 6,
				lastSuccessfulUpdate: '2026-08-12T00:00:00.000Z',
				includePrivateContributions: false,
				credentialRevision: 0,
				cache: null,
			});
			expect(JSON.stringify(result.value)).not.toContain(transientSecret);
		}
	});

	it('validates at most one year of anonymous normalized cache data', () => {
		const result = validateGithubSettings({
			...DEFAULT_GITHUB_SETTINGS,
			includePrivateContributions: true,
			cache: {
				from: '2026-08-11',
				to: '2026-08-12',
				updatedAt: '2026-08-12T00:00:00.000Z',
				includesPrivate: true,
				credentialRevision: 0,
				days: [
					{ date: '2026-08-12', count: 2 },
					{ date: '2026-08-11', count: 1 },
				],
				privateContributionCount: 3,
			},
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.cache?.days.map(({ date }) => date)).toEqual([
				'2026-08-11', '2026-08-12',
			]);
			expect(JSON.stringify(result.value.cache)).not.toMatch(/repo|path|token/iu);
		}
	});

	it('rejects token-like references and malformed timestamps', () => {
		expect(validateGithubSettings({
			...DEFAULT_GITHUB_SETTINGS,
			secretStorageKey: 'ghp secret with spaces',
		}).ok).toBe(false);
		expect(validateGithubSettings({
			...DEFAULT_GITHUB_SETTINGS,
			lastSuccessfulUpdate: 'not-a-date',
		}).ok).toBe(false);
		expect(validateGithubSettings({
			...DEFAULT_GITHUB_SETTINGS,
			cacheTtlHours: 5,
		}).ok).toBe(false);
	});

	it('writes the PAT only to SecretStorage and clears the prior viewer cache', () => {
		const transientSecret = String.fromCodePoint(0x2603, 45, 0x2602);
		let stored = '';
		const result = saveGithubPatToSecretStorage({
			getSecret: () => null,
			setSecret: (id, value) => { stored = `${id}:${value}`; },
			listSecretIds: () => [],
		}, {
			...DEFAULT_GITHUB_SETTINGS,
			lastSuccessfulUpdate: '2026-08-12T00:00:00.000Z',
			cache: {
				from: '2026-08-12', to: '2026-08-12',
				updatedAt: '2026-08-12T00:00:00.000Z', includesPrivate: false,
				credentialRevision: 0,
				days: [{ date: '2026-08-12', count: 1 }],
			},
		}, transientSecret);

		expect(stored).toBe(`${GITHUB_SECRET_STORAGE_KEY}:${transientSecret}`);
		expect(result).toMatchObject({
			secretStorageKey: GITHUB_SECRET_STORAGE_KEY,
			lastSuccessfulUpdate: null,
			cache: null,
			credentialRevision: 1,
		});
		expect(JSON.stringify(result)).not.toContain(transientSecret);
	});
});
