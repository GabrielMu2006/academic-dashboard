import {
	adapterAvailable,
	type Availability,
	type DataAdapter,
} from '../core/data-adapter';
import {
	normalizeRecentNotesLimit,
	type RecentNoteItem,
	type RecentNotesQuery,
	type RecentPaperItem,
} from '../core/academic-notes';
import {
	normalizeResearchPapersQuery,
	paperActionCapability,
	type NormalizedResearchPapersQuery,
	type ResearchPapersQuery,
} from '../core/research';
import type { LocalWriteSettings } from '../core/local-write-settings';
import {
	PAPER_STATUSES,
	type MetadataSettings,
	type PaperStatus,
} from '../core/metadata-settings';

export interface VaultMarkdownFile {
	readonly path: string;
	readonly basename: string;
	readonly modifiedAt: number;
}

export interface NativeVaultPort {
	listMarkdownFiles(): readonly VaultMarkdownFile[];
	frontmatter(path: string): Readonly<Record<string, unknown>> | null;
}

const NON_NOTE_PATH_SEGMENTS = new Set(['node_modules']);

/**
 * Keep generated dependencies and hidden application data out of native note
 * queries when a development workspace happens to live inside the Vault.
 */
export function isNativeVaultNotePath(path: string): boolean {
	return path
		.split('/')
		.every(
			(segment) =>
				segment.length > 0 &&
				!NON_NOTE_PATH_SEGMENTS.has(segment) &&
				!segment.startsWith('.'),
		);
}

function recentFirst(
	left: VaultMarkdownFile,
	right: VaultMarkdownFile,
): number {
	return right.modifiedAt - left.modifiedAt || left.path.localeCompare(right.path);
}

function noteItem(file: VaultMarkdownFile, title = file.basename): RecentNoteItem {
	return Object.freeze({
		path: file.path,
		basename: file.basename,
		title,
		modifiedAt: file.modifiedAt,
	});
}

function mappedText(
	frontmatter: Readonly<Record<string, unknown>>,
	field: string,
): string | undefined {
	const value = frontmatter[field];
	if (typeof value !== 'string') return undefined;
	const normalized = value.trim();
	return normalized || undefined;
}

function mappedAuthors(
	frontmatter: Readonly<Record<string, unknown>>,
	field: string,
): readonly string[] {
	const value = frontmatter[field];
	const candidates = Array.isArray(value)
		? value
		: typeof value === 'string'
			? value.split(/[,;]/)
			: [];
	return Object.freeze(
		candidates
			.filter((candidate): candidate is string => typeof candidate === 'string')
			.map((candidate) => candidate.trim())
			.filter(Boolean),
	);
}

function mappedYear(
	frontmatter: Readonly<Record<string, unknown>>,
	field: string,
): number | undefined {
	const value = frontmatter[field];
	const year =
		typeof value === 'number'
			? value
			: typeof value === 'string' && /^\d{4}$/.test(value.trim())
				? Number(value.trim())
				: Number.NaN;
	return Number.isInteger(year) && year >= 1000 && year <= 9999 ? year : undefined;
}

function mappedStatus(
	frontmatter: Readonly<Record<string, unknown>>,
	field: string,
): PaperStatus | undefined {
	const value = mappedText(frontmatter, field);
	return value && (PAPER_STATUSES as readonly string[]).includes(value)
		? (value as PaperStatus)
		: undefined;
}

abstract class NativeVaultAdapter {
	availability(): Promise<Availability> {
		return Promise.resolve(adapterAvailable('native-vault'));
	}
}

export class NativeRecentNotesAdapter
	extends NativeVaultAdapter
	implements DataAdapter<RecentNotesQuery, readonly RecentNoteItem[]>
{
	readonly id = 'native-vault.recent-notes';

	constructor(private readonly vault: NativeVaultPort) {
		super();
	}

	query(input: RecentNotesQuery): Promise<readonly RecentNoteItem[]> {
		const limit = normalizeRecentNotesLimit(input.limit);
		const notes = [...this.vault.listMarkdownFiles()]
			.filter((file) => isNativeVaultNotePath(file.path))
			.sort(recentFirst)
			.slice(0, limit)
			.map((file) => noteItem(file));
		return Promise.resolve(Object.freeze(notes));
	}
}

export class NativeRecentPapersAdapter
	extends NativeVaultAdapter
	implements DataAdapter<ResearchPapersQuery, readonly RecentPaperItem[]>
{
	readonly id = 'native-vault.recent-papers';

	constructor(
		private readonly vault: NativeVaultPort,
		private readonly getMetadataSettings: () => MetadataSettings,
		private readonly getLocalWriteSettings: () => LocalWriteSettings,
	) {
		super();
	}

	query(input: ResearchPapersQuery): Promise<readonly RecentPaperItem[]> {
		const query = normalizeResearchPapersQuery(input);
		const metadata = this.getMetadataSettings();
		const writeSettings = this.getLocalWriteSettings().paper;
		const papers: RecentPaperItem[] = [];
		for (const file of [...this.vault.listMarkdownFiles()]
			.filter((candidate) => isNativeVaultNotePath(candidate.path))
			.sort(recentFirst)) {
			let frontmatter: Readonly<Record<string, unknown>> | null;
			try {
				frontmatter = this.vault.frontmatter(file.path);
			} catch {
				continue;
			}
			if (
				!frontmatter ||
				mappedText(frontmatter, metadata.fields.noteType) !==
					metadata.values.paperType
			) {
				continue;
			}
			const title = mappedText(frontmatter, metadata.fields.title) ?? file.basename;
			const year = mappedYear(frontmatter, metadata.fields.year);
			const status = mappedStatus(frontmatter, metadata.fields.status);
			const venue = mappedText(frontmatter, metadata.fields.venue);
			const doi = mappedText(frontmatter, metadata.fields.doi);
			const paper = Object.freeze({
					...noteItem(file, title),
					authors: mappedAuthors(frontmatter, metadata.fields.authors),
					...(year === undefined ? {} : { year }),
					...(status === undefined ? {} : { status }),
					...(venue === undefined ? {} : { venue }),
					...(doi === undefined ? {} : { doi }),
					actions: paperActionCapability(
						frontmatter,
						metadata.fields.noteType,
						metadata.values.paperType,
						metadata.fields.status,
						writeSettings,
					),
				});
			if (!paperMatchesQuery(paper, query)) continue;
			papers.push(paper);
			if (papers.length >= query.limit) break;
		}
		return Promise.resolve(Object.freeze(papers));
	}
}

function paperMatchesQuery(
	paper: RecentPaperItem,
	query: NormalizedResearchPapersQuery,
): boolean {
	if (query.status === 'unspecified' && paper.status !== undefined) return false;
	if (
		query.status !== 'all' &&
		query.status !== 'unspecified' &&
		paper.status !== query.status
	) {
		return false;
	}
	if (query.year !== undefined && paper.year !== query.year) return false;
	if (!query.search) return true;
	return [
		paper.title,
		paper.basename,
		paper.path,
		...paper.authors,
		paper.venue,
		paper.doi,
	]
		.filter((value): value is string => typeof value === 'string')
		.some((value) => value.toLocaleLowerCase().includes(query.search));
}
