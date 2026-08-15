import { describe, expect, it } from 'vitest';
import { NativeObsidianActivityAdapter } from '../../src/adapters/local-activity-adapters';
import type { NativeVaultPort } from '../../src/adapters/native-vault-academic-adapters';

describe('local activity adapters', () => {
	it('aggregates local Markdown modification dates without reading note content', async () => {
		const vault: NativeVaultPort = {
			listMarkdownFiles: () => [
				{
					path: 'node_modules/pkg/README.md',
					basename: 'README',
					modifiedAt: new Date(2026, 7, 11, 10).getTime(),
				},
				{
					path: 'A.md',
					basename: 'A',
					modifiedAt: new Date(2026, 7, 11, 8).getTime(),
				},
				{
					path: 'B.md',
					basename: 'B',
					modifiedAt: new Date(2026, 7, 11, 9).getTime(),
				},
				{
					path: 'C.md',
					basename: 'C',
					modifiedAt: new Date(2026, 7, 9, 9).getTime(),
				},
			],
			frontmatter: () => {
				throw new Error('Activity must not read frontmatter.');
			},
		};
		const adapter = new NativeObsidianActivityAdapter(vault);

		const result = await adapter.query({ endDate: '2026-08-11', days: 7 });

		expect(result.source).toBe('obsidian');
		expect(result.total).toBe(3);
		expect(result.days.at(-1)).toEqual({
			date: '2026-08-11',
			count: 2,
			intensity: 4,
		});
		expect(result.days.at(-3)).toEqual({
			date: '2026-08-09',
			count: 1,
			intensity: 2,
		});
	});
});
