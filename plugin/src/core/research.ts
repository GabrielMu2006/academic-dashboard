import { PAPER_STATUSES, type PaperStatus } from './metadata-settings';
import type { PaperActionCapability } from './academic-notes';
import type { PaperWriteSettings } from './local-write-settings';

export type PaperStatusFilter = PaperStatus | 'unspecified' | 'all';

export interface ResearchPapersQuery {
	readonly limit: number;
	readonly status?: PaperStatusFilter;
	readonly search?: string;
	readonly year?: number;
}

export interface NormalizedResearchPapersQuery {
	readonly limit: number;
	readonly status: PaperStatusFilter;
	readonly search: string;
	readonly year?: number;
}

export function normalizeResearchPapersQuery(
	input: ResearchPapersQuery,
): NormalizedResearchPapersQuery {
	const limit =
		typeof input.limit === 'number' && Number.isFinite(input.limit)
			? Math.min(100, Math.max(1, Math.trunc(input.limit)))
			: 20;
	const status =
		input.status === 'unspecified' ||
		(PAPER_STATUSES as readonly string[]).includes(input.status ?? '')
			? (input.status as PaperStatusFilter)
			: 'all';
	const search = typeof input.search === 'string'
		? input.search.trim().toLocaleLowerCase().slice(0, 120)
		: '';
	const year =
		typeof input.year === 'number' &&
		Number.isInteger(input.year) &&
		input.year >= 1000 &&
		input.year <= 9999
			? input.year
			: undefined;
	return Object.freeze({
		limit,
		status,
		search,
		...(year === undefined ? {} : { year }),
	});
}

export function paperActionCapability(
	frontmatter: Readonly<Record<string, unknown>>,
	paperTypeField: string,
	paperTypeValue: string,
	readStatusField: string,
	writeSettings: PaperWriteSettings,
): PaperActionCapability {
	const statusValue = frontmatter[writeSettings.statusField];
	const status =
		writeSettings.statusField !== readStatusField
			? {
				state: 'unavailable' as const,
				field: writeSettings.statusField,
				reason: `Reading uses “${readStatusField}”, but writes are mapped to “${writeSettings.statusField}”.`,
			}
			: typeof statusValue === 'string' &&
				(PAPER_STATUSES as readonly string[]).includes(statusValue.trim())
				? {
					state: 'available' as const,
					field: writeSettings.statusField,
					current: statusValue.trim() as PaperStatus,
				}
				: {
					state: 'unavailable' as const,
					field: writeSettings.statusField,
					reason: `“${writeSettings.statusField}” must be unread, reading, or reviewed.`,
				};

	const favoriteValue = frontmatter[writeSettings.favoriteField];
	const favorite =
		favoriteValue === undefined || typeof favoriteValue === 'boolean'
			? {
				state: 'available' as const,
				field: writeSettings.favoriteField,
				current: favoriteValue === true,
				present: favoriteValue !== undefined,
			}
			: {
				state: 'unavailable' as const,
				field: writeSettings.favoriteField,
				current: false,
				present: true,
				reason: `“${writeSettings.favoriteField}” must be a YAML Boolean true or false.`,
			};

	return Object.freeze({
		identity: Object.freeze({ field: paperTypeField, value: paperTypeValue }),
		status: Object.freeze(status),
		favorite: Object.freeze(favorite),
	});
}
