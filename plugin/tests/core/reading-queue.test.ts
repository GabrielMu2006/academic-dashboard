import { describe, expect, it } from 'vitest';
import { mergeReadingQueue, readingSignature, validateReadingProgressRecords, type ReadingMaterial, type ReadingProgressRecord } from '../../src/core/reading-queue';

const book = (path: string, edition: string, stableId?: string): ReadingMaterial => {
	const base = { path, kind: 'book' as const, title: 'Systems', authors: ['A. Writer'], year: 2025, edition, ...(stableId ? { stableId } : {}) };
	return { ...base, signature: readingSignature(base) };
};

function record(material: ReadingMaterial, path = material.path): ReadingProgressRecord {
	return { path, kind: material.kind, status: 'reading', order: 2, nextStep: 'Chapter 4 exercises', position: '83', positionUnit: 'page', ...(material.stableId ? { stableId: material.stableId } : {}), signature: material.signature };
}

describe('reading queue records', () => {
	it('validates bounded plugin-side records without note content', () => {
		const material = book('Reading/Systems.md', '2');
		const result = validateReadingProgressRecords([record(material)]);
		expect(result.ok).toBe(true);
		if (result.ok) expect(Object.isFrozen(result.value[0])).toBe(true);
	});

	it('rejects duplicate paths and invalid position units', () => {
		const material = book('Reading/Systems.md', '2');
		const result = validateReadingProgressRecords([record(material), { ...record(material), positionUnit: 'percent' }]);
		expect(result.ok).toBe(false);
	});

	it('reconnects a renamed note by a unique stable ID', () => {
		const before = book('Reading/Old.md', '2', 'book-42');
		const after = book('Reading/New.md', '2', 'book-42');
		const [item] = mergeReadingQueue([after], [record(before)]);
		expect(item).toMatchObject({ path: 'Reading/New.md', association: 'stable-id', position: '83' });
	});

	it('does not merge editions by title or use an ambiguous signature', () => {
		const first = book('Reading/First.md', '1');
		const second = book('Reading/Second.md', '2');
		const renamedCopy = book('Reading/Copy.md', '1');
		const items = mergeReadingQueue([first, second, renamedCopy], [record(first, 'Reading/Old.md')]);
		expect(items.find(({ path }) => path === second.path)?.association).toBe('untracked');
		expect(items.filter(({ position }) => position === '83')).toHaveLength(0);
	});
});
