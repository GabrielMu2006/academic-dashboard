import { describe, expect, it, vi } from 'vitest';
import {
	NativeReviewQueueAdapter,
	OptionalSpacedRepetitionAdapter,
	type ReviewVaultPort,
} from '../../src/adapters/review-queue-adapters';
import { DEFAULT_METADATA_SETTINGS } from '../../src/core/metadata-settings';

function vault(): ReviewVaultPort {
	const markdown: Record<string, string> = {
		'Course/notes.md': '#review\nRecall the main theorem.\n<!--SR:!2026-08-10,3,250-->',
		'Cards/memory.md': [
			'#flashcards/cognition',
			'Working memory::Limited capacity <!--SR:!2026-08-11,1,250-->',
			'Long-term memory:::Consolidation',
			'```md',
			'Example::Not a card',
			'```',
		].join('\n'),
		'Cards/future.md': '#flashcards\nFuture::Later <!--SR:!2026-08-20,9,250-->',
		'Course/ambiguous.md': '#review\nA <!--SR:!2026-08-09,1,250-->\nB <!--SR:!2026-08-10,1,250-->',
	};
	return {
		listMarkdownFiles: () => [
			{ path: 'node_modules/pkg/cards.md', basename: 'cards', modifiedAt: 99 },
			{ path: 'Broken/review.md', basename: 'review', modifiedAt: 40 },
			{ path: 'Course/notes.md', basename: 'notes', modifiedAt: 30 },
			{ path: 'Course/ambiguous.md', basename: 'ambiguous', modifiedAt: 25 },
			{ path: 'Cards/memory.md', basename: 'memory', modifiedAt: 20 },
			{ path: 'Cards/future.md', basename: 'future', modifiedAt: 10 },
		],
		frontmatter: (path) =>
			path === 'Cards/memory.md' ? { labels: ['flashcards/cognition'] } : null,
		readMarkdown: async (path) => {
			const value = markdown[path];
			if (!value) throw new Error('race');
			return value;
		},
	};
}

describe('review queue adapters', () => {
	it('finds due note reviews and flashcards through Native Markdown fallback', async () => {
		const adapter = new NativeReviewQueueAdapter(vault(), () => ({
			...DEFAULT_METADATA_SETTINGS,
			fields: { ...DEFAULT_METADATA_SETTINGS.fields, tags: 'labels' },
		}));

		const items = await adapter.query({ date: '2026-08-11', limit: 20 });

		expect(items).toEqual([
			expect.objectContaining({
				path: 'Course/notes.md',
				kind: 'note',
				dueCount: 1,
				reviewTarget: { line: 3, currentDate: '2026-08-10' },
			}),
			expect.objectContaining({
				path: 'Course/ambiguous.md',
				kind: 'note',
			}),
			expect.objectContaining({
				path: 'Cards/memory.md',
				kind: 'flashcard',
				totalCount: 2,
				dueCount: 2,
			}),
		]);
		expect(items[1]).not.toHaveProperty('reviewTarget');
	});

	it('preserves original line numbers around fenced examples', async () => {
		const adapter = new NativeReviewQueueAdapter(
			{
				listMarkdownFiles: () => [{ path: 'Review.md', basename: 'Review', modifiedAt: 1 }],
				frontmatter: () => null,
				readMarkdown: async () => [
					'#review',
					'```md',
					'<!--SR:!2026-08-01,1,250-->',
					'```',
					'<!--SR:!2026-08-10,1,250-->',
				].join('\n'),
			},
			() => DEFAULT_METADATA_SETTINGS,
		);

		expect(await adapter.query({ date: '2026-08-11', limit: 20 })).toEqual([
			expect.objectContaining({ reviewTarget: { line: 5, currentDate: '2026-08-10' } }),
		]);
	});

	it('applies kind and search filters and omits future-only queues', async () => {
		const adapter = new NativeReviewQueueAdapter(
			vault(),
			() => DEFAULT_METADATA_SETTINGS,
		);

		expect(
			await adapter.query({
				date: '2026-08-11',
				limit: 20,
				kind: 'flashcard',
				search: 'memory',
			}),
		).toEqual([expect.objectContaining({ path: 'Cards/memory.md' })]);
	});

	it('declares missing and incompatible plugins as explicit Native fallback', async () => {
		const fallback = new NativeReviewQueueAdapter(
			vault(),
			() => DEFAULT_METADATA_SETTINGS,
		);
		const missing = new OptionalSpacedRepetitionAdapter(
			{ isInstalled: () => false },
			fallback,
		);
		const incompatible = new OptionalSpacedRepetitionAdapter(
			{ isInstalled: () => true },
			fallback,
		);

		expect(await missing.availability()).toEqual(
			expect.objectContaining({ status: 'fallback', fallbackAdapterId: fallback.id }),
		);
		const incompatibleAvailability = await incompatible.availability();
		expect(incompatibleAvailability.status).toBe('fallback');
		if (incompatibleAvailability.status === 'fallback') {
			expect(incompatibleAvailability.reason).toContain(
				'no compatible read capability',
			);
		}
	});

	it('uses a compatible capability and contains runtime failures with fallback', async () => {
		const fallback = new NativeReviewQueueAdapter(
			vault(),
			() => DEFAULT_METADATA_SETTINGS,
		);
		const queryDueItems = vi.fn(async () => [
			{ path: 'Plugin/card.md', title: 'Plugin card', kind: 'flashcard' as const, dueCount: 1, totalCount: 1 },
		]);
		const compatible = new OptionalSpacedRepetitionAdapter(
			{ isInstalled: () => true, queryDueItems },
			fallback,
		);

		expect(await compatible.availability()).toEqual({
			status: 'available',
			source: 'optional-plugin',
		});
		expect(await compatible.query({ date: '2026-08-11', limit: 2 })).toEqual([
			expect.objectContaining({ path: 'Plugin/card.md' }),
		]);

		const throwing = new OptionalSpacedRepetitionAdapter(
			{
				isInstalled: () => true,
				queryDueItems: async () => { throw new Error('stale plugin'); },
			},
			fallback,
		);
		expect(await throwing.query({ date: '2026-08-11', limit: 1 })).toEqual([
			expect.objectContaining({ path: 'Course/notes.md' }),
		]);

		const malformed = new OptionalSpacedRepetitionAdapter(
			{
				isInstalled: () => true,
				queryDueItems: async () => [{
					path: '../outside.md',
					title: '',
					kind: 'flashcard',
					dueCount: 4,
					totalCount: 1,
				}],
			},
			fallback,
		);
		expect(await malformed.query({ date: '2026-08-11', limit: 1 })).toEqual([
			expect.objectContaining({ path: 'Course/notes.md' }),
		]);
	});

	it('returns an empty immutable queue for an empty Vault', async () => {
		const adapter = new NativeReviewQueueAdapter(
			{
				listMarkdownFiles: () => [],
				frontmatter: () => null,
				readMarkdown: async () => '',
			},
			() => DEFAULT_METADATA_SETTINGS,
		);
		const items = await adapter.query({ date: '2026-08-11', limit: 20 });
		expect(items).toEqual([]);
		expect(Object.isFrozen(items)).toBe(true);
	});
});
