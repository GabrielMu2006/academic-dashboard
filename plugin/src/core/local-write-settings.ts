import { isSafeVaultRelativePath } from './template-settings';
import {
	isRecord,
	validationFailure,
	validationIssue,
	validationSuccess,
	type ValidationIssue,
	type ValidationResult,
} from './validation';

export const DAILY_NOTE_TEMPLATE_SOURCES = ['dashboard', 'vault'] as const;
export type DailyNoteTemplateSource =
	(typeof DAILY_NOTE_TEMPLATE_SOURCES)[number];

export interface DailyNoteWriteSettings {
	readonly folder: string;
	readonly filenameFormat: string;
	readonly templateSource: DailyNoteTemplateSource;
	readonly dashboardTemplate: string;
	readonly vaultTemplatePath: string;
}

export interface PaperWriteSettings {
	readonly statusField: string;
	readonly favoriteField: string;
}

export interface LocalWriteSettings {
	readonly dailyNote: DailyNoteWriteSettings;
	readonly paper: PaperWriteSettings;
	readonly logRetentionDays: number;
}

export const DEFAULT_DAILY_NOTE_TEMPLATE = '# {{date}}\n\n';

export const DEFAULT_LOCAL_WRITE_SETTINGS: LocalWriteSettings = Object.freeze({
	dailyNote: Object.freeze({
		folder: 'Daily Notes',
		filenameFormat: 'YYYY-MM-DD.md',
		templateSource: 'dashboard',
		dashboardTemplate: DEFAULT_DAILY_NOTE_TEMPLATE,
		vaultTemplatePath: '',
	}),
	paper: Object.freeze({
		statusField: 'status',
		favoriteField: 'favorite',
	}),
	logRetentionDays: 30,
});

const MAX_TEMPLATE_LENGTH = 30_000;
const FIELD_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,119}$/u;

export function isSafeDailyFilenameFormat(value: unknown): value is string {
	if (typeof value !== 'string' || !value || value.length > 120) return false;
	if (!value.toLowerCase().endsWith('.md') || /[\\/]/u.test(value)) return false;
	if (/\.\.|^\./u.test(value)) return false;
	const withoutTokens = value.replace(/YYYY|MM|DD/gu, '0');
	return /^[A-Za-z0-9 _.-]+\.md$/u.test(withoutTokens);
}

function freezeSettings(settings: LocalWriteSettings): LocalWriteSettings {
	return Object.freeze({
		dailyNote: Object.freeze({ ...settings.dailyNote }),
		paper: Object.freeze({ ...settings.paper }),
		logRetentionDays: settings.logRetentionDays,
	});
}

export function validateLocalWriteSettings(
	input: unknown,
): ValidationResult<LocalWriteSettings> {
	if (!isRecord(input) || !isRecord(input.dailyNote) || !isRecord(input.paper)) {
		return validationFailure([
			validationIssue(
				'invalid_local_write_settings',
				'settings.localWrites',
				'Expected local write settings.',
			),
		]);
	}
	const issues: ValidationIssue[] = [];
	const daily = input.dailyNote;
	const paper = input.paper;
	if (!isSafeVaultRelativePath(daily.folder)) {
		issues.push(validationIssue(
			'invalid_daily_note_folder',
			'settings.localWrites.dailyNote.folder',
			'Expected a visible Vault-relative folder.',
		));
	}
	if (!isSafeDailyFilenameFormat(daily.filenameFormat)) {
		issues.push(validationIssue(
			'invalid_daily_note_filename_format',
			'settings.localWrites.dailyNote.filenameFormat',
			'Expected a safe Markdown filename format.',
		));
	}
	if (!DAILY_NOTE_TEMPLATE_SOURCES.includes(daily.templateSource as DailyNoteTemplateSource)) {
		issues.push(validationIssue(
			'invalid_daily_note_template_source',
			'settings.localWrites.dailyNote.templateSource',
			'Expected dashboard or Vault template source.',
		));
	}
	if (
		typeof daily.dashboardTemplate !== 'string' ||
		!daily.dashboardTemplate.trim() ||
		daily.dashboardTemplate.length > MAX_TEMPLATE_LENGTH
	) {
		issues.push(validationIssue(
			'invalid_daily_note_template',
			'settings.localWrites.dailyNote.dashboardTemplate',
			'Expected bounded Dashboard template content.',
		));
	}
	const requiresVaultTemplate = daily.templateSource === 'vault';
	if (!isSafeVaultRelativePath(daily.vaultTemplatePath, {
		allowEmpty: !requiresVaultTemplate,
		markdownFile: requiresVaultTemplate,
	})) {
		issues.push(validationIssue(
			'invalid_daily_note_template_path',
			'settings.localWrites.dailyNote.vaultTemplatePath',
			'Expected a safe Vault-relative Markdown template path.',
		));
	}
	if (!FIELD_PATTERN.test(String(paper.statusField))) {
		issues.push(validationIssue(
			'invalid_paper_status_field',
			'settings.localWrites.paper.statusField',
			'Expected a simple frontmatter field name.',
		));
	}
	if (!FIELD_PATTERN.test(String(paper.favoriteField))) {
		issues.push(validationIssue(
			'invalid_paper_favorite_field',
			'settings.localWrites.paper.favoriteField',
			'Expected a simple frontmatter field name.',
		));
	}
	if (paper.statusField === paper.favoriteField) {
		issues.push(validationIssue(
			'duplicate_paper_write_field',
			'settings.localWrites.paper',
			'Paper status and favorite fields must differ.',
		));
	}
	if (
		typeof input.logRetentionDays !== 'number' ||
		!Number.isInteger(input.logRetentionDays) ||
		input.logRetentionDays < 1 ||
		input.logRetentionDays > 3650
	) {
		issues.push(validationIssue(
			'invalid_local_write_retention',
			'settings.localWrites.logRetentionDays',
			'Expected a retention period from 1 to 3650 days.',
		));
	}
	if (issues.length > 0) return validationFailure(issues);
	return validationSuccess(freezeSettings({
		dailyNote: {
			folder: (daily.folder as string).trim().replace(/\/$/u, ''),
			filenameFormat: daily.filenameFormat as string,
			templateSource: daily.templateSource as DailyNoteTemplateSource,
			dashboardTemplate: (daily.dashboardTemplate as string).replace(/\r\n/gu, '\n'),
			vaultTemplatePath: (daily.vaultTemplatePath as string).trim().replace(/\/$/u, ''),
		},
		paper: {
			statusField: paper.statusField as string,
			favoriteField: paper.favoriteField as string,
		},
		logRetentionDays: input.logRetentionDays as number,
	}));
}
