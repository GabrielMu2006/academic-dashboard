import type { ReviewQueueItem } from './review-queue';

export type ReviewSessionLimit = 10 | 20;
export type ReviewSessionItemState = 'pending' | 'viewed' | 'skipped';
export interface ReviewSessionItem {
	readonly key: string;
	readonly item: ReviewQueueItem;
	readonly state: ReviewSessionItemState;
}
export interface ReviewSessionState {
	readonly limit: ReviewSessionLimit;
	readonly items: readonly ReviewSessionItem[];
}

export function reviewSessionKey(item: ReviewQueueItem): string {
	return JSON.stringify([item.path, item.kind]);
}

export function startReviewSession(items: readonly ReviewQueueItem[], limit: ReviewSessionLimit): ReviewSessionState {
	return Object.freeze({
		limit,
		items: Object.freeze(items.slice(0, limit).map((item) => Object.freeze({ key: reviewSessionKey(item), item, state: 'pending' as const }))),
	});
}

export function updateReviewSession(state: ReviewSessionState, key: string, action: 'view' | 'skip'): ReviewSessionState {
	return Object.freeze({
		...state,
		items: Object.freeze(state.items.map((entry) => entry.key === key
			? Object.freeze({ ...entry, state: action === 'view' ? 'viewed' as const : 'skipped' as const })
			: entry)),
	});
}
