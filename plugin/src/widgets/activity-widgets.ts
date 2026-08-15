import type {
	ActivityQuery,
	ActivitySeries,
	GithubActivitySeries,
} from '../core/activity';
import { toIsoDate } from '../core/calendar-tasks';
import type { DataAdapter } from '../core/data-adapter';
import type { WidgetRegistry } from '../core/widget-registry';
import type {
	WidgetLifecycle,
	WidgetMountContext,
	WidgetRegistration,
} from '../core/widgets';
import {
	formatDate,
	formatNumber,
	t,
	translateEnglishSource,
} from '../core/localization';
import { restoreStableFocus } from '../ui/focus';

export interface ActivityWidgetServices {
	readonly now: () => Date;
	readonly obsidian: DataAdapter<ActivityQuery, ActivitySeries>;
	readonly github: DataAdapter<ActivityQuery, GithubActivitySeries> & {
		readonly refresh: (query: ActivityQuery) => Promise<GithubActivitySeries>;
	};
}

interface ObsidianWindowDom {
	createEl<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K];
}

function element<K extends keyof HTMLElementTagNameMap>(
	document: Document,
	tag: K,
	className: string,
	text?: string,
): HTMLElementTagNameMap[K] {
	const result = (document.win as Window & ObsidianWindowDom).createEl(tag);
	result.className = className;
	if (text !== undefined) result.textContent = translateEnglishSource(text);
	return result;
}

class ActivityHeatmapWidget implements WidgetLifecycle {
	private generation = 0;

	constructor(
		private readonly adapter: DataAdapter<ActivityQuery, ActivitySeries>,
		private readonly now: () => Date,
		private readonly refresh?: (query: ActivityQuery) => Promise<GithubActivitySeries>,
	) {}

	mount(context: WidgetMountContext): Promise<void> {
		return this.load(context);
	}

	update(context: WidgetMountContext): Promise<void> {
		return this.load(context);
	}

	destroy(): void {
		this.generation += 1;
	}

	private async load(context: WidgetMountContext): Promise<void> {
		const generation = ++this.generation;
		context.contentEl.replaceChildren();
		context.setState({ status: 'loading' });
		try {
			const availability = await this.adapter.availability();
			if (generation !== this.generation) return;
			if (availability.status !== 'available') {
				context.setState({
					status: 'unavailable',
					reason: availability.reason,
					...(availability.status === 'unavailable' && availability.recovery
						? { recovery: availability.recovery }
						: {}),
				});
				return;
			}
			const now = this.now();
			const query = {
				endDate: toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate()),
				days: 70,
			};
			const series = await this.adapter.query(query);
			if (generation !== this.generation) return;
			this.render(context, series);
			context.setState({ status: 'ready' });
			if (series.source === 'github' && series.cacheState === 'stale' && this.refresh) {
				void this.refreshAndRender(context, generation, query, false);
			}
		} catch {
			if (generation !== this.generation) return;
			context.setState({
				status: 'error',
				message: 'Local activity could not be summarized.',
				code: 'local_activity_query_failed',
			});
		}
	}

	private render(context: WidgetMountContext, series: ActivitySeries): void {
		const document = context.contentEl.ownerDocument;
		context.contentEl.replaceChildren();
		const summary = element(
			document,
			'div',
			'academic-dashboard-activity__summary',
			series.source === 'github'
				? t('activity.publicCount', { count: formatNumber(series.total) })
				: t('activity.noteCount', { count: formatNumber(series.total) }),
		);
		const heatmap = element(
			document,
			'div',
			`academic-dashboard-heatmap academic-dashboard-heatmap--${context.size}`,
		);
		heatmap.setAttribute('role', 'img');
		heatmap.setAttribute(
			'aria-label',
			t('activity.heatmap', {
				source: series.source === 'obsidian' ? 'Obsidian' : 'GitHub',
				count: formatNumber(series.total),
				days: formatNumber(series.days.length),
			}),
		);
		for (const day of series.days) {
			const cell = element(document, 'span', 'academic-dashboard-heatmap__cell');
			cell.setAttribute('data-intensity', day.intensity.toString());
			cell.title = `${day.date}: ${day.count}`;
			cell.setAttribute('aria-hidden', 'true');
			heatmap.append(cell);
		}
		const legend = element(
			document,
			'div',
			`academic-dashboard-heatmap-legend academic-dashboard-heatmap-legend--${context.size}`,
		);
		legend.setAttribute('aria-label', t('activity.legend'));
		legend.append(element(document, 'span', '', t('activity.less')));
		for (let level = 0; level <= 4; level += 1) {
			const swatch = element(document, 'span', 'academic-dashboard-heatmap__cell');
			swatch.setAttribute('data-intensity', level.toString());
			swatch.setAttribute('aria-hidden', 'true');
			legend.append(swatch);
		}
		legend.append(element(document, 'span', '', t('activity.more')));
		context.contentEl.append(summary, heatmap, legend);
		if (series.source === 'github') this.renderGithubStatus(context, series);
	}

	private renderGithubStatus(
		context: WidgetMountContext,
		series: GithubActivitySeries,
	): void {
		const document = context.contentEl.ownerDocument;
		const status = element(document, 'div', 'academic-dashboard-github-status');
		const parts = [
			series.lastUpdated
				? t('activity.lastUpdated', { date: formatDate(new Date(series.lastUpdated), { dateStyle: 'medium', timeStyle: 'short' }) })
				: t('activity.noUpdate'),
			series.cacheState === 'stale' ? t('activity.stale') : t('activity.fresh'),
			...(series.privateContributionCount === undefined
				? []
				: [t('activity.privateCount', { count: formatNumber(series.privateContributionCount) })]),
			...(series.errorCode ? [t('activity.refreshError', { code: series.errorCode.replaceAll('-', ' ') })] : []),
		];
		status.append(element(document, 'span', '', parts.join(' ')));
		const refresh = element(document, 'button', 'academic-dashboard-github-refresh', 'Refresh');
		refresh.type = 'button';
		refresh.addEventListener('click', () => {
			refresh.disabled = true;
			refresh.setAttribute('aria-busy', 'true');
			const now = this.now();
			void this.refreshAndRender(context, this.generation, {
				endDate: toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate()),
				days: 70,
			}, true).then(() => {
				restoreStableFocus(context.contentEl, '.academic-dashboard-github-refresh', refresh);
			});
		});
		status.append(refresh);
		context.contentEl.append(status);
	}

	private async refreshAndRender(
		context: WidgetMountContext,
		generation: number,
		query: ActivityQuery,
		manual: boolean,
	): Promise<void> {
		if (!this.refresh) return;
		if (manual) context.setState({ status: 'loading' });
		const series = await this.refresh(query);
		if (generation !== this.generation) return;
		this.render(context, series);
		context.setState({ status: 'ready' });
	}
}

function registration(
	id: string,
	title: string,
	size: 'medium' | 'large',
	create: () => WidgetLifecycle,
): WidgetRegistration {
	return {
		definition: {
			id,
			title,
			allowedPages: ['study'],
			allowedSizes: ['medium', 'large'],
			defaultSize: size,
		},
		create,
	};
}

export function registerActivityWidgets(
	registry: WidgetRegistry,
	services: ActivityWidgetServices,
): void {
	registry.register(
		registration('study.activity', 'Obsidian Activity', 'large', () =>
			new ActivityHeatmapWidget(services.obsidian, services.now),
		),
	);
	registry.register(
		registration('study.contributions', 'GitHub Contributions', 'large', () =>
			new ActivityHeatmapWidget(
				services.github,
				services.now,
				(query) => services.github.refresh(query),
			),
		),
	);
}
