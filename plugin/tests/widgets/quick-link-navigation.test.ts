import { describe, expect, it, vi } from 'vitest';
import { revealFolderInExplorer } from '../../src/widgets/quick-link-navigation';

describe('quick-link folder navigation', () => {
	it('reveals a deferred file explorer before locating the folder', async () => {
		const folder = { path: 'Course' };
		const revealInFolder = vi.fn(async () => undefined);
		const setCollapsed = vi.fn();
		const leaf: { view: unknown } = { view: { type: 'deferred' } };
		const revealLeaf = vi.fn(async () => {
			leaf.view = {
				revealInFolder,
				fileItems: { Course: { setCollapsed } },
			};
		});

		await expect(
			revealFolderInExplorer(leaf, revealLeaf, folder, 'Course'),
		).resolves.toBe(true);
		expect(revealLeaf).toHaveBeenCalledWith(leaf);
		expect(revealInFolder).toHaveBeenCalledWith(folder);
		expect(setCollapsed).toHaveBeenCalledWith(false);
		expect(revealLeaf.mock.invocationCallOrder[0]).toBeLessThan(
			revealInFolder.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
		);
		expect(revealInFolder.mock.invocationCallOrder[0]).toBeLessThan(
			setCollapsed.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
		);
	});

	it('keeps folder navigation working when expansion is unsupported', async () => {
		const revealInFolder = vi.fn(async () => undefined);
		const leaf = { view: { revealInFolder } };

		await expect(
			revealFolderInExplorer(
				leaf,
				vi.fn(async () => undefined),
				{},
				'Course',
			),
		).resolves.toBe(true);
		expect(revealInFolder).toHaveBeenCalledOnce();
	});

	it('reports an unavailable explorer after revealing the leaf', async () => {
		const leaf = { view: { type: 'unsupported' } };

		await expect(
			revealFolderInExplorer(
				leaf,
				vi.fn(async () => undefined),
				{},
				'Course',
			),
		).resolves.toBe(false);
	});
});
