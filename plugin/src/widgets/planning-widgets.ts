import type {
	CalendarMonth,
	CalendarMonthQuery,
	TodayTaskItem,
	TodayTasksQuery,
} from '../core/calendar-tasks';
import { toIsoDate } from '../core/calendar-tasks';
import type { DataAdapter } from '../core/data-adapter';
import type { WidgetRegistry } from '../core/widget-registry';
import type {
	WidgetLifecycle,
	WidgetMountContext,
	WidgetRegistration,
} from '../core/widgets';
import { formatDate, t, translateEnglishSource } from '../core/localization';
import { focusElement, restoreStableFocus } from '../ui/focus';

export interface PlanningWidgetServices {
	readonly now: () => Date;
	readonly calendar: DataAdapter<CalendarMonthQuery, CalendarMonth>;
	readonly todayTasks: DataAdapter<TodayTasksQuery, readonly TodayTaskItem[]>;
	readonly openNote: (path: string) => Promise<void>;
	readonly reviewTaskToggle: (task: TodayTaskItem) => Promise<
		| { readonly outcome: 'cancelled' }
		| { readonly outcome: 'committed'; readonly undoToken: string; readonly path: string }
	>;
	readonly undoTaskToggle: (token: string) => Promise<void>;
	readonly getTaskUndos: () => readonly {
		readonly token: string;
		readonly path: string;
	}[];
	readonly createDailyNote: (date: string) => Promise<'cancelled' | 'created'>;
	readonly createAcademicNote: (
		kind: 'course-note' | 'paper-reading',
	) => Promise<void>;
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

abstract class AsyncPlanningWidget implements WidgetLifecycle {
	protected context: WidgetMountContext | null = null;
	protected events: AbortController | null = null;
	private generation = 0;

	mount(context: WidgetMountContext): Promise<void> {
		return this.load(context);
	}

	update(context: WidgetMountContext): Promise<void> {
		return this.load(context);
	}

	destroy(): void {
		this.generation += 1;
		this.events?.abort();
		this.events = null;
		this.context = null;
	}

	protected isCurrent(generation: number): boolean {
		return generation === this.generation;
	}

	protected abstract render(
		context: WidgetMountContext,
		generation: number,
	): Promise<void>;

	private async load(context: WidgetMountContext): Promise<void> {
		const generation = ++this.generation;
		this.events?.abort();
		this.events = new AbortController();
		this.context = context;
		context.contentEl.replaceChildren();
		context.setState({ status: 'loading' });
		try {
			await this.render(context, generation);
		} catch {
			if (generation !== this.generation) return;
			context.setState({
				status: 'error',
				message: 'Planning data could not be loaded.',
				code: 'planning_query_failed',
			});
		}
	}
}

export class CalendarWidget extends AsyncPlanningWidget {
	constructor(private readonly services: PlanningWidgetServices) {
		super();
	}

	protected async render(
		context: WidgetMountContext,
		generation: number,
	): Promise<void> {
		const availability = await this.services.calendar.availability();
		if (!this.isCurrent(generation)) return;
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
		const now = this.services.now();
		const month = await this.services.calendar.query({
			year: now.getFullYear(),
			month: now.getMonth() + 1,
		});
		if (!this.isCurrent(generation)) return;
		const today = toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
		const document = context.contentEl.ownerDocument;
		const label = formatDate(now, {
			month: 'long',
			year: 'numeric',
		});
		context.contentEl.append(
			this.createHeader(document, label),
			this.createGrid(document, month, today),
		);
		context.setState({ status: 'ready' });
	}

	private createHeader(document: Document, label: string): HTMLElement {
		const header = element(document, 'div', 'academic-dashboard-calendar__header');
		header.append(element(document, 'div', 'academic-dashboard-calendar__month', label));
		const actions = element(document, 'div', 'academic-dashboard-calendar__actions');
		for (const [kind, title] of [
			['course-note', 'New course note'],
			['paper-reading', 'New paper note'],
		] as const) {
			const button = element(document, 'button', 'academic-dashboard-calendar__action', title);
			button.type = 'button';
			button.addEventListener('click', () => {
				void this.services.createAcademicNote(kind).catch(() => {
					this.context?.setState({
						status: 'error',
						message: 'The note creation review could not be opened.',
						code: 'note_creation_review_failed',
					});
				});
			}, { signal: this.events?.signal });
			actions.append(button);
		}
		header.append(actions);
		return header;
	}

	private createGrid(
		document: Document,
		month: CalendarMonth,
		today: string,
	): HTMLElement {
		const grid = element(document, 'div', 'academic-dashboard-calendar');
		grid.setAttribute('aria-label', 'Current month calendar');
		for (let index = 0; index < 7; index += 1) {
			const weekday = formatDate(new Date(Date.UTC(2023, 0, 1 + index)), {
				weekday: 'narrow',
				timeZone: 'UTC',
			});
			grid.append(
				element(document, 'span', 'academic-dashboard-calendar__weekday', weekday),
			);
		}
		for (let offset = 0; offset < month.startsOn; offset += 1) {
			const spacer = element(document, 'span', 'academic-dashboard-calendar__spacer');
			spacer.setAttribute('aria-hidden', 'true');
			grid.append(spacer);
		}
		for (const day of month.days) {
			const button = element(
				document,
				'button',
				'academic-dashboard-calendar__day',
				day.day.toString(),
			);
			button.type = 'button';
			button.toggleAttribute('data-has-note', day.notePaths.length > 0);
			button.toggleAttribute('data-today', day.date === today);
			button.setAttribute('aria-label',
				day.notePaths.length > 0
					? t('calendar.openDaily', { date: day.date })
					: t('calendar.reviewDaily', { date: day.date }),
			);
			const path = day.notePaths[0];
			if (path) {
				button.addEventListener(
					'click',
					() => {
						void this.services.openNote(path).catch(() => {
							this.context?.setState({
								status: 'error',
								message: 'The daily note could not be opened.',
								code: 'daily_note_open_failed',
							});
						});
					},
					{ signal: this.events?.signal },
				);
			} else {
				button.addEventListener(
					'click',
					() => {
						void this.services.createDailyNote(day.date).then((outcome) => {
							if (outcome === 'created' && this.context) void this.update(this.context);
						}).catch(() => {
							this.context?.setState({
								status: 'error',
								message: 'The Daily Note was not created.',
								code: 'daily_note_create_failed',
							});
						});
					},
					{ signal: this.events?.signal },
				);
			}
			grid.append(button);
		}
		return grid;
	}
}

export class TodayTasksWidget extends AsyncPlanningWidget {
	constructor(private readonly services: PlanningWidgetServices) {
		super();
	}

	protected async render(
		context: WidgetMountContext,
		generation: number,
	): Promise<void> {
		const availability = await this.services.todayTasks.availability();
		if (!this.isCurrent(generation)) return;
		if (availability.status === 'unavailable') {
			context.setState({
				status: 'unavailable',
				reason: availability.reason,
				...(availability.recovery ? { recovery: availability.recovery } : {}),
			});
			return;
		}
		const now = this.services.now();
		const date = toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
		const tasks = await this.services.todayTasks.query({ date, limit: 20 });
		if (!this.isCurrent(generation)) return;
		const document = context.contentEl.ownerDocument;
		const undoStates = this.services.getTaskUndos();
		for (const undo of undoStates) {
			context.contentEl.append(this.createUndo(document, context, undo));
		}
		if (tasks.length === 0) {
			if (undoStates.length > 0) {
				context.setState({ status: 'ready' });
				return;
			}
			context.setState({
				status: 'empty',
				message:
					availability.status === 'fallback'
						? 'No Native Markdown tasks are due today.'
						: 'No Tasks plugin tasks are due today.',
			});
			return;
		}
		if (availability.status === 'fallback') {
			context.contentEl.append(
				element(
					document,
					'div',
					'academic-dashboard-data-source',
					'Native Markdown fallback',
				),
			);
		} else {
			context.contentEl.append(
				element(
					document,
					'div',
					'academic-dashboard-data-source',
					'Tasks plugin results are read-only here; open the source note to edit safely.',
				),
			);
		}
		const list = element(document, 'div', 'academic-dashboard-task-list');
		for (const task of tasks) {
			const row = element(document, 'div', 'academic-dashboard-task');
			const toggle = element(document, 'button', 'academic-dashboard-task__toggle', '○');
			toggle.type = 'button';
			toggle.title = availability.status === 'fallback'
				? `Review completion of ${task.path}:${task.line}`
				: 'Safe toggle unavailable for Tasks plugin results';
			toggle.setAttribute('aria-label', toggle.title);
			toggle.disabled = availability.status !== 'fallback';
			if (availability.status === 'fallback') {
					toggle.addEventListener('click', () => {
						void this.services.reviewTaskToggle(task).then((result) => {
							if (result.outcome !== 'committed') {
								focusElement(toggle);
								return;
							}
							if (this.context) void this.update(this.context).then(() => {
								if (this.context) restoreStableFocus(this.context.contentEl, '.academic-dashboard-task-undo__button');
							});
						}).catch(() => {
						this.context?.setState({
							status: 'error',
							message: 'The task changed or could not be toggled. Nothing was overwritten.',
							code: 'task_toggle_failed',
						});
							focusElement(toggle);
					});
				}, { signal: this.events?.signal });
			}
			const open = element(document, 'button', 'academic-dashboard-task__open');
			open.type = 'button';
			open.title = `Open ${task.path}:${task.line}`;
			open.append(
				element(document, 'span', 'academic-dashboard-task__text', task.text),
				element(
					document,
					'span',
					'academic-dashboard-task__source',
					`${task.path.split('/').at(-1) ?? task.path}:${task.line}`,
				),
			);
			open.addEventListener(
				'click',
				() => {
					void this.services.openNote(task.path).catch(() => {
						this.context?.setState({
							status: 'error',
							message: 'The task note could not be opened.',
							code: 'task_note_open_failed',
						});
					});
				},
				{ signal: this.events?.signal },
			);
			row.append(toggle, open);
			list.append(row);
		}
		context.contentEl.append(list);
		context.setState({ status: 'ready' });
	}

	private createUndo(
		document: Document,
		context: WidgetMountContext,
		undo: { readonly token: string; readonly path: string },
	): HTMLElement {
		const banner = element(document, 'div', 'academic-dashboard-task-undo');
		banner.append(element(document, 'span', '', `Task updated in ${undo.path}.`));
		const button = element(document, 'button', 'academic-dashboard-task-undo__button', 'Undo');
		button.type = 'button';
		button.addEventListener('click', () => {
			void this.services.undoTaskToggle(undo.token).then(() => {
				if (this.context) void this.update(this.context).then(() => {
					if (this.context) restoreStableFocus(this.context.contentEl, '.academic-dashboard-task__toggle');
				});
			}).catch(() => {
				context.setState({
					status: 'error',
					message: 'Undo is unavailable because the note changed.',
					code: 'task_undo_conflict',
				});
				focusElement(button);
			});
		}, { signal: this.events?.signal });
		banner.append(button);
		return banner;
	}
}

function registration(
	id: string,
	title: string,
	create: () => WidgetLifecycle,
): WidgetRegistration {
	return {
		definition: {
			id,
			title,
			allowedPages: ['home'],
			allowedSizes: ['medium', 'large'],
			defaultSize: 'large',
		},
		create,
	};
}

export function registerPlanningWidgets(
	registry: WidgetRegistry,
	services: PlanningWidgetServices,
): void {
	registry.register(
		registration('home.calendar', 'Calendar', () => new CalendarWidget(services)),
	);
	registry.register(
		registration('home.today-tasks', 'Today’s Tasks', () =>
			new TodayTasksWidget(services),
		),
	);
}
