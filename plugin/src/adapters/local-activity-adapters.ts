import {
	adapterAvailable,
	type Availability,
	type DataAdapter,
} from '../core/data-adapter';
import {
	normalizeActivityDays,
	type ActivityDay,
	type ActivityQuery,
	type ActivitySeries,
} from '../core/activity';
import { isIsoDate, toIsoDate } from '../core/calendar-tasks';
import {
	isNativeVaultNotePath,
	type NativeVaultPort,
} from './native-vault-academic-adapters';

function localDateKey(timestamp: number): string {
	const date = new Date(timestamp);
	return toIsoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function intensity(count: number, maximum: number): 0 | 1 | 2 | 3 | 4 {
	if (count <= 0 || maximum <= 0) return 0;
	const level = Math.ceil((count / maximum) * 4);
	if (level >= 4) return 4;
	if (level === 3) return 3;
	if (level === 2) return 2;
	return 1;
}

export class NativeObsidianActivityAdapter
	implements DataAdapter<ActivityQuery, ActivitySeries>
{
	readonly id = 'local.obsidian-activity';

	constructor(private readonly vault: NativeVaultPort) {}

	availability(): Promise<Availability> {
		return Promise.resolve(adapterAvailable('native-vault'));
	}

	query(input: ActivityQuery): Promise<ActivitySeries> {
		if (!isIsoDate(input.endDate)) {
			return Promise.reject(new Error('Activity query requires a valid end date.'));
		}
		const days = normalizeActivityDays(input.days);
		const counts = new Map<string, number>();
		for (const file of this.vault.listMarkdownFiles()) {
			if (!isNativeVaultNotePath(file.path)) continue;
			const date = localDateKey(file.modifiedAt);
			counts.set(date, (counts.get(date) ?? 0) + 1);
		}
		const end = new Date(`${input.endDate}T12:00:00`);
		const series: Array<{ date: string; count: number }> = [];
		for (let offset = days - 1; offset >= 0; offset -= 1) {
			const date = new Date(end);
			date.setDate(end.getDate() - offset);
			const key = toIsoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
			series.push({ date: key, count: counts.get(key) ?? 0 });
		}
		const maximum = Math.max(0, ...series.map(({ count }) => count));
		const activityDays: ActivityDay[] = series.map(({ date, count }) =>
			Object.freeze({ date, count, intensity: intensity(count, maximum) }),
		);
		return Promise.resolve(
			Object.freeze({
				source: 'obsidian',
				days: Object.freeze(activityDays),
				total: activityDays.reduce((sum, day) => sum + day.count, 0),
			}),
		);
	}
}
