import {
	isRecord,
	validationFailure,
	validationIssue,
	validationSuccess,
	type ValidationIssue,
	type ValidationResult,
} from './validation';

export const TEMPLATE_SOURCE_KINDS = ['custom', 'vault'] as const;
export type TemplateSourceKind = (typeof TEMPLATE_SOURCE_KINDS)[number];

export interface NoteTemplateSetting {
	readonly source: TemplateSourceKind;
	readonly customTemplate: string;
	readonly vaultTemplatePath: string;
	readonly destinationFolder: string;
}

export interface AcademicTemplateSettings {
	readonly courseNote: NoteTemplateSetting;
	readonly paperReading: NoteTemplateSetting;
	readonly bookReading: NoteTemplateSetting;
}

export const BOOK_READING_NOTE_TYPE = 'book-note';

export const DEFAULT_COURSE_NOTE_TEMPLATE = `---
"{{field.noteType}}": "{{value.courseNoteType}}"
"{{field.course}}": ""
"{{field.term}}": ""
"{{field.date}}": "{{date}}"
"{{field.tags}}": []
---

# {{title}}

## Notes
`;

export const DEFAULT_PAPER_READING_TEMPLATE = `---
"{{field.noteType}}": "{{value.paperType}}"
"{{field.title}}": "{{titleYaml}}"
"{{field.authors}}": []
"{{field.year}}": null
"{{field.status}}": "unread"
"{{field.venue}}": ""
"{{field.doi}}": ""
"{{field.tags}}": []
---

# {{title}}

## Summary

## Notes
`;

export const DEFAULT_BOOK_READING_TEMPLATE = `---
"{{field.noteType}}": "${BOOK_READING_NOTE_TYPE}"
"{{field.title}}": "{{titleYaml}}"
"{{field.authors}}": []
"{{field.status}}": "reading"
"{{field.date}}": "{{date}}"
"{{field.tags}}": []
---

# {{title}}

## 书目信息

## 内容概述

## 核心观点

## 摘录与批注

## 读后思考
`;

function freezeTemplate(setting: NoteTemplateSetting): NoteTemplateSetting {
	return Object.freeze({ ...setting });
}

function freezeTemplates(
	settings: AcademicTemplateSettings,
): AcademicTemplateSettings {
	return Object.freeze({
		courseNote: freezeTemplate(settings.courseNote),
		paperReading: freezeTemplate(settings.paperReading),
		bookReading: freezeTemplate(settings.bookReading),
	});
}

export const DEFAULT_TEMPLATE_SETTINGS: AcademicTemplateSettings = freezeTemplates({
	courseNote: {
		source: 'custom',
		customTemplate: DEFAULT_COURSE_NOTE_TEMPLATE,
		vaultTemplatePath: '',
		destinationFolder: 'Course',
	},
	paperReading: {
		source: 'custom',
		customTemplate: DEFAULT_PAPER_READING_TEMPLATE,
		vaultTemplatePath: '',
		destinationFolder: 'Paper',
	},
	bookReading: {
		source: 'custom',
		customTemplate: DEFAULT_BOOK_READING_TEMPLATE,
		vaultTemplatePath: '',
		destinationFolder: 'Reading',
	},
});

const MAX_TEMPLATE_LENGTH = 30_000;
const MAX_VAULT_PATH_LENGTH = 400;

export function isSafeVaultRelativePath(
	value: unknown,
	options: { readonly allowEmpty?: boolean; readonly markdownFile?: boolean } = {},
): value is string {
	if (typeof value !== 'string') return false;
	const path = value.trim().replace(/\/$/, '');
	if (!path) return options.allowEmpty === true;
	if (
		path.length > MAX_VAULT_PATH_LENGTH ||
		path.startsWith('/') ||
		path.includes('\\') ||
		/^[a-z]:/i.test(path)
	) {
		return false;
	}
	const segments = path.split('/');
	if (
		segments.some(
			(segment) => !segment || segment === '.' || segment === '..' || segment.startsWith('.'),
		)
	) {
		return false;
	}
	return options.markdownFile !== true || path.toLowerCase().endsWith('.md');
}

function validateTemplate(
	input: unknown,
	path: string,
	issues: ValidationIssue[],
): NoteTemplateSetting | null {
	if (!isRecord(input)) {
		issues.push(validationIssue('invalid_template', path, 'Expected template settings.'));
		return null;
	}
	if (!TEMPLATE_SOURCE_KINDS.includes(input.source as TemplateSourceKind)) {
		issues.push(
			validationIssue(
				'invalid_template_source',
				`${path}.source`,
				'Expected custom or Vault template source.',
			),
		);
	}
	const source = input.source as TemplateSourceKind;
	if (
		typeof input.customTemplate !== 'string' ||
		(source !== 'vault' && !input.customTemplate.trim()) ||
		input.customTemplate.length > MAX_TEMPLATE_LENGTH
	) {
		issues.push(
			validationIssue(
				'invalid_custom_template',
				`${path}.customTemplate`,
				'Expected a non-empty bounded Markdown template.',
			),
		);
	}
	const vaultPathValid = isSafeVaultRelativePath(input.vaultTemplatePath, {
		allowEmpty: source !== 'vault',
		markdownFile: source === 'vault',
	});
	if (!vaultPathValid) {
		issues.push(
			validationIssue(
				'invalid_template_path',
				`${path}.vaultTemplatePath`,
				'Expected a safe Vault-relative Markdown path.',
			),
		);
	}
	if (!isSafeVaultRelativePath(input.destinationFolder)) {
		issues.push(
			validationIssue(
				'invalid_destination_folder',
				`${path}.destinationFolder`,
				'Expected a safe Vault-relative destination folder.',
			),
		);
	}
	if (
		issues.some((issue) => issue.path === path || issue.path.startsWith(`${path}.`))
	) {
		return null;
	}
	return freezeTemplate({
		source,
		customTemplate: (input.customTemplate as string).replace(/\r\n/g, '\n'),
		vaultTemplatePath: (input.vaultTemplatePath as string).trim().replace(/\/$/, ''),
		destinationFolder: (input.destinationFolder as string)
			.trim()
			.replace(/\/$/, ''),
	});
}

export function validateAcademicTemplateSettings(
	input: unknown,
): ValidationResult<AcademicTemplateSettings> {
	if (!isRecord(input)) {
		return validationFailure([
			validationIssue(
				'invalid_template_settings',
				'settings.templates',
				'Expected academic template settings.',
			),
		]);
	}
	const issues: ValidationIssue[] = [];
	const courseNote = validateTemplate(
		input.courseNote,
		'settings.templates.courseNote',
		issues,
	);
	const paperReading = validateTemplate(
		input.paperReading,
		'settings.templates.paperReading',
		issues,
	);
	const bookReading = validateTemplate(
		input.bookReading,
		'settings.templates.bookReading',
		issues,
	);
	if (issues.length > 0 || !courseNote || !paperReading || !bookReading) {
		return validationFailure(issues);
	}
	return validationSuccess(freezeTemplates({ courseNote, paperReading, bookReading }));
}

export function migrateAcademicTemplateSettings(
	input: unknown,
): ValidationResult<AcademicTemplateSettings> {
	if (!isRecord(input)) return validateAcademicTemplateSettings(input);
	return validateAcademicTemplateSettings({
		...input,
		bookReading: input.bookReading ?? DEFAULT_TEMPLATE_SETTINGS.bookReading,
	});
}
