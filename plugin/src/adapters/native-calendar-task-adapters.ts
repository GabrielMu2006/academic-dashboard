import {
	adapterAvailable,
	adapterFallback,
	type Availability,
	type DataAdapter,
} from '../core/data-adapter';
import {
	isIsoDate,
	normalizeTaskLimit,
	toIsoDate,
	type CalendarDay,
	type CalendarMonth,
	type CalendarMonthQuery,
	type TodayTaskItem,
	type TodayTasksQuery,
} from '../core/calendar-tasks';
import { isRecord } from '../core/validation';
import {
	isNativeVaultNotePath,
	type NativeVaultPort,
	type VaultMarkdownFile,
} from './native-vault-academic-adapters';

export interface NativeMarkdownTaskPort {
	listMarkdownFiles(): readonly VaultMarkdownFile[];
	readMarkdown(path: string): Promise<string>;
}

export interface TasksPluginQueryPort {
	isInstalled(): boolean;
	queryToday?: (date: string, limit: number) => Promise<unknown>;
}

function normalizeOptionalTaskItems(
	input: unknown,
	limit: number,
): readonly TodayTaskItem[] | null {
	if (!Array.isArray(input) || input.length > limit) return null;
	const items: TodayTaskItem[] = [];
	for (const candidate of input) {
		if (
			!isRecord(candidate) ||
			!('path' in candidate) ||
			typeof candidate.path !== 'string' ||
			!isNativeVaultNotePath(candidate.path) ||
			!('line' in candidate) ||
			typeof candidate.line !== 'number' ||
			!Number.isInteger(candidate.line) ||
			candidate.line < 1 ||
			!('text' in candidate) ||
			typeof candidate.text !== 'string' ||
			candidate.text.trim().length === 0 ||
			candidate.text.length > 1_000 ||
			('dueDate' in candidate &&
				candidate.dueDate !== undefined &&
				!isIsoDate(candidate.dueDate))
		) {
			return null;
		}
		items.push(
			Object.freeze({
				path: candidate.path,
				line: candidate.line,
				text: candidate.text.trim(),
				...('dueDate' in candidate && typeof candidate.dueDate === 'string'
					? { dueDate: candidate.dueDate }
					: {}),
			}),
		);
	}
	return Object.freeze(items);
}

abstract class NativePlanningAdapter {
	availability(): Promise<Availability> {
		return Promise.resolve(adapterAvailable('native-vault'));
	}
}

export class NativeCalendarAdapter
	extends NativePlanningAdapter
	implements DataAdapter<CalendarMonthQuery, CalendarMonth>
{
	readonly id = 'native-vault.calendar';

	constructor(private readonly vault: NativeVaultPort) {
		super();
	}

	query(input: CalendarMonthQuery): Promise<CalendarMonth> {
		const year = Math.trunc(input.year);
		const month = Math.trunc(input.month);
		if (year < 1 || year > 9999 || month < 1 || month > 12) {
			return Promise.reject(new Error('Calendar query is outside the supported range.'));
		}
		const pathsByDate = new Map<string, string[]>();
		for (const file of this.vault.listMarkdownFiles()) {
			if (!isNativeVaultNotePath(file.path)) continue;
			if (!isIsoDate(file.basename)) continue;
			const paths = pathsByDate.get(file.basename) ?? [];
			paths.push(file.path);
			pathsByDate.set(file.basename, paths);
		}
		const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
		const days: CalendarDay[] = [];
		for (let day = 1; day <= dayCount; day += 1) {
			const date = toIsoDate(year, month, day);
			days.push(
				Object.freeze({
					date,
					day,
					notePaths: Object.freeze([...(pathsByDate.get(date) ?? [])].sort()),
				}),
			);
		}
		return Promise.resolve(
			Object.freeze({
				year,
				month,
				startsOn: new Date(Date.UTC(year, month - 1, 1)).getUTCDay(),
				days: Object.freeze(days),
			}),
		);
	}
}

const UNCHECKED_TASK_PATTERN = /^\s*[-*+]\s+\[\s\]\s+(.+?)\s*$/;
const DUE_DATE_PATTERNS = [
	/📅\s*(\d{4}-\d{2}-\d{2})/u,
	/\bdue::\s*(\d{4}-\d{2}-\d{2})\b/iu,
] as const;
const FENCE_PATTERN = /^\s*(```|~~~)/;

function parseDueDate(text: string): string | undefined {
	for (const pattern of DUE_DATE_PATTERNS) {
		const value = pattern.exec(text)?.[1];
		if (value && isIsoDate(value)) return value;
	}
	return undefined;
}

function cleanTaskText(text: string): string {
	return text
		.replace(/\s*📅\s*\d{4}-\d{2}-\d{2}\s*/gu, ' ')
		.replace(/\s*\bdue::\s*\d{4}-\d{2}-\d{2}\b\s*/giu, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function parseTodayTasks(
	path: string,
	content: string,
	date: string,
	isDailyNote: boolean,
): readonly TodayTaskItem[] {
	const tasks: TodayTaskItem[] = [];
	let fence: string | null = null;
	for (const [index, line] of content.split(/\r?\n/).entries()) {
		const fenceMatch = FENCE_PATTERN.exec(line)?.[1];
		if (fenceMatch) {
			fence = fence === null ? fenceMatch : fence === fenceMatch ? null : fence;
			continue;
		}
		if (fence !== null) continue;
		const text = UNCHECKED_TASK_PATTERN.exec(line)?.[1];
		if (!text) continue;
		const dueDate = parseDueDate(text);
		if (dueDate !== date && !(isDailyNote && dueDate === undefined)) continue;
		const cleaned = cleanTaskText(text);
		if (!cleaned) continue;
		tasks.push(
			Object.freeze({
				path,
				line: index + 1,
				text: cleaned,
				...(dueDate ? { dueDate } : {}),
			}),
		);
	}
	return Object.freeze(tasks);
}

export class NativeTodayTasksAdapter
	extends NativePlanningAdapter
	implements DataAdapter<TodayTasksQuery, readonly TodayTaskItem[]>
{
	readonly id = 'native-vault.today-tasks';

	constructor(private readonly vault: NativeMarkdownTaskPort) {
		super();
	}

	async query(input: TodayTasksQuery): Promise<readonly TodayTaskItem[]> {
		if (!isIsoDate(input.date)) throw new Error('Today Tasks requires a valid date.');
		const limit = normalizeTaskLimit(input.limit);
		const files = [...this.vault.listMarkdownFiles()]
			.filter((file) => isNativeVaultNotePath(file.path))
			.sort((left, right) => right.modifiedAt - left.modifiedAt);
		const tasks: TodayTaskItem[] = [];
		for (const file of files) {
			let content: string;
			try {
				content = await this.vault.readMarkdown(file.path);
			} catch {
				continue;
			}
			tasks.push(
				...parseTodayTasks(file.path, content, input.date, file.basename === input.date),
			);
			if (tasks.length >= limit) break;
		}
		return Object.freeze(tasks.slice(0, limit));
	}
}

export class OptionalTasksPluginAdapter
	implements DataAdapter<TodayTasksQuery, readonly TodayTaskItem[]>
{
	readonly id = 'optional-tasks.today-tasks';

	constructor(
		private readonly plugin: TasksPluginQueryPort,
		private readonly nativeFallback: NativeTodayTasksAdapter,
	) {}

	availability(): Promise<Availability> {
		if (!this.plugin.isInstalled()) {
			return Promise.resolve(
				adapterFallback(
					'optional-plugin',
					'Tasks is not installed; using Native Markdown tasks.',
					this.nativeFallback.id,
				),
			);
		}
		if (!this.plugin.queryToday) {
			return Promise.resolve(
				adapterFallback(
					'optional-plugin',
					'Tasks does not expose a compatible read API; using Native Markdown tasks.',
					this.nativeFallback.id,
				),
			);
		}
		return Promise.resolve(adapterAvailable('optional-plugin'));
	}

	async query(input: TodayTasksQuery): Promise<readonly TodayTaskItem[]> {
		const queryToday = this.plugin.queryToday;
		const limit = normalizeTaskLimit(input.limit);
		if (!queryToday) return this.nativeFallback.query(input);
		let items: unknown;
		try {
			items = await queryToday(input.date, limit);
		} catch {
			return this.nativeFallback.query(input);
		}
		return (
			normalizeOptionalTaskItems(items, limit) ??
			this.nativeFallback.query(input)
		);
	}
}
