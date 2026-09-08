import type { TodayTaskItem } from './calendar-tasks';
import type { ReviewQueueItem } from './review-queue';

export interface CourseOverviewQuery {
	readonly date: string;
	readonly rootFolder: string;
	readonly currentTerm: string;
	readonly limit: number;
}

export interface CourseOverviewResource {
	readonly path: string;
	readonly kind: 'note' | 'file';
	readonly basis: 'metadata' | 'course-root';
}

export interface CourseOverviewItem {
	readonly id: string;
	readonly name: string;
	readonly term?: string;
	readonly basis: 'metadata' | 'course-root';
	readonly notes: readonly CourseOverviewResource[];
	readonly resources: readonly CourseOverviewResource[];
	readonly tasks: readonly TodayTaskItem[];
	readonly reviews: readonly ReviewQueueItem[];
}

export interface CourseOverviewResult {
	readonly courses: readonly CourseOverviewItem[];
	readonly unresolvedCount: number;
	readonly incomplete: boolean;
}
