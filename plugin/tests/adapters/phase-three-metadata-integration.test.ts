import { describe, expect, it } from 'vitest';
import {
	NativeRecentPapersAdapter,
	type NativeVaultPort,
} from '../../src/adapters/native-vault-academic-adapters';
import {
	DEFAULT_METADATA_SETTINGS,
	type MetadataSettings,
} from '../../src/core/metadata-settings';
import { DEFAULT_LOCAL_WRITE_SETTINGS } from '../../src/core/local-write-settings';

const mappings: readonly {
	readonly name: string;
	readonly settings: MetadataSettings;
	readonly frontmatter: Readonly<Record<string, unknown>>;
}[] = [
	{
		name: 'recommended',
		settings: DEFAULT_METADATA_SETTINGS,
		frontmatter: {
			type: 'paper',
			title: 'Recommended schema',
			authors: ['Ada'],
			status: 'unread',
		},
	},
	{
		name: 'literature workflow',
		settings: {
			fields: {
				...DEFAULT_METADATA_SETTINGS.fields,
				noteType: 'kind',
				title: 'name',
				authors: 'creators',
				year: 'published',
				status: 'progress',
				venue: 'publication',
				doi: 'identifier',
			},
			values: { courseNoteType: 'class', paperType: 'literature' },
		},
		frontmatter: {
			kind: 'literature',
			name: 'Mapped literature',
			creators: 'Lin; Sam',
			published: '2025',
			progress: 'reviewed',
			publication: 'UIST',
			identifier: '10.1000/mapped',
		},
	},
	{
		name: 'localized fields',
		settings: {
			fields: {
				...DEFAULT_METADATA_SETTINGS.fields,
				noteType: '类别',
				title: '题目',
				authors: '作者',
				status: '进度',
			},
			values: { courseNoteType: '课程', paperType: '论文' },
		},
		frontmatter: {
			类别: '论文',
			题目: '本地化字段',
			作者: ['甲', '乙'],
			进度: 'reading',
		},
	},
];

describe('Phase 3 metadata integration', () => {
	for (const mapping of mappings) {
		it(`reads the ${mapping.name} mapping without Vault migration`, async () => {
			const path = `Papers/${mapping.name}.md`;
			const port: NativeVaultPort = {
				listMarkdownFiles: () => [{ path, basename: mapping.name, modifiedAt: 1 }],
				frontmatter: () => mapping.frontmatter,
			};
			const before = JSON.stringify(mapping.frontmatter);
			const items = await new NativeRecentPapersAdapter(
				port,
				() => mapping.settings,
				() => ({
					...DEFAULT_LOCAL_WRITE_SETTINGS,
					paper: {
						...DEFAULT_LOCAL_WRITE_SETTINGS.paper,
						statusField: mapping.settings.fields.status,
					},
				}),
			).query({ limit: 8 });

			expect(items).toHaveLength(1);
			expect(items[0]?.path).toBe(path);
			expect(JSON.stringify(mapping.frontmatter)).toBe(before);
		});
	}

	it('skips a metadata-cache race and continues with valid records', async () => {
		const port: NativeVaultPort = {
			listMarkdownFiles: () => [
				{ path: 'Papers/broken.md', basename: 'broken', modifiedAt: 2 },
				{ path: 'Papers/valid.md', basename: 'valid', modifiedAt: 1 },
			],
			frontmatter: (path) => {
				if (path.endsWith('broken.md')) throw new Error('stale cache');
				return { type: 'paper', title: 'Still visible', status: { bad: true } };
			},
		};
		const items = await new NativeRecentPapersAdapter(
			port,
			() => DEFAULT_METADATA_SETTINGS,
			() => DEFAULT_LOCAL_WRITE_SETTINGS,
		).query({ limit: 8 });
		expect(items).toEqual([
			expect.objectContaining({ path: 'Papers/valid.md', title: 'Still visible' }),
		]);
	});
});
