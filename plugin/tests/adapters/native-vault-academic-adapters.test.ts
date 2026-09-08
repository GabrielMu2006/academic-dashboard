import { describe, expect, it } from 'vitest';
import {
	NativeRecentNotesAdapter,
	NativeRecentPapersAdapter,
	type NativeVaultPort,
} from '../../src/adapters/native-vault-academic-adapters';
import { DEFAULT_METADATA_SETTINGS } from '../../src/core/metadata-settings';
import { DEFAULT_LOCAL_WRITE_SETTINGS } from '../../src/core/local-write-settings';

function port(): NativeVaultPort {
	const frontmatter: Record<string, Readonly<Record<string, unknown>>> = {
		'Papers/older.md': {
			type: 'paper',
			title: 'Older paper',
			authors: ['Ada', 'Grace'],
			year: '2024',
			status: 'reviewed',
			venue: 'CHI',
			doi: '10.1000/example',
			tags: ['ml', 'systems'],
			related: ['[[Papers/linked]]', '[[Notes/course]]'],
		},
		'Papers/linked.md': { type: 'paper', title: 'Linked paper', authors: ['Turing'], year: 2025, status: 'unread', tags: ['ml'] },
		'Papers/newer.md': {
			kind: 'literature',
			name: 'Mapped paper',
			creators: 'Lin; Sam',
			published: 2026,
			progress: 'reading',
		},
		'Notes/course.md': { type: 'course-note', course: 'CS101' },
	};
	return {
		listMarkdownFiles: () => [
			{ path: 'node_modules/pkg/README.md', basename: 'README', modifiedAt: 99 },
			{ path: '.private/scratch.md', basename: 'scratch', modifiedAt: 98 },
			{ path: 'Papers/older.md', basename: 'older', modifiedAt: 10 },
			{ path: 'Notes/course.md', basename: 'course', modifiedAt: 30 },
			{ path: 'Papers/newer.md', basename: 'newer', modifiedAt: 20 },
			{ path: 'Papers/linked.md', basename: 'linked', modifiedAt: 5 },
		],
		frontmatter: (path) => frontmatter[path] ?? null,
	};
}

describe('Native Vault academic adapters', () => {
	it('returns recent Markdown notes in modified order with a bounded limit', async () => {
		const adapter = new NativeRecentNotesAdapter(port());

		expect(await adapter.availability()).toEqual({
			status: 'available',
			source: 'native-vault',
		});
		expect((await adapter.query({ limit: 2 })).map(({ path }) => path)).toEqual([
			'Notes/course.md',
			'Papers/newer.md',
		]);
		expect(await adapter.query({ limit: 0 })).toHaveLength(1);
	});

	it('identifies papers only through the configured field and value mapping', async () => {
		const adapter = new NativeRecentPapersAdapter(port(), () => ({
			fields: {
				...DEFAULT_METADATA_SETTINGS.fields,
				noteType: 'kind',
				title: 'name',
				authors: 'creators',
				year: 'published',
				status: 'progress',
			},
			values: { courseNoteType: 'class', paperType: 'literature' },
		}), () => ({
			...DEFAULT_LOCAL_WRITE_SETTINGS,
			paper: { statusField: 'progress', favoriteField: 'starred' },
		}));

		const papers = await adapter.query({ limit: 8 });

		expect(papers).toHaveLength(1);
		expect(papers[0]).toMatchObject({
			path: 'Papers/newer.md',
			title: 'Mapped paper',
			authors: ['Lin', 'Sam'],
			year: 2026,
			status: 'reading',
		});
		expect(papers[0]?.actions.status).toMatchObject({
			state: 'available',
			current: 'reading',
		});
		expect(papers[0]?.actions.favorite).toMatchObject({
			state: 'available',
			current: false,
		});
	});

	it('falls back to the basename and omits malformed optional paper metadata', async () => {
		const malformed: NativeVaultPort = {
			listMarkdownFiles: () => [
				{ path: 'Papers/test.md', basename: 'test', modifiedAt: 5 },
			],
			frontmatter: () => ({
				type: 'paper',
				title: 42,
				authors: ['Valid', 9, '  '],
				year: 'twenty',
				status: 'finished',
			}),
		};
		const adapter = new NativeRecentPapersAdapter(
			malformed,
			() => DEFAULT_METADATA_SETTINGS,
			() => DEFAULT_LOCAL_WRITE_SETTINGS,
		);

		const paper = (await adapter.query({ limit: 8 }))[0];

		expect(paper).toEqual(expect.objectContaining({
			path: 'Papers/test.md',
			basename: 'test',
			title: 'test',
			modifiedAt: 5,
			authors: ['Valid'],
		}));
	});

	it('returns an empty result when no note matches the recommended paper schema', async () => {
		const adapter = new NativeRecentPapersAdapter(
			port(),
			() => ({
				...DEFAULT_METADATA_SETTINGS,
				values: { courseNoteType: 'course-note', paperType: 'article' },
			}),
			() => DEFAULT_LOCAL_WRITE_SETTINGS,
		);

		expect(await adapter.query({ limit: 8 })).toEqual([]);
	});

	it('filters mapped papers by status, year, and searchable details', async () => {
		const adapter = new NativeRecentPapersAdapter(
			port(),
			() => DEFAULT_METADATA_SETTINGS,
			() => DEFAULT_LOCAL_WRITE_SETTINGS,
		);

		expect(
			await adapter.query({
				limit: 8,
				status: 'reviewed',
				year: 2024,
				search: '10.1000',
			}),
		).toEqual([
			expect.objectContaining({
				path: 'Papers/older.md',
				doi: '10.1000/example',
			}),
		]);
		expect(await adapter.query({ limit: 8, status: 'unspecified' })).toEqual([]);
		const tagged = await adapter.query({ limit: 8, tags: ['#ML'] });
		expect(tagged.map(({ path }) => path)).toEqual(['Papers/older.md', 'Papers/linked.md']);
		expect(tagged[0]?.relations).toEqual([
			{ path: 'Papers/linked.md', title: 'Linked paper', basis: 'explicit-link', detail: 'related' },
			{ path: 'Notes/course.md', title: 'course', basis: 'explicit-link', detail: 'related' },
		]);
		expect(tagged[1]?.relations).toEqual([
			{ path: 'Papers/older.md', title: 'Older paper', basis: 'shared-tag', detail: 'ml' },
		]);
	});
});
