import { describe, expect, it } from 'vitest';
import { NativeReadingQueueAdapter } from '../../src/adapters/native-reading-queue-adapter';
import { DEFAULT_METADATA_SETTINGS } from '../../src/core/metadata-settings';
import { readingSignature } from '../../src/core/reading-queue';

const files = [
	{ path: 'Paper/One.md', basename: 'One', modifiedAt: 2 },
	{ path: 'Reading/Systems-2.md', basename: 'Systems-2', modifiedAt: 1 },
	{ path: 'Reading/Systems-3.md', basename: 'Systems-3', modifiedAt: 3 },
];
const frontmatter: Record<string, Record<string, unknown>> = {
	'Paper/One.md': { type: 'paper', title: 'One', authors: ['P'], year: 2026, status: 'reviewed', 'reading-id': 'paper-1' },
	'Reading/Systems-2.md': { type: 'book-note', title: 'Systems', authors: ['A'], year: 2025, edition: '2', status: 'reading' },
	'Reading/Systems-3.md': { type: 'book-note', title: 'Systems', authors: ['A'], year: 2025, edition: '3' },
};

describe('NativeReadingQueueAdapter', () => {
	it('keeps papers and book editions separate and maps paper status read-only', async () => {
		const adapter = new NativeReadingQueueAdapter({ listMarkdownFiles: () => files, frontmatter: (path) => frontmatter[path] ?? null }, () => DEFAULT_METADATA_SETTINGS);
		const result = await adapter.query({ records: [], kind: 'all', status: 'all', limit: 20 });
		expect(result).toHaveLength(3);
		expect(result.find(({ kind }) => kind === 'paper')?.status).toBe('completed');
		expect(result.find(({ path }) => path === 'Reading/Systems-2.md')?.status).toBe('reading');
		expect(new Set(result.filter(({ kind }) => kind === 'book').map(({ signature }) => signature)).size).toBe(2);
	});

	it('reconnects renamed plugin progress without changing source paper status', async () => {
		const adapter = new NativeReadingQueueAdapter({ listMarkdownFiles: () => files, frontmatter: (path) => frontmatter[path] ?? null }, () => DEFAULT_METADATA_SETTINGS);
		const signature = readingSignature({ kind: 'paper', title: 'One', authors: ['P'], year: 2026 });
		const result = await adapter.query({ records: [{ path: 'Paper/Old.md', kind: 'paper', status: 'reading', order: 0, nextStep: 'Check proof', position: 'methods', positionUnit: 'stage', stableId: 'paper-1', signature }], kind: 'paper', limit: 20 });
		expect(result[0]).toMatchObject({ path: 'Paper/One.md', status: 'reading', association: 'stable-id', nextStep: 'Check proof' });
		expect(frontmatter['Paper/One.md']?.status).toBe('reviewed');
	});
});
