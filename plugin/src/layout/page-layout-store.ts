import {
	DEFAULT_LAYOUT_STATE,
	getWidgetSizePolicy,
	PHASE_5_DEFAULT_LAYOUT_PAGES,
} from '../core/default-layouts';
import {
	restorePersistedLayoutState,
	validatePersistedLayoutState,
	type PersistedLayoutState,
	type PersistedWidgetLayout,
} from '../core/layout';
import {
	validateLocalWidgetSettings,
	type LocalWidgetSettings,
} from '../core/local-widget-settings';
import { isPageId, type PageId } from '../core/pages';
import {
	restoreDashboardSettings,
	SETTINGS_SCHEMA_VERSION,
	validateDashboardSettings,
	type DashboardSettings,
} from '../core/settings';
import {
	DEFAULT_METADATA_SETTINGS,
	validateMetadataSettings,
	type MetadataSettings,
} from '../core/metadata-settings';
import {
	isRecord,
	validationIssue,
	type ValidationIssue,
} from '../core/validation';
import {
	isWidgetId,
	type WidgetId,
	type WidgetSize,
} from '../core/widgets';
import {
	DEFAULT_AGENT_SETTINGS,
	validateAgentSettings,
	type AgentSettings,
} from '../core/agent-settings';
import {
	cleanExpiredAgentWriteLog,
	validateAgentWriteLog,
	type AgentWriteLogEntry,
} from '../core/agent-write-log';
import {
	DEFAULT_TEMPLATE_SETTINGS,
	validateAcademicTemplateSettings,
	type AcademicTemplateSettings,
} from '../core/template-settings';
import {
	DEFAULT_LOCAL_WRITE_SETTINGS,
	validateLocalWriteSettings,
	type LocalWriteSettings,
} from '../core/local-write-settings';
import {
	DEFAULT_GITHUB_SETTINGS,
	validateGithubSettings,
	type GithubSettings,
} from '../core/github-settings';
import { DEFAULT_LOCALE_SETTINGS } from '../core/localization';
import {
	cleanExpiredLocalWriteLog,
	validateLocalWriteLog,
} from '../core/local-write-log';
import type { LocalWriteLogEvent } from '../core/conservative-writes';

export type LayoutStoreDiagnostic =
	| {
			readonly code:
				| 'layout_update_rejected'
				| 'settings_update_rejected'
				| 'settings_persistence_blocked';
			readonly issues: readonly ValidationIssue[];
	  }
	| { readonly code: 'layout_save_failed'; readonly error: unknown };

export type LayoutStorePersistence = 'writable' | 'blocked-future-schema';

export interface RestoredLayoutStoreData {
	readonly settings: DashboardSettings;
	readonly source: 'stored' | 'migrated' | 'fallback';
	readonly issues: readonly ValidationIssue[];
	readonly persistence: LayoutStorePersistence;
}

export interface PageLayoutStoreOptions {
	readonly initial: DashboardSettings;
	readonly save: (settings: DashboardSettings) => Promise<void>;
	readonly defaults?: PersistedLayoutState;
	readonly persistence?: LayoutStorePersistence;
	readonly onDiagnostic?: (diagnostic: LayoutStoreDiagnostic) => void;
}

const FUTURE_SCHEMA_ISSUE = validationIssue(
	'unsupported_future_schema',
	'settings.schemaVersion',
	'The saved settings were created by a newer plugin version.',
);

function hasFutureSettingsSchema(input: unknown): boolean {
	return (
		isRecord(input) &&
		typeof input.schemaVersion === 'number' &&
		Number.isInteger(input.schemaVersion) &&
		input.schemaVersion > SETTINGS_SCHEMA_VERSION
	);
}

function settingsWithLayouts(
	settings: DashboardSettings,
	layouts: PersistedLayoutState,
): DashboardSettings {
	const validated = validateDashboardSettings({
		schemaVersion: settings.schemaVersion,
		defaultPage: settings.defaultPage,
		layouts,
		widgets: settings.widgets,
		metadata: settings.metadata,
		templates: settings.templates,
		agent: settings.agent,
		agentWriteLog: settings.agentWriteLog,
		localWrites: settings.localWrites,
		localWriteLog: settings.localWriteLog,
		github: settings.github,
		locale: settings.locale,
		hiddenWidgetIds: settings.hiddenWidgetIds,
	});
	if (!validated.ok) {
		throw new Error('A project-owned layout update produced invalid settings.');
	}
	return validated.value;
}

function pageMatches(
	left: readonly PersistedWidgetLayout[],
	right: readonly PersistedWidgetLayout[],
): boolean {
	return (
		left.length === right.length &&
		left.every((item, index) => {
			const candidate = right[index];
			return (
				candidate !== undefined &&
				item.widgetId === candidate.widgetId &&
				item.pageId === candidate.pageId &&
				item.x === candidate.x &&
				item.y === candidate.y &&
				item.size === candidate.size
			);
		})
	);
}

function upgradePhaseFiveDefaultPages(
	layouts: PersistedLayoutState,
	defaults: PersistedLayoutState,
): PersistedLayoutState {
	const pages = { ...layouts.pages };
	let changed = false;
	for (const pageId of ['home', 'study', 'research', 'agent'] as const) {
		if (pageMatches(layouts.pages[pageId], PHASE_5_DEFAULT_LAYOUT_PAGES[pageId])) {
			pages[pageId] = defaults.pages[pageId];
			changed = true;
		}
	}
	if (!changed) return layouts;
	const upgraded = validatePersistedLayoutState({
		schemaVersion: layouts.schemaVersion,
		pages,
	});
	if (!upgraded.ok) {
		throw new Error('The Phase 6 default layout upgrade is invalid.');
	}
	return upgraded.value;
}

const CONTENT_SAFE_MINIMUM_SIZES: Readonly<Record<string, WidgetSize>> =
	Object.freeze({
		'home.calendar': 'large',
		'home.today-tasks': 'large',
		'home.recent-notes': 'large',
		'study.review-queue': 'large',
		'study.activity': 'large',
		'agent.status': 'medium',
		'agent.workflows': 'large',
		'agent.claudian-entry': 'medium',
	});

const WIDGET_SIZE_ORDER: Readonly<Record<WidgetSize, number>> = Object.freeze({
	small: 0,
	medium: 1,
	large: 2,
});

function repairContentUnsafeCustomPage(
	page: readonly PersistedWidgetLayout[],
): readonly PersistedWidgetLayout[] {
	const candidates = page.map((layout) => {
		const minimum = CONTENT_SAFE_MINIMUM_SIZES[layout.widgetId];
		if (!minimum || WIDGET_SIZE_ORDER[layout.size] >= WIDGET_SIZE_ORDER[minimum]) {
			return layout;
		}
		return Object.freeze({ ...layout, size: minimum });
	});
	if (candidates.every((candidate, index) => candidate === page[index])) {
		return page;
	}

	const occupied = new Set<string>();
	const repaired = [...candidates];
	const placementOrder = candidates
		.map((layout, index) => ({ layout, index }))
		.sort(
			(left, right) =>
				left.layout.y - right.layout.y ||
				left.layout.x - right.layout.x ||
				left.index - right.index,
		);

	for (const { layout, index } of placementOrder) {
		const policy = getWidgetSizePolicy(layout.size);
		const x = Math.min(layout.x, Math.max(0, 4 - policy.columns));
		let y = layout.y;
		const cellsAt = (candidateY: number): string[] => {
			const cells: string[] = [];
			for (let column = x; column < x + policy.columns; column += 1) {
				for (let row = candidateY; row < candidateY + policy.rows; row += 1) {
					cells.push(`${column}:${row}`);
				}
			}
			return cells;
		};
		while (cellsAt(y).some((cell) => occupied.has(cell))) y += 1;
		for (const cell of cellsAt(y)) occupied.add(cell);
		repaired[index] = Object.freeze({ ...layout, x, y });
	}

	return Object.freeze(repaired);
}

function upgradePhaseFiveLayouts(
	layouts: PersistedLayoutState,
	defaults: PersistedLayoutState,
): PersistedLayoutState {
	const defaultUpgraded = upgradePhaseFiveDefaultPages(layouts, defaults);
	const pages = { ...defaultUpgraded.pages };
	let changed = false;
	for (const pageId of ['home', 'study', 'research', 'agent'] as const) {
		const repaired = repairContentUnsafeCustomPage(pages[pageId]);
		if (repaired !== pages[pageId]) {
			pages[pageId] = repaired;
			changed = true;
		}
	}
	if (!changed) return defaultUpgraded;
	const upgraded = validatePersistedLayoutState({
		schemaVersion: layouts.schemaVersion,
		pages,
	});
	if (!upgraded.ok) {
		throw new Error('The Phase 6 content-safe layout repair is invalid.');
	}
	return upgraded.value;
}

function addPageWidget(
	layouts: PersistedLayoutState,
	defaults: PersistedLayoutState,
	pageId: PageId,
	widgetId: string,
): PersistedLayoutState {
	if (
		layouts.pages[pageId].some(
			(layout) => layout.widgetId === widgetId,
		)
	) {
		return layouts;
	}
	const defaultLayout = defaults.pages[pageId].find(
		(layout) => layout.widgetId === widgetId,
	);
	if (!defaultLayout) return layouts;

	const occupied = new Set<string>();
	for (const layout of layouts.pages[pageId]) {
		const policy = getWidgetSizePolicy(layout.size);
		for (let x = layout.x; x < layout.x + policy.columns; x += 1) {
			for (let y = layout.y; y < layout.y + policy.rows; y += 1) {
				occupied.add(`${x}:${y}`);
			}
		}
	}
	const policy = getWidgetSizePolicy(defaultLayout.size);
	let y = defaultLayout.y;
	const candidateCells = (candidateY: number): readonly string[] => {
		const cells: string[] = [];
		for (
			let x = defaultLayout.x;
			x < defaultLayout.x + policy.columns;
			x += 1
		) {
			for (let row = candidateY; row < candidateY + policy.rows; row += 1) {
				cells.push(`${x}:${row}`);
			}
		}
		return cells;
	};
	while (candidateCells(y).some((cell) => occupied.has(cell))) y += 1;

	const upgraded = validatePersistedLayoutState({
		schemaVersion: layouts.schemaVersion,
		pages: {
			...layouts.pages,
			[pageId]: [
				...layouts.pages[pageId],
				Object.freeze({ ...defaultLayout, y }),
			],
		},
	});
	if (!upgraded.ok) {
		throw new Error('The Study Widget layout migration is invalid.');
	}
	return upgraded.value;
}

export function restoreLayoutStoreData(
	input: unknown,
	fallbackLayouts: PersistedLayoutState = DEFAULT_LAYOUT_STATE,
): RestoredLayoutStoreData {
	const fallbackResult = validateDashboardSettings({
		schemaVersion: SETTINGS_SCHEMA_VERSION,
		defaultPage: 'home',
		layouts: fallbackLayouts,
		metadata: DEFAULT_METADATA_SETTINGS,
		templates: DEFAULT_TEMPLATE_SETTINGS,
		agent: DEFAULT_AGENT_SETTINGS,
		localWrites: DEFAULT_LOCAL_WRITE_SETTINGS,
		github: DEFAULT_GITHUB_SETTINGS,
		locale: DEFAULT_LOCALE_SETTINGS,
	});
	if (!fallbackResult.ok) {
		throw new Error('The project default layout is invalid.');
	}
	if (hasFutureSettingsSchema(input)) {
		return {
			settings: fallbackResult.value,
			source: 'fallback',
			issues: Object.freeze([FUTURE_SCHEMA_ISSUE]),
			persistence: 'blocked-future-schema',
		};
	}

	if (
		isRecord(input) &&
		!('schemaVersion' in input) &&
		'gridstackSpikeLayout' in input
	) {
		const restored = restorePersistedLayoutState(input.gridstackSpikeLayout, {
			fallback: fallbackLayouts,
		});
		const layouts = addPageWidget(addPageWidget(addPageWidget(addPageWidget(addPageWidget(
			restored.value, fallbackLayouts, 'study', 'study.course-folders'),
			fallbackLayouts, 'study', 'study.course-overview'),
			fallbackLayouts, 'study', 'study.review-session'),
			fallbackLayouts, 'research', 'research.reading-queue'),
			fallbackLayouts, 'home', 'home.weekly-review');
		return {
			settings: settingsWithLayouts(fallbackResult.value, layouts),
			source: restored.source === 'fallback' ? 'fallback' : 'migrated',
			issues: restored.issues,
			persistence: 'writable',
		};
	}

	const restored = restoreDashboardSettings(input, {
		fallback: fallbackResult.value,
	});
	const sourceLayoutSchema =
		isRecord(input) && isRecord(input.layouts)
			? input.layouts.schemaVersion
			: undefined;
	const restoredLayouts = sourceLayoutSchema === 1 || sourceLayoutSchema === 2
		? upgradePhaseFiveLayouts(restored.value.layouts, fallbackLayouts)
		: restored.value.layouts;
	const layouts = addPageWidget(addPageWidget(addPageWidget(addPageWidget(addPageWidget(
		restoredLayouts, fallbackLayouts, 'study', 'study.course-folders'),
		fallbackLayouts, 'study', 'study.course-overview'),
		fallbackLayouts, 'study', 'study.review-session'),
		fallbackLayouts, 'research', 'research.reading-queue'),
		fallbackLayouts, 'home', 'home.weekly-review');
	return {
		settings: settingsWithLayouts(restored.value, layouts),
		source:
			restored.source === 'stored' && layouts !== restoredLayouts
				? 'migrated'
				: restored.source,
		issues: restored.issues,
		persistence: 'writable',
	};
}

/**
 * Owns page layouts and serializes plugin-data writes. A newer revision is
 * never written before an older pending revision finishes, so late promises
 * cannot overwrite the last drag position.
 */
export class PageLayoutStore {
	private settings: DashboardSettings;
	private readonly defaults: PersistedLayoutState;
	private requestedRevision = 0;
	private savedRevision = 0;
	private failedRevision: number | null = null;
	private saveTask: Promise<void> | null = null;
	private persistenceBlockReported = false;

	constructor(private readonly options: PageLayoutStoreOptions) {
		this.settings = options.initial;
		this.defaults = options.defaults ?? DEFAULT_LAYOUT_STATE;
	}

	getPage(pageId: PageId): readonly PersistedWidgetLayout[] {
		return this.settings.layouts.pages[pageId];
	}

	getVisiblePage(pageId: PageId): readonly PersistedWidgetLayout[] {
		const hidden = new Set(this.settings.hiddenWidgetIds);
		return Object.freeze(
			this.settings.layouts.pages[pageId].filter(
				({ widgetId }) => !hidden.has(widgetId),
			),
		);
	}

	getDefaultPage(): PageId {
		return this.settings.defaultPage;
	}

	getSnapshot(): DashboardSettings {
		return this.settings;
	}

	getWidgetSettings(): LocalWidgetSettings {
		return this.settings.widgets;
	}

	getMetadataSettings(): MetadataSettings {
		return this.settings.metadata;
	}

	getTemplateSettings(): AcademicTemplateSettings {
		return this.settings.templates;
	}

	getAgentSettings(): AgentSettings {
		return this.settings.agent;
	}

	getAgentWriteLog(): readonly AgentWriteLogEntry[] {
		return this.settings.agentWriteLog;
	}

	markAgentRequestComplete(entry: AgentWriteLogEntry): boolean {
		let index = -1;
		for (let candidateIndex = this.settings.agentWriteLog.length - 1; candidateIndex >= 0; candidateIndex -= 1) {
			const candidate = this.settings.agentWriteLog[candidateIndex]!;
			if (candidate.timestamp === entry.timestamp && candidate.workflowId === entry.workflowId &&
				candidate.target === entry.target && candidate.affectedPaths.join('\n') === entry.affectedPaths.join('\n')) {
				index = candidateIndex; break;
			}
		}
		if (index < 0 || this.settings.agentWriteLog[index]?.outcome === 'user-marked-complete') return false;
		const agentWriteLog = [...this.settings.agentWriteLog];
		const source = agentWriteLog[index]!;
		agentWriteLog[index] = Object.freeze({
			timestamp: source.timestamp,
			workflowId: source.workflowId,
			target: source.target,
			affectedPaths: source.affectedPaths,
			outcome: 'user-marked-complete',
			...(source.contextCharacters !== undefined ? { contextCharacters: source.contextCharacters } : {}),
		});
		return this.replaceSettings({ ...this.settings, agentWriteLog });
	}

	getLocalWriteSettings(): LocalWriteSettings {
		return this.settings.localWrites;
	}

	updateLocalWriteSettings(input: unknown): boolean {
		const localWrites = validateLocalWriteSettings(input);
		if (!localWrites.ok) {
			this.options.onDiagnostic?.({
				code: 'settings_update_rejected',
				issues: localWrites.issues,
			});
			return false;
		}
		return this.replaceSettings({ ...this.settings, localWrites: localWrites.value });
	}

	getLocalWriteLog(): readonly LocalWriteLogEvent[] {
		return this.settings.localWriteLog;
	}

	getGithubSettings(): GithubSettings {
		return this.settings.github;
	}

	updateGithubSettings(input: unknown): boolean {
		const github = validateGithubSettings(input);
		if (!github.ok) {
			this.options.onDiagnostic?.({
				code: 'settings_update_rejected',
				issues: github.issues,
			});
			return false;
		}
		return this.replaceSettings({ ...this.settings, github: github.value });
	}

	appendLocalWriteLog(input: unknown): boolean {
		const entry = validateLocalWriteLog([input]);
		if (!entry.ok) {
			this.options.onDiagnostic?.({
				code: 'settings_update_rejected',
				issues: entry.issues,
			});
			return false;
		}
		return this.replaceSettings({
			...this.settings,
			localWriteLog: [...this.settings.localWriteLog, entry.value[0]!].slice(-2_000),
		});
	}

	cleanLocalWriteLog(now: Date): number {
		if (!this.canMutateSettings()) return 0;
		const current = this.settings.localWriteLog;
		const cleaned = cleanExpiredLocalWriteLog(
			current,
			now,
			this.settings.localWrites.logRetentionDays,
		);
		const removed = current.length - cleaned.length;
		if (removed > 0) {
			this.replaceSettings({ ...this.settings, localWriteLog: cleaned });
		}
		return removed;
	}

	appendAgentWriteLog(input: unknown): boolean {
		const entry = validateAgentWriteLog([input]);
		if (!entry.ok) {
			this.options.onDiagnostic?.({
				code: 'settings_update_rejected',
				issues: entry.issues,
			});
			return false;
		}
		const candidate = [...this.settings.agentWriteLog, entry.value[0]!].slice(-2_000);
		return this.replaceSettings({
			...this.settings,
			agentWriteLog: candidate,
		});
	}

	cleanAgentWriteLog(now: Date): number {
		if (!this.canMutateSettings()) return 0;
		const current = this.settings.agentWriteLog;
		const cleaned = cleanExpiredAgentWriteLog(
			current,
			now,
			this.settings.agent.writeLogRetentionDays,
		);
		const removed = current.length - cleaned.length;
		if (removed > 0) {
			this.replaceSettings({ ...this.settings, agentWriteLog: cleaned });
		}
		return removed;
	}

	updateAgentSettings(input: unknown): boolean {
		const agent = validateAgentSettings(input);
		if (!agent.ok) {
			this.options.onDiagnostic?.({
				code: 'settings_update_rejected',
				issues: agent.issues,
			});
			return false;
		}
		return this.replaceSettings({ ...this.settings, agent: agent.value });
	}

	updateWidgetSettings(input: unknown): boolean {
		const widgets = validateLocalWidgetSettings(input);
		if (!widgets.ok) {
			this.options.onDiagnostic?.({
				code: 'settings_update_rejected',
				issues: widgets.issues,
			});
			return false;
		}
		const settings = validateDashboardSettings({
			...this.settings,
			widgets: widgets.value,
		});
		if (!settings.ok) return false;
		return this.replaceSettings(settings.value);
	}

	updateMetadataSettings(input: unknown): boolean {
		const metadata = validateMetadataSettings(input);
		if (!metadata.ok) {
			this.options.onDiagnostic?.({
				code: 'settings_update_rejected',
				issues: metadata.issues,
			});
			return false;
		}
		return this.replaceSettings({ ...this.settings, metadata: metadata.value });
	}

	updateTemplateSettings(input: unknown): boolean {
		const templates = validateAcademicTemplateSettings(input);
		if (!templates.ok) {
			this.options.onDiagnostic?.({
				code: 'settings_update_rejected',
				issues: templates.issues,
			});
			return false;
		}
		return this.replaceSettings({ ...this.settings, templates: templates.value });
	}

	updateDefaultPage(input: unknown): boolean {
		if (!isPageId(input)) return false;
		return this.replaceSettings({ ...this.settings, defaultPage: input });
	}

	setWidgetVisible(widgetId: string, visible: boolean): boolean {
		if (!isWidgetId(widgetId)) return false;
		const hidden = new Set<WidgetId>(this.settings.hiddenWidgetIds);
		if (visible) hidden.delete(widgetId);
		else hidden.add(widgetId);
		return this.replaceSettings({
			...this.settings,
			hiddenWidgetIds: [...hidden],
		});
	}

	updatePage(
		pageId: PageId,
		layouts: readonly PersistedWidgetLayout[],
	): boolean {
		const candidate = validatePersistedLayoutState({
			schemaVersion: this.settings.layouts.schemaVersion,
			pages: {
				...this.settings.layouts.pages,
				[pageId]: layouts,
			},
		});
		if (!candidate.ok) {
			this.options.onDiagnostic?.({
				code: 'layout_update_rejected',
				issues: candidate.issues,
			});
			return false;
		}

		return this.replaceSettings(
			settingsWithLayouts(this.settings, candidate.value),
		);
	}

	resetPage(pageId: PageId): void {
		this.updatePage(pageId, this.defaults.pages[pageId]);
	}

	resetAllPages(): void {
		this.replaceSettings(settingsWithLayouts(this.settings, this.defaults));
	}

	persistCurrent(): void {
		if (this.canMutateSettings()) this.requestSave();
	}

	async flush(): Promise<void> {
		while (this.saveTask) {
			await this.saveTask;
		}
	}

	private requestSave(): void {
		if (this.options.persistence === 'blocked-future-schema') return;
		this.requestedRevision += 1;
		this.startSaveTask();
	}

	private replaceSettings(input: unknown): boolean {
		if (!this.canMutateSettings()) return false;
		const settings = validateDashboardSettings(input);
		if (!settings.ok) {
			this.options.onDiagnostic?.({
				code: 'settings_update_rejected',
				issues: settings.issues,
			});
			return false;
		}
		this.settings = settings.value;
		this.requestSave();
		return true;
	}

	private canMutateSettings(): boolean {
		if (this.options.persistence !== 'blocked-future-schema') return true;
		if (!this.persistenceBlockReported) {
			this.persistenceBlockReported = true;
			this.options.onDiagnostic?.({
				code: 'settings_persistence_blocked',
				issues: Object.freeze([FUTURE_SCHEMA_ISSUE]),
			});
		}
		return false;
	}

	private startSaveTask(): void {
		if (this.saveTask) return;
		this.saveTask = this.drainSaves().finally(() => {
			this.saveTask = null;
			if (
				this.failedRevision !== null &&
				this.requestedRevision > this.failedRevision
			) {
				this.failedRevision = null;
				this.startSaveTask();
			}
		});
	}

	private async drainSaves(): Promise<void> {
		while (this.savedRevision < this.requestedRevision) {
			const targetRevision = this.requestedRevision;
			const snapshot = this.settings;
			try {
				await this.options.save(snapshot);
				this.savedRevision = targetRevision;
				this.failedRevision = null;
			} catch (error) {
				this.failedRevision = targetRevision;
				this.options.onDiagnostic?.({ code: 'layout_save_failed', error });
				return;
			}
		}
	}
}
