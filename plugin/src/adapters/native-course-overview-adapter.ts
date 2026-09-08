import { adapterAvailable, type Availability, type DataAdapter } from '../core/data-adapter';
import type { MetadataSettings } from '../core/metadata-settings';
import type {
	CourseOverviewItem,
	CourseOverviewQuery,
	CourseOverviewResource,
	CourseOverviewResult,
} from '../core/course-overview';
import type { TaskWindow, TaskWindowQuery, TodayTaskItem } from '../core/calendar-tasks';
import type { ReviewQueueItem, ReviewQueueQuery } from '../core/review-queue';
import { isNativeVaultNotePath } from './native-vault-academic-adapters';

export interface CourseOverviewFile {
	readonly path: string;
	readonly extension: string;
}

export interface CourseOverviewVaultPort {
	listFiles(): readonly CourseOverviewFile[];
	frontmatter(path: string): Readonly<Record<string, unknown>> | null;
}

export interface NativeCourseOverviewOptions {
	readonly vault: CourseOverviewVaultPort;
	readonly tasks: DataAdapter<TaskWindowQuery, TaskWindow>;
	readonly reviews: DataAdapter<ReviewQueueQuery, readonly ReviewQueueItem[]>;
	readonly getMetadata: () => MetadataSettings;
	readonly getDailyNotePath: (date: string) => string;
}

interface MutableCourse {
	readonly id: string;
	readonly name: string;
	readonly term?: string;
	basis: 'metadata' | 'course-root';
	readonly notes: CourseOverviewResource[];
	readonly resources: CourseOverviewResource[];
	readonly tasks: TodayTaskItem[];
	readonly reviews: ReviewQueueItem[];
}

function text(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalized(value: string): string {
	return value.normalize('NFC').toLocaleLowerCase();
}

function rootCourse(path: string, rootFolder: string): string | undefined {
	const root = rootFolder.replace(/^\/+|\/+$/gu, '');
	const prefix = `${root}/`;
	if (!root || !path.startsWith(prefix)) return undefined;
	return path.slice(prefix.length).split('/')[0] || undefined;
}

export class NativeCourseOverviewAdapter
	implements DataAdapter<CourseOverviewQuery, CourseOverviewResult>
{
	readonly id = 'native-vault.course-overview';

	constructor(private readonly options: NativeCourseOverviewOptions) {}

	availability(): Promise<Availability> {
		return Promise.resolve(adapterAvailable('native-vault'));
	}

	async query(input: CourseOverviewQuery): Promise<CourseOverviewResult> {
		const metadata = this.options.getMetadata();
		const files = [...this.options.vault.listFiles()]
			.filter((file) => isNativeVaultNotePath(file.path))
			.sort((left, right) => left.path.localeCompare(right.path));
		const records = new Map<string, { file: CourseOverviewFile; frontmatter: Readonly<Record<string, unknown>> | null }>();
		const explicitTerms = new Map<string, Set<string>>();
		for (const file of files) {
			let frontmatter: Readonly<Record<string, unknown>> | null = null;
			if (file.extension.toLocaleLowerCase() === 'md') {
				try { frontmatter = this.options.vault.frontmatter(file.path); } catch { frontmatter = null; }
			}
			records.set(file.path, { file, frontmatter });
			const course = text(frontmatter?.[metadata.fields.course]);
			const term = text(frontmatter?.[metadata.fields.term]);
			if (course && term) {
				const terms = explicitTerms.get(normalized(course)) ?? new Set<string>();
				terms.add(term);
				explicitTerms.set(normalized(course), terms);
			}
		}

		const courses = new Map<string, MutableCourse>();
		let unresolvedCount = 0;
		const currentTerm = input.currentTerm.trim();
		const resolveIdentity = (path: string, frontmatter: Readonly<Record<string, unknown>> | null) => {
			const explicitCourse = text(frontmatter?.[metadata.fields.course]);
			const explicitTerm = text(frontmatter?.[metadata.fields.term]);
			if (explicitCourse) return { name: explicitCourse, term: explicitTerm, basis: 'metadata' as const };
			const folderCourse = rootCourse(path, input.rootFolder);
			if (!folderCourse) return null;
			const knownTerms = explicitTerms.get(normalized(folderCourse)) ?? new Set<string>();
			if (currentTerm && (knownTerms.size === 0 || [...knownTerms].some((term) => normalized(term) === normalized(currentTerm)))) {
				return { name: folderCourse, term: currentTerm, basis: 'course-root' as const };
			}
			if (knownTerms.size > 1) return null;
			return { name: folderCourse, term: [...knownTerms][0], basis: 'course-root' as const };
		};
		const getCourse = (identity: NonNullable<ReturnType<typeof resolveIdentity>>): MutableCourse | null => {
			if (currentTerm && (!identity.term || normalized(identity.term) !== normalized(currentTerm))) return null;
			const id = JSON.stringify([normalized(identity.name), normalized(identity.term ?? '')]);
			let course = courses.get(id);
			if (!course) {
				course = { id, name: identity.name, ...(identity.term ? { term: identity.term } : {}), basis: identity.basis, notes: [], resources: [], tasks: [], reviews: [] };
				courses.set(id, course);
			} else if (identity.basis === 'metadata') course.basis = 'metadata';
			return course;
		};

		for (const { file, frontmatter } of records.values()) {
			const identity = resolveIdentity(file.path, frontmatter);
			if (!identity) {
				if (rootCourse(file.path, input.rootFolder)) unresolvedCount += 1;
				continue;
			}
			const course = getCourse(identity);
			if (!course) continue;
			const resource = Object.freeze({ path: file.path, kind: file.extension.toLocaleLowerCase() === 'md' ? 'note' as const : 'file' as const, basis: identity.basis });
			if (frontmatter?.[metadata.fields.noteType] === metadata.values.courseNoteType) course.notes.push(resource);
			else course.resources.push(resource);
		}

		const taskWindow = await this.options.tasks.query({ date: input.date, futureDays: 7, limit: 100, dailyNotePath: this.options.getDailyNotePath(input.date) });
		for (const task of [...taskWindow.overdue, ...taskWindow.today, ...taskWindow.upcoming]) {
			const record = records.get(task.path);
			const identity = resolveIdentity(task.path, record?.frontmatter ?? null);
			if (!identity) continue;
			getCourse(identity)?.tasks.push(task);
		}
		const reviews = await this.options.reviews.query({ date: input.date, limit: 100 });
		for (const review of reviews) {
			const record = records.get(review.path);
			const identity = resolveIdentity(review.path, record?.frontmatter ?? null);
			if (!identity) continue;
			getCourse(identity)?.reviews.push(review);
		}

		const requestedLimit = Number.isFinite(input.limit) ? Math.trunc(input.limit) : 50;
		const limit = Math.min(50, Math.max(1, requestedLimit));
		const all = [...courses.values()].sort((left, right) =>
			(left.term ?? '').localeCompare(right.term ?? '') || left.name.localeCompare(right.name));
		const freeze = (course: MutableCourse): CourseOverviewItem => Object.freeze({
			...course,
			notes: Object.freeze(course.notes), resources: Object.freeze(course.resources),
			tasks: Object.freeze(course.tasks), reviews: Object.freeze(course.reviews),
		});
		return Object.freeze({
			courses: Object.freeze(all.slice(0, limit).map(freeze)),
			unresolvedCount,
			incomplete: all.length > limit,
		});
	}
}
