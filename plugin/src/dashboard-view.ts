import { ItemView, setIcon, WorkspaceLeaf } from 'obsidian';
import {
	DASHBOARD_PAGES,
	getDashboardPage,
	pageForNavigationKey,
} from './app/dashboard-shell';
import {
	DASHBOARD_VIEW_ICON,
	DASHBOARD_VIEW_TYPE,
} from './constants';
import { DEFAULT_LAYOUT_STATE } from './core/default-layouts';
import type { PersistedWidgetLayout } from './core/layout';
import type { PageId } from './core/pages';
import { WidgetRegistry } from './core/widget-registry';
import {
	WidgetRuntime,
	type WidgetPageSession,
} from './core/widget-runtime';
import { GridStackLayoutEngine } from './layout/gridstack-layout-engine';
import type { LayoutEngine } from './layout/layout-engine';
import { DomWidgetPageHost } from './ui/dom-widget-page-host';
import { PAGE_ICON_RESOURCES } from './ui/icon-resources';
import { t, translateEnglishSource } from './core/localization';

const PAGE_OPEN_KEYS = {
	home: 'nav.openHome',
	study: 'nav.openStudy',
	research: 'nav.openResearch',
	agent: 'nav.openAgent',
} as const;
const PAGE_WIDGET_KEYS = {
	home: 'nav.homeWidgets',
	study: 'nav.studyWidgets',
	research: 'nav.researchWidgets',
	agent: 'nav.agentWidgets',
} as const;

export interface DashboardViewOptions {
	getPageLayout?(pageId: PageId): readonly PersistedWidgetLayout[];
	onPageLayoutChange?(
		pageId: PageId,
		layouts: readonly PersistedWidgetLayout[],
	): void;
	onResetPageLayout?(pageId: PageId): void;
	widgetRegistry?: WidgetRegistry;
	initialPageId?: PageId;
}

export class DashboardView extends ItemView {
	private activePageId: PageId;
	private editing = false;
	private pageHostEl: HTMLElement | null = null;
	private editButton: HTMLButtonElement | null = null;
	private layoutStatusEl: HTMLElement | null = null;
	private layoutEngine: LayoutEngine | null = null;
	private widgetSession: WidgetPageSession | null = null;
	private pageMountAbort: AbortController | null = null;
	private renderRevision = 0;
	private readonly widgetRuntime: WidgetRuntime;
	private readonly navigationButtons = new Map<PageId, HTMLButtonElement>();
	private readonly handleViewKeydown = (event: KeyboardEvent): void => {
		if (event.key !== 'Escape' || !this.editing) return;
		event.preventDefault();
		this.setEditing(false);
		this.editButton?.focus();
	};

	constructor(
		leaf: WorkspaceLeaf,
		private readonly options: DashboardViewOptions = {},
	) {
		super(leaf);
		this.activePageId = this.options.initialPageId ?? 'home';
		this.widgetRuntime = new WidgetRuntime(
			this.options.widgetRegistry ?? new WidgetRegistry(),
		);
	}

	showPage(pageId: PageId): void {
		this.selectPage(pageId);
	}

	refresh(): void {
		this.selectPage(this.activePageId);
	}

	getViewType(): string {
		return DASHBOARD_VIEW_TYPE;
	}

	getDisplayText(): string {
		return t('app.name');
	}

	getIcon(): string {
		return DASHBOARD_VIEW_ICON;
	}

	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass('academic-dashboard-view');
		container.addEventListener('keydown', this.handleViewKeydown);

		const shell = container.createDiv({ cls: 'academic-dashboard-shell' });
		const toolbar = shell.createEl('header', {
			cls: 'academic-dashboard-toolbar',
		});
		toolbar.createDiv({
			text: t('app.name'),
			cls: 'academic-dashboard-toolbar__brand',
		});

		const navigation = toolbar.createEl('nav', {
			cls: 'academic-dashboard-toolbar__navigation',
			attr: { 'aria-label': t('nav.pages'), role: 'tablist' },
		});

		for (const page of DASHBOARD_PAGES) {
			const button = navigation.createEl('button', {
				cls: 'academic-dashboard-toolbar__button',
				attr: {
					type: 'button',
					id: `academic-dashboard-${page.id}-tab`,
					'data-page-id': page.id,
					role: 'tab',
					'aria-label': t(PAGE_OPEN_KEYS[page.id]),
					'aria-controls': `academic-dashboard-${page.id}-panel`,
					title: translateEnglishSource(page.title),
				},
			});
			const icon = button.createSpan({
				cls: 'academic-dashboard-toolbar__icon',
				attr: { 'aria-hidden': 'true' },
			});
			setIcon(icon, PAGE_ICON_RESOURCES[page.id]);
			button.createSpan({
					text: translateEnglishSource(page.title),
				cls: 'academic-dashboard-toolbar__label',
			});
			button.addEventListener('click', () => this.selectPage(page.id));
			button.addEventListener('keydown', (event) => {
				const nextPage = pageForNavigationKey(page.id, event.key);
				if (!nextPage) return;
				event.preventDefault();
				this.selectPage(nextPage);
				this.navigationButtons.get(nextPage)?.focus();
			});
			this.navigationButtons.set(page.id, button);
		}

		this.editButton = toolbar.createEl('button', {
			text: t('layout.edit'),
			cls: 'academic-dashboard-toolbar__edit',
			attr: {
				type: 'button',
				'aria-label': t('layout.edit'),
				'aria-pressed': 'false',
			},
		});
		this.editButton.addEventListener('click', () => {
			this.setEditing(!this.editing);
		});
		const resetButton = toolbar.createEl('button', {
			text: t('layout.reset'),
			cls: 'academic-dashboard-toolbar__reset',
			attr: {
				type: 'button',
				'aria-label': t('layout.resetCurrent'),
			},
		});
		resetButton.addEventListener('click', () => {
			this.options.onResetPageLayout?.(this.activePageId);
			this.selectPage(this.activePageId);
		});
		this.layoutStatusEl = toolbar.createEl('p', {
			cls: 'academic-dashboard-layout-status',
			attr: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
		});

		this.pageHostEl = shell.createEl('main', {
			cls: 'academic-dashboard-page-host',
		});
		this.selectPage(this.activePageId);
	}

	async onClose(): Promise<void> {
		this.renderRevision += 1;
		this.pageMountAbort?.abort();
		this.pageMountAbort = null;
		this.contentEl.removeEventListener('keydown', this.handleViewKeydown);
		this.layoutEngine?.destroy();
		this.layoutEngine = null;
		await this.widgetSession?.destroy();
		this.widgetSession = null;
		this.pageHostEl = null;
		this.editButton = null;
		this.layoutStatusEl = null;
		this.navigationButtons.clear();
		this.contentEl.empty();
	}

	private selectPage(pageId: PageId): void {
		const revision = ++this.renderRevision;
		this.pageMountAbort?.abort();
		const mountAbort = new AbortController();
		this.pageMountAbort = mountAbort;
		this.layoutEngine?.destroy();
		this.layoutEngine = null;
		void this.widgetSession?.destroy();
		this.widgetSession = null;
		this.editing = false;
		this.updateEditButton();
		this.activePageId = pageId;
		for (const [buttonPageId, button] of this.navigationButtons) {
			const isActive = buttonPageId === pageId;
			button.toggleClass('is-active', isActive);
			button.setAttr('aria-selected', String(isActive));
			button.setAttr('tabindex', isActive ? '0' : '-1');
			if (isActive) {
				button.setAttr('aria-current', 'page');
			} else {
				button.removeAttribute('aria-current');
			}
		}

		const host = this.pageHostEl;
		if (!host) return;
		host.empty();

		const page = getDashboardPage(pageId);
		const headingId = `academic-dashboard-${page.id}-heading`;
		const section = host.createEl('section', {
			cls: 'academic-dashboard-page',
			attr: {
				id: `academic-dashboard-${page.id}-panel`,
				role: 'tabpanel',
				'data-page-id': page.id,
				'aria-labelledby': `academic-dashboard-${page.id}-tab ${headingId}`,
			},
		});
		const header = section.createEl('header', {
			cls: 'academic-dashboard-page__header',
		});
		header.createEl('h2', {
			text: translateEnglishSource(page.title),
			cls: 'academic-dashboard-page__title',
			attr: { id: headingId },
		});
		header.createEl('p', {
			text: page.description,
			cls: 'academic-dashboard-page__description',
		});

		const gridContainer = section.createDiv({
			cls: 'academic-dashboard-grid-host',
			attr: { 'aria-label': t(PAGE_WIDGET_KEYS[page.id]) },
		});
		const layouts =
			this.options.getPageLayout?.(pageId) ?? DEFAULT_LAYOUT_STATE.pages[pageId];
		void this.mountPageWidgets(
			pageId,
			gridContainer,
			layouts,
			revision,
			mountAbort.signal,
		);
	}

	private async mountPageWidgets(
		pageId: PageId,
		gridContainer: HTMLElement,
		layouts: readonly PersistedWidgetLayout[],
		revision: number,
		signal: AbortSignal,
	): Promise<void> {
		const host = new DomWidgetPageHost(gridContainer);
		const session = await this.widgetRuntime.mountPage(host, pageId, layouts, {
			signal,
		});
		if (signal.aborted || revision !== this.renderRevision) {
			await session.destroy();
			return;
		}
		this.pageMountAbort = null;
		this.widgetSession = session;
		try {
			const engine = new GridStackLayoutEngine(pageId);
			engine.mount(gridContainer);
			engine.setItems(host.getLayoutItems());
			engine.enableEditing(false);
			engine.subscribeToChange((updated) => {
				this.options.onPageLayoutChange?.(pageId, updated);
				if (this.editing && this.layoutStatusEl) {
					this.layoutStatusEl.setText(t('layout.updated'));
				}
			});
			this.layoutEngine = engine;
		} catch (error) {
			await session.destroy();
			this.widgetSession = null;
			gridContainer.empty();
			gridContainer.createEl('p', {
				text:
					error instanceof Error
						? `The layout engine could not start: ${error.message}`
						: 'The layout engine could not start. Default widget order is preserved.',
				cls: 'academic-dashboard-layout-error',
			});
		}
	}

	private updateEditButton(): void {
		const button = this.editButton;
		if (!button) return;
		const label = this.editing ? t('layout.done') : t('layout.edit');
		button.setText(label);
		button.setAttr('aria-label', label);
		button.setAttr('aria-pressed', String(this.editing));
		button.toggleClass('is-active', this.editing);
	}

	private setEditing(editing: boolean): void {
		if (editing && this.layoutEngine && !this.layoutEngine.canEditCanonical()) {
			this.editing = false;
			this.updateEditButton();
			this.layoutStatusEl?.setText(t('layout.widen'));
			this.editButton?.focus();
			return;
		}
		this.editing = editing;
		this.layoutEngine?.enableEditing(editing);
		this.updateEditButton();
		if (this.layoutStatusEl) {
			this.layoutStatusEl.setText(
				editing
					? t('layout.instructions')
					: t('layout.editingOff'),
			);
		}
	}

}
