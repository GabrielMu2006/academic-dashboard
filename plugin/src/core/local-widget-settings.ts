import {
	isRecord,
	validationFailure,
	validationIssue,
	validationSuccess,
	type ValidationIssue,
	type ValidationResult,
} from './validation';
import { isSafeVaultRelativePath } from './template-settings';

export interface QuickLinkSetting {
	readonly label: string;
	readonly path: string;
}

export interface CommandShortcutSetting {
	readonly label: string;
	readonly commandId: string;
}

export interface LocalWidgetSettings {
	readonly quickLinks: readonly QuickLinkSetting[];
	readonly commands: readonly CommandShortcutSetting[];
	readonly quotes: readonly string[];
	readonly quoteFilePath: string;
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
});

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
	if (issues.length > 0) return validationFailure(issues);

	return validationSuccess(
		Object.freeze({
			quickLinks,
			commands,
			quotes,
			quoteFilePath: quoteFilePath ?? '',
		}),
	);
}
