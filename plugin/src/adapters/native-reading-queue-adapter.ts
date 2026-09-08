import { adapterAvailable, type Availability, type DataAdapter } from '../core/data-adapter';
import type { MetadataSettings } from '../core/metadata-settings';
import { mergeReadingQueue, readingSignature, type ReadingKind, type ReadingMaterial, type ReadingProgressRecord, type ReadingQueueItem, type ReadingStatus } from '../core/reading-queue';
import { isNativeVaultNotePath, type NativeVaultPort } from './native-vault-academic-adapters';

export interface ReadingQueueQuery {
	readonly records: readonly ReadingProgressRecord[];
	readonly kind?: ReadingKind | 'all';
	readonly status?: ReadingStatus | 'all';
	readonly limit: number;
}

const mappedText = (frontmatter: Readonly<Record<string, unknown>>, field: string): string | undefined => {
	const value = frontmatter[field];
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

function authors(frontmatter: Readonly<Record<string, unknown>>, field: string): readonly string[] {
	const value = frontmatter[field];
	const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,;]/u) : [];
	return Object.freeze(values.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean));
}

function year(frontmatter: Readonly<Record<string, unknown>>, field: string): number | undefined {
	const value = frontmatter[field];
	const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : Number.NaN;
	return Number.isInteger(parsed) && parsed >= 1000 && parsed <= 9999 ? parsed : undefined;
}

export class NativeReadingQueueAdapter implements DataAdapter<ReadingQueueQuery, readonly ReadingQueueItem[]> {
	readonly id = 'native-vault.reading-queue';
	constructor(private readonly vault: NativeVaultPort, private readonly getMetadata: () => MetadataSettings) {}
	availability(): Promise<Availability> { return Promise.resolve(adapterAvailable('native-vault')); }

	query(input: ReadingQueueQuery): Promise<readonly ReadingQueueItem[]> {
		const metadata = this.getMetadata();
		const materials: ReadingMaterial[] = [];
		for (const file of this.vault.listMarkdownFiles()) {
			if (!isNativeVaultNotePath(file.path)) continue;
			let frontmatter: Readonly<Record<string, unknown>> | null;
			try { frontmatter = this.vault.frontmatter(file.path); } catch { continue; }
			if (!frontmatter) continue;
			const type = mappedText(frontmatter, metadata.fields.noteType);
			const kind: ReadingKind | null = type === metadata.values.paperType ? 'paper' : type === (metadata.values.bookType ?? 'book-note') ? 'book' : null;
			if (!kind) continue;
			const title = mappedText(frontmatter, metadata.fields.title) ?? file.basename;
			const mappedAuthors = authors(frontmatter, metadata.fields.authors);
			const mappedYear = year(frontmatter, metadata.fields.year);
			const edition = kind === 'book' ? mappedText(frontmatter, metadata.fields.edition) : undefined;
			const stableId = mappedText(frontmatter, metadata.fields.readingId);
			const mappedSourceStatus = mappedText(frontmatter, metadata.fields.status);
			const sourceStatus = kind === 'paper'
				? mappedSourceStatus === 'unread' ? 'to-read' as const : mappedSourceStatus === 'reading' ? 'reading' as const : mappedSourceStatus === 'reviewed' ? 'completed' as const : undefined
				: mappedSourceStatus === 'to-read' || mappedSourceStatus === 'reading' || mappedSourceStatus === 'completed' ? mappedSourceStatus : undefined;
			const identity = { kind, title, authors: mappedAuthors, ...(mappedYear ? { year: mappedYear } : {}), ...(edition ? { edition } : {}) };
			materials.push(Object.freeze({ path: file.path, ...identity, ...(stableId ? { stableId } : {}), signature: readingSignature(identity), ...(sourceStatus ? { sourceStatus } : {}) }));
		}
		const requestedLimit = Number.isFinite(input.limit) ? Math.trunc(input.limit) : 50;
		const limit = Math.min(100, Math.max(1, requestedLimit));
		return Promise.resolve(Object.freeze(mergeReadingQueue(materials, input.records)
			.filter((item) => (!input.kind || input.kind === 'all' || item.kind === input.kind) && (!input.status || input.status === 'all' || item.status === input.status))
			.slice(0, limit)));
	}
}
