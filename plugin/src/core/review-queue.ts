export const REVIEW_ITEM_KINDS = ['note', 'flashcard'] as const;
export type ReviewItemKind = (typeof REVIEW_ITEM_KINDS)[number];
export type ReviewKindFilter = ReviewItemKind | 'all';

export interface ReviewQueueQuery {
	/** Local ISO date used to decide whether a scheduled item is due. */
	readonly date: string;
	readonly limit: number;
	readonly kind?: ReviewKindFilter;
	readonly search?: string;
}

export interface ReviewQueueItem {
	readonly path: string;
	readonly title: string;
	readonly kind: ReviewItemKind;
	readonly dueCount: number;
	readonly totalCount: number;
	readonly nextDue?: string;
	/** Native-only exact marker. Optional-plugin results never receive a write target. */
	readonly reviewTarget?: Readonly<{
		readonly line: number;
		readonly currentDate: string;
	}>;
}

export interface ReviewDateChoice {
	readonly id: 'tomorrow' | 'three-days' | 'one-week' | 'one-month';
	readonly label: string;
	readonly date: string;
}

export interface NormalizedReviewQueueQuery {
	readonly date: string;
	readonly limit: number;
	readonly kind: ReviewKindFilter;
	readonly search: string;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function addCalendarDays(date: Date, days: number): string {
	const result = new Date(date);
	result.setDate(result.getDate() + days);
	const year = result.getFullYear();
	const month = `${result.getMonth() + 1}`.padStart(2, '0');
	const day = `${result.getDate()}`.padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function reviewDateChoices(today: Date): readonly ReviewDateChoice[] {
	const anchor = Number.isFinite(today.getTime()) ? today : new Date(0);
	return Object.freeze([
		Object.freeze({ id: 'tomorrow', label: 'Tomorrow', date: addCalendarDays(anchor, 1) }),
		Object.freeze({ id: 'three-days', label: 'In 3 days', date: addCalendarDays(anchor, 3) }),
		Object.freeze({ id: 'one-week', label: 'In 1 week', date: addCalendarDays(anchor, 7) }),
		Object.freeze({ id: 'one-month', label: 'In 30 days', date: addCalendarDays(anchor, 30) }),
	]);
}

export function normalizeReviewQueueQuery(
	input: ReviewQueueQuery,
): NormalizedReviewQueueQuery {
	const date = ISO_DATE_PATTERN.test(input.date) ? input.date : '1970-01-01';
	const limit =
		typeof input.limit === 'number' && Number.isFinite(input.limit)
			? Math.min(100, Math.max(1, Math.trunc(input.limit)))
			: 20;
	const kind =
		input.kind === 'note' || input.kind === 'flashcard' ? input.kind : 'all';
	const search = typeof input.search === 'string'
		? input.search.trim().toLocaleLowerCase().slice(0, 120)
		: '';
	return Object.freeze({ date, limit, kind, search });
}
