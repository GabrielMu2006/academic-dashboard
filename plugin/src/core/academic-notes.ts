import type { PaperStatus } from './metadata-settings';

export interface RecentNotesQuery {
	readonly limit: number;
}

export interface RecentNoteItem {
	readonly path: string;
	readonly basename: string;
	readonly title: string;
	readonly modifiedAt: number;
}

export interface RecentPaperItem extends RecentNoteItem {
	readonly authors: readonly string[];
	readonly year?: number;
	readonly status?: PaperStatus;
	readonly venue?: string;
	readonly doi?: string;
	readonly actions: PaperActionCapability;
}

export interface PaperActionAvailability {
	readonly state: 'available' | 'unavailable';
	readonly field: string;
	readonly reason?: string;
}

export interface PaperActionCapability {
	readonly identity: {
		readonly field: string;
		readonly value: string;
	};
	readonly status: PaperActionAvailability & {
		readonly current?: PaperStatus;
	};
	readonly favorite: PaperActionAvailability & {
		readonly current: boolean;
		readonly present: boolean;
	};
}

export function normalizeRecentNotesLimit(limit: unknown): number {
	if (typeof limit !== 'number' || !Number.isFinite(limit)) return 5;
	return Math.min(50, Math.max(1, Math.trunc(limit)));
}
