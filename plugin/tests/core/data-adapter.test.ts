import { describe, expect, it } from 'vitest';
import {
	adapterAvailable,
	adapterFallback,
	adapterUnavailable,
	isAdapterId,
	type DataAdapter,
} from '../../src/core/data-adapter';

describe('DataAdapter contract', () => {
	it('accepts stable namespaced Adapter IDs', () => {
		expect(isAdapterId('native-vault.recent-notes')).toBe(true);
		expect(isAdapterId('tasks.today')).toBe(true);
		expect(isAdapterId('recent-notes')).toBe(false);
		expect(isAdapterId('../vault')).toBe(false);
	});

	it('represents available, fallback, and unavailable states explicitly', () => {
		expect(adapterAvailable('native-vault')).toEqual({
			status: 'available',
			source: 'native-vault',
		});
		expect(
			adapterFallback(
				'optional-plugin',
				'Tasks is not installed.',
				'native-vault.today-tasks',
			),
		).toEqual({
			status: 'fallback',
			source: 'optional-plugin',
			reason: 'Tasks is not installed.',
			fallbackAdapterId: 'native-vault.today-tasks',
		});
		expect(
			adapterUnavailable('local', 'No local Git data.', 'Choose a repository.'),
		).toEqual({
			status: 'unavailable',
			source: 'local',
			reason: 'No local Git data.',
			recovery: 'Choose a repository.',
		});
	});

	it('supports adapters without importing provider-specific result types', async () => {
		const adapter: DataAdapter<{ limit: number }, readonly string[]> = {
			id: 'native-vault.recent-notes',
			availability: async () => adapterAvailable('native-vault'),
			query: async ({ limit }) => ['a.md', 'b.md'].slice(0, limit),
		};

		expect(await adapter.availability()).toMatchObject({ status: 'available' });
		expect(await adapter.query({ limit: 1 })).toEqual(['a.md']);
	});

	it('rejects incomplete fallback and unavailable states', () => {
		expect(() =>
			adapterFallback('optional-plugin', '', 'native-vault.today-tasks'),
		).toThrow();
		expect(() =>
			adapterFallback('optional-plugin', 'Missing.', 'today-tasks'),
		).toThrow();
		expect(() => adapterUnavailable('local', '   ')).toThrow();
	});
});
