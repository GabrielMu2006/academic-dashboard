import type { CourseOverviewItem, CourseOverviewQuery, CourseOverviewResult } from '../core/course-overview';
import type { DataAdapter } from '../core/data-adapter';
import { toIsoDate } from '../core/calendar-tasks';
import type { WidgetRegistry } from '../core/widget-registry';
import type { WidgetLifecycle, WidgetMountContext } from '../core/widgets';
import { t, translateEnglishSource } from '../core/localization';

interface CourseLink {
	readonly path: string;
	readonly label: string;
	readonly title?: string;
}

interface ObsidianWindowDom {
	createEl<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K];
}

export interface CourseOverviewWidgetServices {
	readonly now: () => Date;
	readonly overview: DataAdapter<CourseOverviewQuery, CourseOverviewResult>;
	readonly getRootFolder: () => string;
	readonly getCurrentTerm: () => string;
	readonly openFile: (path: string) => Promise<void>;
	readonly subscribeToVaultChanges: (callback: () => void) => () => void;
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

export class CourseOverviewWidget implements WidgetLifecycle {
	private context: WidgetMountContext | null = null;
	private events: AbortController | null = null;
	private unsubscribe: (() => void) | null = null;
	private generation = 0;
	private selectedId = '';

	constructor(private readonly services: CourseOverviewWidgetServices) {}

	mount(context: WidgetMountContext): void {
		this.context = context;
		this.unsubscribe = this.services.subscribeToVaultChanges(() => {
			if (this.context) void this.render(this.context);
		});
		void this.render(context);
	}

	update(context: WidgetMountContext): void {
		this.context = context;
		void this.render(context);
	}

	destroy(): void {
		this.generation += 1;
		this.events?.abort();
		this.events = null;
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.context = null;
	}

	private async render(context: WidgetMountContext): Promise<void> {
		const generation = ++this.generation;
		this.events?.abort();
		this.events = new AbortController();
		context.contentEl.replaceChildren();
		context.setState({ status: 'loading' });
		const now = this.services.now();
		const date = toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
		let result: CourseOverviewResult;
		try {
			result = await this.services.overview.query({
				date,
				rootFolder: this.services.getRootFolder(),
				currentTerm: this.services.getCurrentTerm(),
				limit: 50,
			});
		} catch {
			if (generation !== this.generation) return;
			context.setState({ status: 'error', message: t('course.loadFailed'), code: 'course_overview_failed' });
			return;
		}
		if (generation !== this.generation) return;
		if (result.courses.length === 0) {
			context.setState({
				status: 'empty',
				message: this.services.getCurrentTerm()
					? t('empty.courseTerm')
					: t('empty.courseOverview'),
			});
			return;
		}
		const document = context.contentEl.ownerDocument;
		const summary = element(document, 'div', 'academic-dashboard-course-overview__summary', t('course.summary', {
			count: result.courses.length,
			term: this.services.getCurrentTerm() || t('course.allTerms'),
		}));
		if (result.unresolvedCount > 0) summary.title = t('course.unresolved', { count: result.unresolvedCount });
		context.contentEl.append(summary);
		const select = element(document, 'select', 'academic-dashboard-course-overview__select');
		select.setAttribute('aria-label', t('course.select'));
		for (const course of result.courses) {
			const option = element(document, 'option', '', course.term ? `${course.name} · ${course.term}` : `${course.name} · ${t('course.termUnspecified')}`);
			option.value = course.id;
			select.append(option);
		}
		if (!result.courses.some(({ id }) => id === this.selectedId)) this.selectedId = result.courses[0]?.id ?? '';
		select.value = this.selectedId;
		const detail = element(document, 'div', 'academic-dashboard-course-overview__detail');
		const showSelected = (): void => {
			const selected = result.courses.find(({ id }) => id === this.selectedId) ?? result.courses[0];
			if (selected) this.renderCourse(document, detail, selected);
		};
		select.addEventListener('change', () => {
			this.selectedId = select.value;
			showSelected();
		}, { signal: this.events.signal });
		context.contentEl.append(select, detail);
		showSelected();
		context.setState({ status: 'ready' });
	}

	private renderCourse(document: Document, container: HTMLElement, course: CourseOverviewItem): void {
		container.replaceChildren();
		container.append(element(document, 'div', 'academic-dashboard-course-overview__basis',
			course.basis === 'metadata' ? t('course.metadataBasis') : t('course.rootBasis')));
		const counts = element(document, 'div', 'academic-dashboard-course-overview__counts',
			t('course.counts', { notes: course.notes.length, resources: course.resources.length, tasks: course.tasks.length, reviews: course.reviews.length }));
		container.append(counts);
		this.renderLinks(document, container, t('course.notes'), t('course.noNotes'), course.notes.map(({ path }) => ({ path, label: path.split('/').at(-1) || path })));
		this.renderLinks(document, container, t('course.resources'), t('course.noResources'), course.resources.map(({ path }) => ({ path, label: path.split('/').at(-1) || path })));
		this.renderLinks(document, container, t('course.tasks'), t('course.noTasks'), course.tasks.map(({ path, line, text }) => ({ path, label: text, title: `${path}:${line}` })));
		this.renderLinks(document, container, t('course.reviews'), t('course.noReviews'), course.reviews.map(({ path, title }) => ({ path, label: title })));
	}

	private renderLinks(document: Document, container: HTMLElement, title: string, emptyMessage: string, values: readonly CourseLink[]): void {
		container.append(element(document, 'h4', 'academic-dashboard-course-overview__heading', title));
		if (values.length === 0) {
			container.append(element(document, 'div', 'academic-dashboard-course-overview__missing', emptyMessage));
			return;
		}
		const list = element(document, 'div', 'academic-dashboard-course-overview__links');
		for (const value of values.slice(0, 10)) {
			const button = element(document, 'button', 'academic-dashboard-course-overview__link', value.label);
			button.type = 'button';
			button.title = value.title ?? value.path;
			button.addEventListener('click', () => {
				void this.services.openFile(value.path).catch(() => {
					this.context?.setState({ status: 'error', message: t('course.openFailed'), code: 'course_resource_open_failed' });
				});
			}, { signal: this.events?.signal });
			list.append(button);
		}
		container.append(list);
	}
}

export function registerCourseOverviewWidget(
	registry: WidgetRegistry,
	services: CourseOverviewWidgetServices,
): void {
	registry.register({
		definition: {
			id: 'study.course-overview',
			title: 'Course Overview',
			allowedPages: ['study'],
			allowedSizes: ['large'],
			defaultSize: 'large',
		},
		create: () => new CourseOverviewWidget(services),
	});
}
