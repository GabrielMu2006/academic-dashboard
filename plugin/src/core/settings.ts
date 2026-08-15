import {
	DEFAULT_AGENT_SETTINGS,
	validateAgentSettings,
	type AgentSettings,
} from './agent-settings';
import {
	validateAgentWriteLog,
	type AgentWriteLogEntry,
} from './agent-write-log';
import {
	EMPTY_LAYOUT_STATE,
	restorePersistedLayoutState,
	validatePersistedLayoutState,
	type PersistedLayoutState,
} from './layout';
import {
	DEFAULT_LOCAL_WIDGET_SETTINGS,
	validateLocalWidgetSettings,
	type LocalWidgetSettings,
} from './local-widget-settings';
import {
	DEFAULT_GITHUB_SETTINGS,
	validateGithubSettings,
	type GithubSettings,
} from './github-settings';
import {
	DEFAULT_LOCALE_SETTINGS,
	LOCALE_MODES,
	type LocaleSettings,
} from './localization';
import { validateLocalWriteLog } from './local-write-log';
import {
	DEFAULT_LOCAL_WRITE_SETTINGS,
	validateLocalWriteSettings,
	type LocalWriteSettings,
} from './local-write-settings';
import type { LocalWriteLogEvent } from './conservative-writes';
import {
	DEFAULT_METADATA_SETTINGS,
	validateMetadataSettings,
	type MetadataSettings,
} from './metadata-settings';
import { isPageId, type PageId } from './pages';
import {
	DEFAULT_TEMPLATE_SETTINGS,
	validateAcademicTemplateSettings,
	type AcademicTemplateSettings,
} from './template-settings';
import { isWidgetId, type WidgetId } from './widgets';
import {
	isRecord,
	validationFailure,
	validationIssue,
	validationSuccess,
	type ValidationIssue,
	type ValidationResult,
} from './validation';

export const SETTINGS_SCHEMA_VERSION = 5;

export interface DashboardSettings {
	readonly schemaVersion: typeof SETTINGS_SCHEMA_VERSION;
	readonly defaultPage: PageId;
	readonly layouts: PersistedLayoutState;
	readonly widgets: LocalWidgetSettings;
	readonly metadata: MetadataSettings;
	readonly templates: AcademicTemplateSettings;
	readonly agent: AgentSettings;
	readonly agentWriteLog: readonly AgentWriteLogEntry[];
	readonly localWrites: LocalWriteSettings;
	readonly localWriteLog: readonly LocalWriteLogEvent[];
	readonly github: GithubSettings;
	readonly locale: LocaleSettings;
	readonly hiddenWidgetIds: readonly WidgetId[];
}

export interface SettingsRestoreOptions {
	readonly fallback?: DashboardSettings;
	readonly knownWidgetIds?: ReadonlySet<string>;
}

export interface SettingsRestoreResult {
	readonly value: DashboardSettings;
	readonly source: 'stored' | 'migrated' | 'fallback';
	readonly issues: readonly ValidationIssue[];
}

function freezeSettings(
	defaultPage: PageId,
	layouts: PersistedLayoutState,
	widgets: LocalWidgetSettings,
	metadata: MetadataSettings,
	templates: AcademicTemplateSettings,
	agent: AgentSettings,
	agentWriteLog: readonly AgentWriteLogEntry[],
	localWrites: LocalWriteSettings,
	localWriteLog: readonly LocalWriteLogEvent[],
	github: GithubSettings,
	locale: LocaleSettings,
	hiddenWidgetIds: readonly WidgetId[],
): DashboardSettings {
	return Object.freeze({
		schemaVersion: SETTINGS_SCHEMA_VERSION,
		defaultPage,
		layouts,
		widgets,
		metadata,
		templates,
		agent,
		agentWriteLog: Object.freeze([...agentWriteLog]),
		localWrites,
		localWriteLog: Object.freeze([...localWriteLog]),
		github,
		locale: Object.freeze({ ...locale }),
		hiddenWidgetIds: Object.freeze([...hiddenWidgetIds]),
	});
}

export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = freezeSettings(
	'home',
	EMPTY_LAYOUT_STATE,
	DEFAULT_LOCAL_WIDGET_SETTINGS,
	DEFAULT_METADATA_SETTINGS,
	DEFAULT_TEMPLATE_SETTINGS,
	DEFAULT_AGENT_SETTINGS,
	[],
	DEFAULT_LOCAL_WRITE_SETTINGS,
	[],
	DEFAULT_GITHUB_SETTINGS,
	DEFAULT_LOCALE_SETTINGS,
	[],
);

function validateLocaleSettings(input: unknown): ValidationResult<LocaleSettings> {
	if (
		!isRecord(input) ||
		!LOCALE_MODES.includes(input.mode as LocaleSettings['mode'])
	) {
		return validationFailure([
			validationIssue(
				'invalid_locale_settings',
				'settings.locale.mode',
				'Expected auto, en, or zh-CN locale mode.',
			),
		]);
	}
	return validationSuccess(Object.freeze({ mode: input.mode as LocaleSettings['mode'] }));
}

function validateHiddenWidgetIds(
	input: unknown,
): ValidationResult<readonly WidgetId[]> {
	if (!Array.isArray(input)) {
		return validationFailure([
			validationIssue(
				'invalid_hidden_widgets',
				'settings.hiddenWidgetIds',
				'Expected an array of Widget IDs.',
			),
		]);
	}
	const issues: ValidationIssue[] = [];
	const parsed: WidgetId[] = [];
	const seen = new Set<string>();
	for (const [index, widgetId] of input.entries()) {
		if (!isWidgetId(widgetId) || seen.has(widgetId)) {
			issues.push(
				validationIssue(
					'invalid_hidden_widget_id',
					`settings.hiddenWidgetIds.${index}`,
					'Expected a unique namespaced Widget ID.',
				),
			);
			continue;
		}
		seen.add(widgetId);
		parsed.push(widgetId);
	}
	return issues.length > 0
		? validationFailure(issues)
		: validationSuccess(Object.freeze(parsed));
}

export function validateDashboardSettings(
	input: unknown,
	knownWidgetIds?: ReadonlySet<string>,
): ValidationResult<DashboardSettings> {
	if (!isRecord(input) || input.schemaVersion !== SETTINGS_SCHEMA_VERSION) {
		return validationFailure([
			validationIssue(
				'unsupported_settings_schema',
				'settings.schemaVersion',
				`Expected settings schema version ${SETTINGS_SCHEMA_VERSION}.`,
			),
		]);
	}

	const issues: ValidationIssue[] = [];
	if (!isPageId(input.defaultPage)) {
		issues.push(
			validationIssue(
				'invalid_default_page',
				'settings.defaultPage',
				'Expected a supported Dashboard page ID.',
			),
		);
	}

	const layouts = validatePersistedLayoutState(input.layouts, knownWidgetIds);
	if (!layouts.ok) {
		issues.push(...layouts.issues);
	}
	const widgets =
		input.widgets === undefined
			? validationSuccess(DEFAULT_LOCAL_WIDGET_SETTINGS)
			: validateLocalWidgetSettings(input.widgets);
	if (!widgets.ok) {
		issues.push(...widgets.issues);
	}
	const metadata = validateMetadataSettings(input.metadata);
	if (!metadata.ok) {
		issues.push(...metadata.issues);
	}
	const templates = validateAcademicTemplateSettings(input.templates);
	if (!templates.ok) {
		issues.push(...templates.issues);
	}
	const agent = validateAgentSettings(input.agent);
	if (!agent.ok) {
		issues.push(...agent.issues);
	}
	const agentWriteLog = input.agentWriteLog === undefined
		? validationSuccess(Object.freeze([]) as readonly AgentWriteLogEntry[])
		: validateAgentWriteLog(input.agentWriteLog);
	if (!agentWriteLog.ok) {
		issues.push(...agentWriteLog.issues);
	}
	const localWrites = validateLocalWriteSettings(input.localWrites);
	if (!localWrites.ok) issues.push(...localWrites.issues);
	const localWriteLog = input.localWriteLog === undefined
		? validationSuccess(Object.freeze([]) as readonly LocalWriteLogEvent[])
		: validateLocalWriteLog(input.localWriteLog);
	if (!localWriteLog.ok) issues.push(...localWriteLog.issues);
	const github = validateGithubSettings(input.github);
	if (!github.ok) issues.push(...github.issues);
	const locale = validateLocaleSettings(input.locale);
	if (!locale.ok) issues.push(...locale.issues);
	const hiddenWidgetIds =
		input.hiddenWidgetIds === undefined
			? validationSuccess(Object.freeze([]) as readonly WidgetId[])
			: validateHiddenWidgetIds(input.hiddenWidgetIds);
	if (!hiddenWidgetIds.ok) {
		issues.push(...hiddenWidgetIds.issues);
	}

	if (
		issues.length > 0 ||
		!layouts.ok ||
		!widgets.ok ||
		!metadata.ok ||
		!templates.ok ||
		!agent.ok ||
		!agentWriteLog.ok ||
		!localWrites.ok ||
		!localWriteLog.ok ||
		!github.ok ||
		!locale.ok ||
		!hiddenWidgetIds.ok
	) {
		return validationFailure(issues);
	}

	return validationSuccess(
		freezeSettings(
			input.defaultPage as PageId,
			layouts.value,
			widgets.value,
			metadata.value,
			templates.value,
			agent.value,
			agentWriteLog.value,
			localWrites.value,
			localWriteLog.value,
			github.value,
			locale.value,
			hiddenWidgetIds.value,
		),
	);
}

export function migrateDashboardSettings(
	input: unknown,
	knownWidgetIds?: ReadonlySet<string>,
): ValidationResult<DashboardSettings> {
	if (
		!isRecord(input) ||
		(input.schemaVersion !== 0 &&
			input.schemaVersion !== 1 &&
			input.schemaVersion !== 2 &&
			input.schemaVersion !== 3 &&
			input.schemaVersion !== 4)
	) {
		return validationFailure([
			validationIssue(
				'unsupported_settings_migration',
				'settings.schemaVersion',
				`Only settings schema versions 0 through 4 can migrate to version ${SETTINGS_SCHEMA_VERSION}.`,
			),
		]);
	}

	const issues: ValidationIssue[] = [];
	const legacyPage = input.schemaVersion === 0 ? input.startPage : input.defaultPage;
	const pagePath = input.schemaVersion === 0 ? 'settings.startPage' : 'settings.defaultPage';
	if (!isPageId(legacyPage)) {
		issues.push(
			validationIssue(
				'invalid_default_page',
				pagePath,
				'Expected a supported Dashboard page ID.',
			),
		);
	}

	const layoutInput = input.schemaVersion === 0 ? input.layout : input.layouts;
	const layouts = restorePersistedLayoutState(layoutInput, { knownWidgetIds });
	if (layouts.source === 'fallback') issues.push(...layouts.issues);

	const widgets =
		input.schemaVersion === 0 || input.widgets === undefined
			? validationSuccess(DEFAULT_LOCAL_WIDGET_SETTINGS)
			: validateLocalWidgetSettings(input.widgets);
	if (!widgets.ok) issues.push(...widgets.issues);

	const metadata =
		input.schemaVersion === 2 || input.schemaVersion === 3 || input.schemaVersion === 4
			? validateMetadataSettings(input.metadata)
			: validationSuccess(DEFAULT_METADATA_SETTINGS);
	if (!metadata.ok) issues.push(...metadata.issues);

	const templates =
		input.schemaVersion === 3 || input.schemaVersion === 4
			? validateAcademicTemplateSettings(input.templates)
			: validationSuccess(DEFAULT_TEMPLATE_SETTINGS);
	if (!templates.ok) issues.push(...templates.issues);

	const hiddenWidgetIds =
		input.schemaVersion === 0 || input.hiddenWidgetIds === undefined
			? validationSuccess(Object.freeze([]) as readonly WidgetId[])
			: validateHiddenWidgetIds(input.hiddenWidgetIds);
	if (!hiddenWidgetIds.ok) issues.push(...hiddenWidgetIds.issues);
	const agent = input.schemaVersion === 4
		? validateAgentSettings(input.agent)
		: validationSuccess(DEFAULT_AGENT_SETTINGS);
	if (!agent.ok) issues.push(...agent.issues);
	const agentWriteLog = input.schemaVersion === 4
		? input.agentWriteLog === undefined
			? validationSuccess(Object.freeze([]) as readonly AgentWriteLogEntry[])
			: validateAgentWriteLog(input.agentWriteLog)
		: validationSuccess(Object.freeze([]) as readonly AgentWriteLogEntry[]);
	if (!agentWriteLog.ok) issues.push(...agentWriteLog.issues);

	if (
		issues.length > 0 ||
		!widgets.ok ||
		!metadata.ok ||
		!templates.ok ||
		!agent.ok ||
		!agentWriteLog.ok ||
		!hiddenWidgetIds.ok
	) {
		return validationFailure(issues);
	}

	return validationSuccess(
		freezeSettings(
			legacyPage as PageId,
			layouts.value,
			widgets.value,
			metadata.value,
			templates.value,
			agent.value,
			agentWriteLog.value,
			DEFAULT_LOCAL_WRITE_SETTINGS,
			[],
			DEFAULT_GITHUB_SETTINGS,
			DEFAULT_LOCALE_SETTINGS,
			hiddenWidgetIds.value,
		),
	);
}

function trustedSettingsFallback(
	candidate: DashboardSettings | undefined,
): DashboardSettings {
	if (!candidate) {
		return freezeSettings(
			'home',
			EMPTY_LAYOUT_STATE,
			DEFAULT_LOCAL_WIDGET_SETTINGS,
			DEFAULT_METADATA_SETTINGS,
			DEFAULT_TEMPLATE_SETTINGS,
			DEFAULT_AGENT_SETTINGS,
			[],
			DEFAULT_LOCAL_WRITE_SETTINGS,
			[],
			DEFAULT_GITHUB_SETTINGS,
			DEFAULT_LOCALE_SETTINGS,
			[],
		);
	}
	const validated = validateDashboardSettings(candidate);
	return validated.ok
		? freezeSettings(
				validated.value.defaultPage,
				validated.value.layouts,
				validated.value.widgets,
				validated.value.metadata,
				validated.value.templates,
				validated.value.agent,
				validated.value.agentWriteLog,
				validated.value.localWrites,
				validated.value.localWriteLog,
				validated.value.github,
				validated.value.locale,
				validated.value.hiddenWidgetIds,
			)
		: freezeSettings(
				'home',
				EMPTY_LAYOUT_STATE,
				DEFAULT_LOCAL_WIDGET_SETTINGS,
				DEFAULT_METADATA_SETTINGS,
				DEFAULT_TEMPLATE_SETTINGS,
				DEFAULT_AGENT_SETTINGS,
				[],
				DEFAULT_LOCAL_WRITE_SETTINGS,
				[],
				DEFAULT_GITHUB_SETTINGS,
				DEFAULT_LOCALE_SETTINGS,
				[],
			);
}

export function restoreDashboardSettings(
	input: unknown,
	options: SettingsRestoreOptions = {},
): SettingsRestoreResult {
	const fallback = trustedSettingsFallback(options.fallback);
	if (
		isRecord(input) &&
		(input.schemaVersion === 0 ||
			input.schemaVersion === 1 ||
			input.schemaVersion === 2 ||
			input.schemaVersion === 3 ||
			input.schemaVersion === 4)
	) {
		const migrated = migrateDashboardSettings(input, options.knownWidgetIds);
		return migrated.ok
			? { value: migrated.value, source: 'migrated', issues: [] }
			: { value: fallback, source: 'fallback', issues: migrated.issues };
	}
	if (isRecord(input) && input.schemaVersion === SETTINGS_SCHEMA_VERSION) {
		const issues: ValidationIssue[] = [];
		const defaultPage = isPageId(input.defaultPage)
			? input.defaultPage
			: fallback.defaultPage;
		if (!isPageId(input.defaultPage)) {
			issues.push(
				validationIssue(
					'invalid_default_page',
					'settings.defaultPage',
					'Expected a supported Dashboard page ID.',
				),
			);
		}

		const layouts = restorePersistedLayoutState(input.layouts, {
			fallback: fallback.layouts,
			knownWidgetIds: options.knownWidgetIds,
		});
		if (layouts.source === 'fallback') issues.push(...layouts.issues);

		const widgets =
			input.widgets === undefined
				? validationSuccess(fallback.widgets)
				: validateLocalWidgetSettings(input.widgets);
		if (!widgets.ok) issues.push(...widgets.issues);

		const metadata = validateMetadataSettings(input.metadata);
		if (!metadata.ok) issues.push(...metadata.issues);

		const templates = validateAcademicTemplateSettings(input.templates);
		if (!templates.ok) issues.push(...templates.issues);

		const agent = validateAgentSettings(input.agent);
		if (!agent.ok) issues.push(...agent.issues);

		const agentWriteLog = input.agentWriteLog === undefined
			? validationSuccess(fallback.agentWriteLog)
			: validateAgentWriteLog(input.agentWriteLog);
		if (!agentWriteLog.ok) issues.push(...agentWriteLog.issues);

		const localWrites = validateLocalWriteSettings(input.localWrites);
		if (!localWrites.ok) issues.push(...localWrites.issues);
		const localWriteLog = input.localWriteLog === undefined
			? validationSuccess(fallback.localWriteLog)
			: validateLocalWriteLog(input.localWriteLog);
		if (!localWriteLog.ok) issues.push(...localWriteLog.issues);
		const github = validateGithubSettings(input.github);
		if (!github.ok) issues.push(...github.issues);
		const locale = validateLocaleSettings(input.locale);
		if (!locale.ok) issues.push(...locale.issues);

		const hiddenWidgetIds =
			input.hiddenWidgetIds === undefined
				? validationSuccess(fallback.hiddenWidgetIds)
				: validateHiddenWidgetIds(input.hiddenWidgetIds);
		if (!hiddenWidgetIds.ok) issues.push(...hiddenWidgetIds.issues);

		return {
			value: freezeSettings(
				defaultPage,
				layouts.value,
				widgets.ok ? widgets.value : fallback.widgets,
				metadata.ok ? metadata.value : fallback.metadata,
				templates.ok ? templates.value : fallback.templates,
				agent.ok ? agent.value : fallback.agent,
				agentWriteLog.ok ? agentWriteLog.value : fallback.agentWriteLog,
				localWrites.ok ? localWrites.value : fallback.localWrites,
				localWriteLog.ok ? localWriteLog.value : fallback.localWriteLog,
				github.ok ? github.value : fallback.github,
				locale.ok ? locale.value : fallback.locale,
				hiddenWidgetIds.ok
					? hiddenWidgetIds.value
					: fallback.hiddenWidgetIds,
			),
			source:
				issues.length > 0
					? 'fallback'
					: layouts.source === 'migrated'
						? 'migrated'
						: 'stored',
			issues: Object.freeze(issues),
		};
	}

	const validated = validateDashboardSettings(input, options.knownWidgetIds);
	return validated.ok
		? { value: validated.value, source: 'stored', issues: [] }
		: { value: fallback, source: 'fallback', issues: validated.issues };
}
