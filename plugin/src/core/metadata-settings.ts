import {
	isRecord,
	validationFailure,
	validationIssue,
	validationSuccess,
	type ValidationIssue,
	type ValidationResult,
} from './validation';

export const METADATA_FIELD_IDS = [
	'noteType',
	'course',
	'term',
	'date',
	'title',
	'authors',
	'year',
	'status',
	'venue',
	'doi',
	'edition',
	'readingId',
	'related',
	'tags',
] as const;

export type MetadataFieldId = (typeof METADATA_FIELD_IDS)[number];

export interface MetadataFieldMapping {
	readonly noteType: string;
	readonly course: string;
	readonly term: string;
	readonly date: string;
	readonly title: string;
	readonly authors: string;
	readonly year: string;
	readonly status: string;
	readonly venue: string;
	readonly doi: string;
	readonly edition: string;
	readonly readingId: string;
	readonly related: string;
	readonly tags: string;
}

export interface MetadataValueMapping {
	readonly courseNoteType: string;
	readonly paperType: string;
	readonly bookType?: string;
}

export interface MetadataSettings {
	readonly fields: MetadataFieldMapping;
	readonly values: MetadataValueMapping;
}

export const PAPER_STATUSES = ['unread', 'reading', 'reviewed'] as const;
export type PaperStatus = (typeof PAPER_STATUSES)[number];

export const RECOMMENDED_COURSE_NOTE_SCHEMA = Object.freeze({
	type: 'course-note',
	course: '',
	term: '',
	date: 'YYYY-MM-DD',
	tags: Object.freeze([] as string[]),
});

export const RECOMMENDED_PAPER_NOTE_SCHEMA = Object.freeze({
	type: 'paper',
	title: '',
	authors: Object.freeze([] as string[]),
	year: null,
	status: 'unread',
	venue: '',
	doi: '',
	tags: Object.freeze([] as string[]),
});

export const RECOMMENDED_BOOK_NOTE_SCHEMA = Object.freeze({
	type: 'book-note',
	title: '',
	authors: Object.freeze([] as string[]),
	year: null,
	edition: '',
	'reading-id': '',
});

function freezeMetadataSettings(
	fields: MetadataFieldMapping,
	values: MetadataValueMapping,
): MetadataSettings {
	return Object.freeze({
		fields: Object.freeze({ ...fields }),
		values: Object.freeze({ ...values }),
	});
}

export const DEFAULT_METADATA_SETTINGS: MetadataSettings = freezeMetadataSettings(
	{
		noteType: 'type',
		course: 'course',
		term: 'term',
		date: 'date',
		title: 'title',
		authors: 'authors',
		year: 'year',
		status: 'status',
		venue: 'venue',
		doi: 'doi',
		edition: 'edition',
		readingId: 'reading-id',
		related: 'related',
		tags: 'tags',
	},
	{ courseNoteType: 'course-note', paperType: 'paper', bookType: 'book-note' },
);

const MAX_MAPPING_TEXT_LENGTH = 120;
const UNSAFE_PROPERTY_NAMES = new Set(['__proto__', 'constructor', 'prototype']);

function containsControlCharacter(value: string): boolean {
	for (const character of value) {
		const code = character.charCodeAt(0);
		if (code <= 31 || code === 127) return true;
	}
	return false;
}

function readMappingText(
	value: unknown,
	path: string,
	kind: 'field' | 'value',
	issues: ValidationIssue[],
): string | null {
	if (typeof value !== 'string') {
		issues.push(
			validationIssue(
				`invalid_metadata_${kind}`,
				path,
				`Expected a metadata ${kind} name.`,
			),
		);
		return null;
	}
	const normalized = value.trim();
	if (
		!normalized ||
		normalized.length > MAX_MAPPING_TEXT_LENGTH ||
		containsControlCharacter(normalized) ||
		(kind === 'field' && UNSAFE_PROPERTY_NAMES.has(normalized))
	) {
		issues.push(
			validationIssue(
				`invalid_metadata_${kind}`,
				path,
				`Expected a safe non-empty metadata ${kind} name.`,
			),
		);
		return null;
	}
	return normalized;
}

export function validateMetadataSettings(
	input: unknown,
): ValidationResult<MetadataSettings> {
	if (!isRecord(input) || !isRecord(input.fields) || !isRecord(input.values)) {
		return validationFailure([
			validationIssue(
				'invalid_metadata_settings',
				'settings.metadata',
				'Expected metadata field and value mappings.',
			),
		]);
	}

	const issues: ValidationIssue[] = [];
	const fields: Record<MetadataFieldId, string> = {
		...DEFAULT_METADATA_SETTINGS.fields,
	};
	const seenFields = new Map<string, MetadataFieldId>();
	for (const fieldId of METADATA_FIELD_IDS) {
		const field = readMappingText(
			input.fields[fieldId] ?? DEFAULT_METADATA_SETTINGS.fields[fieldId],
			`settings.metadata.fields.${fieldId}`,
			'field',
			issues,
		);
		if (!field) continue;
		const duplicateOf = seenFields.get(field);
		if (duplicateOf) {
			issues.push(
				validationIssue(
					'duplicate_metadata_field',
					`settings.metadata.fields.${fieldId}`,
					`Metadata field is already mapped to ${duplicateOf}.`,
				),
			);
			continue;
		}
		seenFields.set(field, fieldId);
		fields[fieldId] = field;
	}

	const courseNoteType = readMappingText(
		input.values.courseNoteType,
		'settings.metadata.values.courseNoteType',
		'value',
		issues,
	);
	const paperType = readMappingText(
		input.values.paperType,
		'settings.metadata.values.paperType',
		'value',
		issues,
	);
	const bookType = readMappingText(
		input.values.bookType ?? DEFAULT_METADATA_SETTINGS.values.bookType,
		'settings.metadata.values.bookType',
		'value',
		issues,
	);
	if (courseNoteType && paperType && bookType && new Set([courseNoteType, paperType, bookType]).size !== 3) {
		issues.push(
			validationIssue(
				'duplicate_metadata_type_value',
				'settings.metadata.values.paperType',
				'Course-note, paper, and book type values must be different.',
			),
		);
	}

	if (
		issues.length > 0 ||
		!courseNoteType ||
		!paperType ||
		!bookType
	) {
		return validationFailure(issues);
	}

	return validationSuccess(
		freezeMetadataSettings(
			fields,
			{ courseNoteType, paperType, bookType },
		),
	);
}
