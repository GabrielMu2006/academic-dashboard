export interface CalendarMonthQuery {
	readonly year: number;
	readonly month: number;
}

export interface CalendarDay {
	readonly date: string;
	readonly day: number;
	readonly notePaths: readonly string[];
}

export interface CalendarMonth {
	readonly year: number;
	readonly month: number;
	readonly startsOn: number;
	readonly days: readonly CalendarDay[];
}

export interface TodayTasksQuery {
	readonly date: string;
	readonly limit: number;
}

export interface TodayTaskItem {
	readonly path: string;
	readonly line: number;
	readonly text: string;
	readonly dueDate?: string;
}

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
	if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return false;
	const [yearText, monthText, dayText] = value.split('-');
	const year = Number(yearText);
	const month = Number(monthText);
	const day = Number(dayText);
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
}

export function toIsoDate(year: number, month: number, day: number): string {
	return `${year.toString().padStart(4, '0')}-${month
		.toString()
		.padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

export function normalizeTaskLimit(limit: unknown): number {
	if (typeof limit !== 'number' || !Number.isFinite(limit)) return 20;
	return Math.min(100, Math.max(1, Math.trunc(limit)));
}
