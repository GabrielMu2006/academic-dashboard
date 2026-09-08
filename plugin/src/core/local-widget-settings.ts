import {
	isRecord,
	validationFailure,
	validationIssue,
	validationSuccess,
	type ValidationIssue,
	type ValidationResult,
} from './validation';
import { isSafeVaultRelativePath } from './template-settings';
import { validateReadingProgressRecords, type ReadingProgressRecord } from './reading-queue';
import { PAPER_STATUSES } from './metadata-settings';
import type { SavedResearchView, PaperStatusFilter } from './research';

export interface QuickLinkSetting {
	readonly label: string;
	readonly path: string;
}

export interface CommandShortcutSetting {
	readonly label: string;
	readonly commandId: string;
}

export interface TodayFocusSetting {
	readonly label: string;
	readonly path: string;
	readonly line?: number;
}

export interface LocalWidgetSettings {
	readonly quickLinks: readonly QuickLinkSetting[];
	readonly commands: readonly CommandShortcutSetting[];
	readonly quotes: readonly string[];
	readonly quoteFilePath: string;
	readonly todayFocus: readonly TodayFocusSetting[];
	readonly currentTerm: string;
	readonly readingQueue: readonly ReadingProgressRecord[];
	readonly savedResearchViews: readonly SavedResearchView[];
}

const MAX_ITEMS = 20;
const MAX_LABEL_LENGTH = 80;
const MAX_PATH_LENGTH = 400;
const MAX_QUOTE_LENGTH = 500;

export const DEFAULT_LOCAL_WIDGET_SETTINGS: LocalWidgetSettings = Object.freeze({
	quickLinks: Object.freeze([]),
	commands: Object.freeze([
		Object.freeze({ label: 'Command palette', commandId: 'command-palette:open' }),
		Object.freeze({ label: 'Search Vault', commandId: 'global-search:open' }),
	]),
	quotes: Object.freeze([
		'Small, steady progress compounds.',
		'Clarity grows when the next step is visible.',
		'Leave the workspace calmer than you found it.',
	]),
	quoteFilePath: '每日引言.md',
	todayFocus: Object.freeze([]),
	currentTerm: '',
	readingQueue: Object.freeze([]),
	savedResearchViews: Object.freeze([]),
});

function validateSavedResearchViews(input: unknown, issues: ValidationIssue[]): readonly SavedResearchView[] {
	if (!Array.isArray(input) || input.length > 12) {
		issues.push(validationIssue('invalid_saved_research_views', 'settings.widgets.savedResearchViews', 'Expected at most 12 saved research views.'));
		return Object.freeze([]);
	}
	const result: SavedResearchView[] = []; const ids = new Set<string>();
	for (const [index, value] of input.entries()) {
		const base = `settings.widgets.savedResearchViews.${index}`;
		if (!isRecord(value)) { issues.push(validationIssue('invalid_saved_research_view', base, 'Expected a saved research view.')); continue; }
		const status = value.status === 'all' || value.status === 'unspecified' || (PAPER_STATUSES as readonly unknown[]).includes(value.status) ? value.status as PaperStatusFilter : null;
		const tags = Array.isArray(value.tags) ? [...new Set(value.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim().replace(/^#/u, '').toLocaleLowerCase()).filter(Boolean))] : [];
		const year = value.year === undefined ? undefined : typeof value.year === 'number' && Number.isInteger(value.year) && value.year >= 1000 && value.year <= 9999 ? value.year : null;
		if (typeof value.id !== 'string' || !/^[a-z0-9-]{1,60}$/u.test(value.id) || ids.has(value.id) || !validText(value.name, 80) || typeof value.search !== 'string' || value.search.trim().length > 120 || !status || tags.length > 10 || year === null || typeof value.pinned !== 'boolean') {
			issues.push(validationIssue('invalid_saved_research_view', base, 'Expected a unique ID and bounded reproducible query.')); continue;
		}
		ids.add(value.id); result.push(Object.freeze({ id: value.id, name: value.name.trim(), search: value.search.trim(), status, tags: Object.freeze(tags), ...(year ? { year } : {}), pinned: value.pinned }));
	}
	return Object.freeze(result);
}

function validateTodayFocus(
	input: unknown,
	issues: ValidationIssue[],
): readonly TodayFocusSetting[] {
	if (!Array.isArray(input) || input.length > 3) {
		issues.push(validationIssue('invalid_today_focus', 'settings.widgets.todayFocus', 'Expected at most three focus references.'));
		return [];
	}
	const parsed: TodayFocusSetting[] = [];
	const seen = new Set<string>();
	for (const [index, item] of input.entries()) {
		const base = `settings.widgets.todayFocus.${index}`;
		const line = isRecord(item) && typeof item.line === 'number' &&
			Number.isInteger(item.line) && item.line >= 1 ? item.line : undefined;
		if (!isRecord(item) || !validText(item.label, MAX_LABEL_LENGTH) ||
			!isSafeVaultRelativePath(item.path, { markdownFile: true }) ||
			(item.line !== undefined && line === undefined)) {
			issues.push(validationIssue('invalid_today_focus_reference', base, 'Expected a label, visible Vault-relative path, and optional positive line.'));
			continue;
		}
		const key = `${item.path}:${line ?? ''}`;
		if (seen.has(key)) {
			issues.push(validationIssue('duplicate_today_focus_reference', base, 'Expected unique focus references.'));
			continue;
		}
		seen.add(key);
		parsed.push(Object.freeze({
			label: item.label.trim(),
			path: item.path.trim(),
			...(line !== undefined ? { line } : {}),
		}));
	}
	return Object.freeze(parsed);
}

function validText(value: unknown, maximum: number): value is string {
	return (
		typeof value === 'string' &&
		value.trim().length > 0 &&
		value.trim().length <= maximum
	);
}

function validateQuickLinks(
	input: unknown,
	issues: ValidationIssue[],
): readonly QuickLinkSetting[] {
	if (!Array.isArray(input) || input.length > MAX_ITEMS) {
		issues.push(
			validationIssue(
				'invalid_quick_links',
				'settings.widgets.quickLinks',
				`Expected an array with at most ${MAX_ITEMS} quick links.`,
			),
		);
		return [];
	}

	const parsed: QuickLinkSetting[] = [];
	for (const [index, item] of input.entries()) {
		const path = `settings.widgets.quickLinks.${index}`;
		if (!isRecord(item)) {
			issues.push(validationIssue('invalid_quick_link', path, 'Expected an object.'));
			continue;
		}
		if (!validText(item.label, MAX_LABEL_LENGTH)) {
			issues.push(
				validationIssue('invalid_label', `${path}.label`, 'Expected a short label.'),
			);
		}
		if (
			!validText(item.path, MAX_PATH_LENGTH) ||
			item.path.startsWith('/') ||
			item.path.includes('\\') ||
			/^[a-z]:/i.test(item.path) ||
			item.path.split('/').includes('..')
		) {
			issues.push(
				validationIssue(
					'invalid_vault_path',
					`${path}.path`,
					'Expected a relative path inside the Vault.',
				),
			);
		}
		if (validText(item.label, MAX_LABEL_LENGTH) && validText(item.path, MAX_PATH_LENGTH)) {
			parsed.push(
				Object.freeze({ label: item.label.trim(), path: item.path.trim() }),
			);
		}
	}
	return Object.freeze(parsed);
}

function validateCommands(
	input: unknown,
	issues: ValidationIssue[],
): readonly CommandShortcutSetting[] {
	if (!Array.isArray(input) || input.length > MAX_ITEMS) {
		issues.push(
			validationIssue(
				'invalid_commands',
				'settings.widgets.commands',
				`Expected an array with at most ${MAX_ITEMS} commands.`,
			),
		);
		return [];
	}

	const parsed: CommandShortcutSetting[] = [];
	for (const [index, item] of input.entries()) {
		const path = `settings.widgets.commands.${index}`;
		if (!isRecord(item)) {
			issues.push(validationIssue('invalid_command', path, 'Expected an object.'));
			continue;
		}
		if (!validText(item.label, MAX_LABEL_LENGTH)) {
			issues.push(
				validationIssue('invalid_label', `${path}.label`, 'Expected a short label.'),
			);
		}
		if (!validText(item.commandId, MAX_LABEL_LENGTH)) {
			issues.push(
				validationIssue(
					'invalid_command_id',
					`${path}.commandId`,
					'Expected a non-empty Obsidian command ID.',
				),
			);
		}
		if (
			validText(item.label, MAX_LABEL_LENGTH) &&
			validText(item.commandId, MAX_LABEL_LENGTH)
		) {
			parsed.push(
				Object.freeze({
					label: item.label.trim(),
					commandId: item.commandId.trim(),
				}),
			);
		}
	}
	return Object.freeze(parsed);
}

function validateQuotes(
	input: unknown,
	issues: ValidationIssue[],
): readonly string[] {
	if (!Array.isArray(input) || input.length > MAX_ITEMS) {
		issues.push(
			validationIssue(
				'invalid_quotes',
				'settings.widgets.quotes',
				`Expected an array with at most ${MAX_ITEMS} quotes.`,
			),
		);
		return [];
	}

	const parsed: string[] = [];
	for (const [index, quote] of input.entries()) {
		if (!validText(quote, MAX_QUOTE_LENGTH)) {
			issues.push(
				validationIssue(
					'invalid_quote',
					`settings.widgets.quotes.${index}`,
					'Expected a non-empty local quote.',
				),
			);
			continue;
		}
		parsed.push(quote.trim());
	}
	return Object.freeze(parsed);
}

export function validateLocalWidgetSettings(
	input: unknown,
): ValidationResult<LocalWidgetSettings> {
	if (!isRecord(input)) {
		return validationFailure([
			validationIssue(
				'invalid_widget_settings',
				'settings.widgets',
				'Expected local Widget settings.',
			),
		]);
	}

	const issues: ValidationIssue[] = [];
	const quickLinks = validateQuickLinks(input.quickLinks, issues);
	const commands = validateCommands(input.commands, issues);
	const quotes = validateQuotes(input.quotes, issues);
	const quoteFilePath = input.quoteFilePath === undefined
		? ''
		: typeof input.quoteFilePath === 'string'
			? input.quoteFilePath.trim()
			: null;
	if (
		quoteFilePath === null ||
		!isSafeVaultRelativePath(quoteFilePath, {
			allowEmpty: true,
			markdownFile: quoteFilePath !== '',
		})
	) {
		issues.push(
			validationIssue(
				'invalid_quote_file_path',
				'settings.widgets.quoteFilePath',
				'Expected an optional visible Vault-relative Markdown path.',
			),
		);
	}
	const todayFocus = validateTodayFocus(input.todayFocus ?? [], issues);
	const readingQueue = validateReadingProgressRecords(input.readingQueue ?? []);
	if (!readingQueue.ok) issues.push(...readingQueue.issues);
	const savedResearchViews = validateSavedResearchViews(input.savedResearchViews ?? [], issues);
	const currentTerm = input.currentTerm === undefined
		? ''
		: typeof input.currentTerm === 'string' && input.currentTerm.trim().length <= 120
			? input.currentTerm.trim()
			: null;
	if (currentTerm === null) {
		issues.push(validationIssue('invalid_current_term', 'settings.widgets.currentTerm', 'Expected an optional term with at most 120 characters.'));
	}
	if (issues.length > 0) return validationFailure(issues);

	return validationSuccess(
		Object.freeze({
			quickLinks,
			commands,
			quotes,
			quoteFilePath: quoteFilePath ?? '',
			todayFocus,
			currentTerm: currentTerm ?? '',
			readingQueue: readingQueue.ok ? readingQueue.value : Object.freeze([]),
			savedResearchViews,
		}),
	);
}
