import { toIsoDate } from '../core/calendar-tasks';
import {
	ConservativeWriteService,
	type ConservativeWritePort,
	type ConservativeWriteServiceOptions,
	type CreationWritePreview,
} from '../core/conservative-writes';
import {
	METADATA_FIELD_IDS,
	type MetadataSettings,
} from '../core/metadata-settings';
import {
	isSafeVaultRelativePath,
	type AcademicTemplateSettings,
	type NoteTemplateSetting,
} from '../core/template-settings';

export type NoteCreationKind = 'course-note' | 'paper-reading';

export type NoteTemplatePort = ConservativeWritePort;

export interface NoteCreationRequest {
	readonly kind: NoteCreationKind;
	readonly title: string;
}

export interface NoteCreationResult {
	readonly path: string;
}

export interface NoteCreationPreview {
	readonly path: string;
	readonly content: string;
	readonly contentFingerprint: string;
	/** Opaque prepared contract required unchanged by confirm(). */
	readonly prepared: CreationWritePreview;
}

export class NoteCreationError extends Error {
	constructor(
		readonly code:
			| 'invalid_title'
			| 'invalid_destination'
			| 'template_unavailable'
			| 'note_exists'
			| 'create_failed',
		message: string,
	) {
		super(message);
		this.name = 'NoteCreationError';
	}
}

function hasControlCharacter(value: string): boolean {
	for (const character of value) {
		const code = character.charCodeAt(0);
		if (code <= 31 || code === 127) return true;
	}
	return false;
}

function validateTitle(input: string): string {
	const title = input.trim();
	if (
		!title ||
		title.length > 120 ||
		hasControlCharacter(title) ||
		/[<>:"/\\|?*]/.test(title) ||
		title === '.' ||
		title === '..' ||
		title.endsWith('.') ||
		/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(title)
	) {
		throw new NoteCreationError(
			'invalid_title',
			'Use a short note title without path separators or reserved filename characters.',
		);
	}
	return title;
}

function yamlQuoted(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function templateValues(
	title: string,
	now: Date,
	metadata: MetadataSettings,
): Readonly<Record<string, string>> {
	const values: Record<string, string> = {
		title,
		titleYaml: yamlQuoted(title),
		date: toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate()),
		'value.courseNoteType': yamlQuoted(metadata.values.courseNoteType),
		'value.paperType': yamlQuoted(metadata.values.paperType),
	};
	for (const fieldId of METADATA_FIELD_IDS) {
		values[`field.${fieldId}`] = yamlQuoted(metadata.fields[fieldId]);
	}
	return Object.freeze(values);
}

function renderTemplate(
	template: string,
	values: Readonly<Record<string, string>>,
): string {
	const rendered = template.replace(
		/{{\s*([a-zA-Z][a-zA-Z0-9.]*)\s*}}/g,
		(match: string, key: string) => values[key] ?? match,
	);
	return rendered.endsWith('\n') ? rendered : `${rendered}\n`;
}

export class NoteTemplateService {
	private readonly writes: ConservativeWriteService;

	constructor(
		private readonly port: NoteTemplatePort,
		private readonly getTemplates: () => AcademicTemplateSettings,
		private readonly getMetadata: () => MetadataSettings,
		private readonly now: () => Date = () => new Date(),
		writeOptions: ConservativeWriteServiceOptions = {},
	) {
		this.writes = new ConservativeWriteService(port, writeOptions);
	}

	async create(request: NoteCreationRequest): Promise<NoteCreationResult> {
		return this.confirm(await this.preview(request));
	}

	async preview(request: NoteCreationRequest): Promise<NoteCreationPreview> {
		const title = validateTitle(request.title);
		const settings = this.getTemplates();
		const template =
			request.kind === 'course-note' ? settings.courseNote : settings.paperReading;
		if (!isSafeVaultRelativePath(template.destinationFolder)) {
			throw new NoteCreationError(
				'invalid_destination',
				'The configured destination folder is not a safe Vault-relative path.',
			);
		}
		const path = `${template.destinationFolder}/${title}.md`;
		const source = await this.resolveTemplate(template);
		const content = renderTemplate(
			source,
			templateValues(title, this.now(), this.getMetadata()),
		);

		try {
			const prepared = await this.writes.prepareCreation({
				operation:
					request.kind === 'course-note'
						? 'create-course-note'
						: 'create-paper-note',
				path,
				content,
			});
			return Object.freeze({
				path,
				content,
				contentFingerprint: prepared.afterFingerprint,
				prepared,
			});
		} catch (error) {
			throw this.creationError(error, path);
		}
	}

	async confirm(preview: NoteCreationPreview): Promise<NoteCreationResult> {
		if (
			preview.path !== preview.prepared.path ||
			preview.content !== preview.prepared.content ||
			preview.contentFingerprint !== preview.prepared.afterFingerprint
		) {
			throw new NoteCreationError(
				'invalid_destination',
				'The creation preview changed before confirmation.',
			);
		}
		try {
			await this.writes.commit(preview.prepared);
			return Object.freeze({ path: preview.path });
		} catch (error) {
			throw this.creationError(error, preview.path);
		}
	}

	private async resolveTemplate(setting: NoteTemplateSetting): Promise<string> {
		if (setting.source === 'custom') return setting.customTemplate;
		if (
			!isSafeVaultRelativePath(setting.vaultTemplatePath, {
				markdownFile: true,
			})
		) {
			throw new NoteCreationError(
				'template_unavailable',
				'The selected Vault template is unavailable.',
			);
		}
		try {
			const content = await this.port.read(setting.vaultTemplatePath);
			if (content === null) throw new Error('Template is unavailable.');
			return content;
		} catch {
			throw new NoteCreationError(
				'template_unavailable',
				'The selected Vault template could not be read.',
			);
		}
	}

	private creationError(error: unknown, path: string): NoteCreationError {
		if (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			(error.code === 'target-exists' || error.code === 'conflict')
		) {
			return new NoteCreationError(
				'note_exists',
				`A note already exists at ${path}. Nothing was overwritten.`,
			);
		}
		return new NoteCreationError(
			'create_failed',
			'The note could not be created. No existing note was overwritten.',
		);
	}
}
