import type { MetadataSettings } from '../core/metadata-settings';
import {
	adapterAvailable,
	adapterFallback,
	type Availability,
	type DataAdapter,
} from '../core/data-adapter';
import {
	normalizeReviewQueueQuery,
	type ReviewQueueItem,
	type ReviewQueueQuery,
} from '../core/review-queue';
import {
	isNativeVaultNotePath,
	type NativeVaultPort,
	type VaultMarkdownFile,
} from './native-vault-academic-adapters';

export interface ReviewVaultPort extends NativeVaultPort {
	readMarkdown(path: string): Promise<string>;
}

export interface SpacedRepetitionPluginPort {
	isInstalled(): boolean;
	/** Present only when a reviewed, project-compatible read capability exists. */
	queryDueItems?: (query: ReviewQueueQuery) => Promise<readonly ReviewQueueItem[]>;
}

function stripFencedCode(markdown: string): string {
	const output: string[] = [];
	let fence: '`' | '~' | null = null;
	for (const line of markdown.split(/\r?\n/)) {
		const match = /^\s*(`{3,}|~{3,})/.exec(line);
		if (match) {
			const marker = match[1]?.[0];
			if (!fence) fence = marker === '~' ? '~' : '`';
			else if (marker === fence) fence = null;
			output.push('');
			continue;
		}
		output.push(fence ? '' : line);
	}
	return output.join('\n');
}

function normalizedTags(value: unknown): readonly string[] {
	const candidates = Array.isArray(value)
		? value
		: typeof value === 'string'
			? value.split(/[\s,]+/)
			: [];
	return candidates
		.filter((candidate): candidate is string => typeof candidate === 'string')
		.map((candidate) => candidate.trim().replace(/^#/, '').toLocaleLowerCase())
		.filter(Boolean);
}

function hasTag(
	markdown: string,
	frontmatter: Readonly<Record<string, unknown>> | null,
	tagField: string,
	tag: 'review' | 'flashcards',
): boolean {
	const mapped = normalizedTags(frontmatter?.[tagField]);
	if (mapped.some((candidate) => candidate === tag || candidate.startsWith(`${tag}/`))) {
		return true;
	}
	return new RegExp(`(^|\\s)#${tag}(?:/[\\w/-]+)?(?=\\s|$)`, 'imu').test(markdown);
}

const SCHEDULE_PATTERN = /<!--SR:!?(\d{4}-\d{2}-\d{2})[^>]*-->/gu;

interface ScheduleMarker {
	readonly date: string;
	readonly line: number;
}

function scheduleMarkers(markdown: string): readonly ScheduleMarker[] {
	return Object.freeze(
		markdown.split('\n').flatMap((line, index) =>
			[...line.matchAll(SCHEDULE_PATTERN)].flatMap((match) =>
				match[1] ? [Object.freeze({ date: match[1], line: index + 1 })] : [],
			),
		).sort((left, right) => left.date.localeCompare(right.date) || left.line - right.line),
	);
}

function countFlashcards(markdown: string): number {
	let count = 0;
	for (const line of markdown.split(/\r?\n/)) {
		if (/^\s*\?\??(?:\s*<!--SR:.*-->)?\s*$/u.test(line)) {
			count += 1;
			continue;
		}
		if (/^\s*\S.+?\s*:::{0,1}\s*\S.+$/u.test(line)) {
			count += 1;
			continue;
		}
		if (/==[^=\n]+==|\{\{[^{}\n]+\}\}/u.test(line)) count += 1;
	}
	return count;
}

function dueSummary(totalCount: number, dates: readonly string[], today: string) {
	const scheduledCount = Math.min(totalCount, dates.length);
	const unscheduledCount = Math.max(0, totalCount - scheduledCount);
	const dueCount = unscheduledCount + dates.filter((date) => date <= today).length;
	const nextDue = dates.find((date) => date > today);
	return { dueCount, ...(nextDue ? { nextDue } : {}) };
}

function matchesSearch(file: VaultMarkdownFile, search: string): boolean {
	return !search || `${file.basename}\n${file.path}`.toLocaleLowerCase().includes(search);
}

export class NativeReviewQueueAdapter
	implements DataAdapter<ReviewQueueQuery, readonly ReviewQueueItem[]>
{
	readonly id = 'native-vault.review-queue';

	constructor(
		private readonly vault: ReviewVaultPort,
		private readonly getMetadataSettings: () => MetadataSettings,
	) {}

	availability(): Promise<Availability> {
		return Promise.resolve(adapterAvailable('native-vault'));
	}

	async query(input: ReviewQueueQuery): Promise<readonly ReviewQueueItem[]> {
		const query = normalizeReviewQueueQuery(input);
		const tagField = this.getMetadataSettings().fields.tags;
		const items: ReviewQueueItem[] = [];
		const files = [...this.vault.listMarkdownFiles()]
			.filter((file) => isNativeVaultNotePath(file.path))
			.sort((left, right) => right.modifiedAt - left.modifiedAt || left.path.localeCompare(right.path));

		for (const file of files) {
			if (!matchesSearch(file, query.search)) continue;
			let markdown: string;
			try {
				markdown = stripFencedCode(await this.vault.readMarkdown(file.path));
			} catch {
				continue;
			}
			let frontmatter: Readonly<Record<string, unknown>> | null;
			try {
				frontmatter = this.vault.frontmatter(file.path);
			} catch {
				continue;
			}
			const markers = scheduleMarkers(markdown);
			const dates = markers.map(({ date }) => date);
			if (query.kind !== 'flashcard' && hasTag(markdown, frontmatter, tagField, 'review')) {
				const summary = dueSummary(1, dates.slice(0, 1), query.date);
				if (summary.dueCount > 0) {
					const marker = markers.length === 1 ? markers[0] : undefined;
					items.push(Object.freeze({
						path: file.path,
						title: file.basename,
						kind: 'note',
						totalCount: 1,
						...summary,
						...(marker
							? { reviewTarget: Object.freeze({ line: marker.line, currentDate: marker.date }) }
							: {}),
					}));
				}
			}
			if (query.kind !== 'note' && hasTag(markdown, frontmatter, tagField, 'flashcards')) {
				const totalCount = countFlashcards(markdown);
				const summary = dueSummary(totalCount, dates, query.date);
				if (totalCount > 0 && summary.dueCount > 0) {
					items.push(Object.freeze({
						path: file.path,
						title: file.basename,
						kind: 'flashcard',
						totalCount,
						...summary,
					}));
				}
			}
			if (items.length >= query.limit) break;
		}
		return Object.freeze(items.slice(0, query.limit));
	}
}

export class OptionalSpacedRepetitionAdapter
	implements DataAdapter<ReviewQueueQuery, readonly ReviewQueueItem[]>
{
	readonly id = 'spaced-repetition.review-queue';

	constructor(
		private readonly plugin: SpacedRepetitionPluginPort,
		private readonly fallback: DataAdapter<ReviewQueueQuery, readonly ReviewQueueItem[]>,
	) {}

	availability(): Promise<Availability> {
		if (typeof this.plugin.queryDueItems === 'function') {
			return Promise.resolve(adapterAvailable('optional-plugin'));
		}
		return Promise.resolve(
			adapterFallback(
				'optional-plugin',
				this.plugin.isInstalled()
					? 'Spaced Repetition is installed but exposes no compatible read capability.'
					: 'Spaced Repetition is not installed.',
				this.fallback.id,
			),
		);
	}

	async query(input: ReviewQueueQuery): Promise<readonly ReviewQueueItem[]> {
		if (typeof this.plugin.queryDueItems !== 'function') {
			return this.fallback.query(input);
		}
		try {
			const items: unknown = await this.plugin.queryDueItems(input);
			const normalized = normalizePluginReviewItems(items, input);
			return normalized ?? this.fallback.query(input);
		} catch {
			return this.fallback.query(input);
		}
	}
}

function normalizePluginReviewItems(
	input: unknown,
	queryInput: ReviewQueueQuery,
): readonly ReviewQueueItem[] | null {
	if (!Array.isArray(input)) return null;
	const query = normalizeReviewQueueQuery(queryInput);
	const items: ReviewQueueItem[] = [];
	for (const candidate of input) {
		if (typeof candidate !== 'object' || candidate === null) return null;
		const item = candidate as Partial<ReviewQueueItem>;
		if (
			typeof item.path !== 'string' ||
			!isNativeVaultNotePath(item.path) ||
			typeof item.title !== 'string' ||
			!item.title.trim() ||
			(item.kind !== 'note' && item.kind !== 'flashcard') ||
			typeof item.dueCount !== 'number' ||
			!Number.isInteger(item.dueCount) ||
			item.dueCount < 1 ||
			typeof item.totalCount !== 'number' ||
			!Number.isInteger(item.totalCount) ||
			item.totalCount < item.dueCount ||
			(item.nextDue !== undefined && !/^\d{4}-\d{2}-\d{2}$/u.test(item.nextDue))
		) {
			return null;
		}
		if (query.kind !== 'all' && item.kind !== query.kind) continue;
		if (
			query.search &&
			!`${item.title}\n${item.path}`.toLocaleLowerCase().includes(query.search)
		) {
			continue;
		}
		items.push(Object.freeze({
			path: item.path,
			title: item.title.trim(),
			kind: item.kind,
			dueCount: item.dueCount,
			totalCount: item.totalCount,
			...(item.nextDue ? { nextDue: item.nextDue } : {}),
		}));
		if (items.length >= query.limit) break;
	}
	return Object.freeze(items);
}
