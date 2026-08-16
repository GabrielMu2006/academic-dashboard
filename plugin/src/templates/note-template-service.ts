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

export type NoteCreationKind = 'course-note' | 'paper-reading' | 'book-reading';

export interface NoteDestinationEntry {
	readonly path: string;
	readonly kind: 'file' | 'folder';
}

export interface NoteTemplatePort extends ConservativeWritePort {
	listDescendants(folder: string): Promise<readonly NoteDestinationEntry[]>;
}

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

export interface AgentNoteCreationPreparation {
	readonly path: string;
	readonly destination: string;
	readonly templatePath?: string;
	readonly templateContent?: string;
}

export class NoteCreationError extends Error {
	constructor(
		readonly code:
			| 'invalid_title'
			| 'invalid_destination'
			| 'ambiguous_destination'
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

function settingForKind(
	settings: AcademicTemplateSettings,
	kind: NoteCreationKind,
): NoteTemplateSetting {
	switch (kind) {
		case 'course-note': return settings.courseNote;
		case 'paper-reading': return settings.paperReading;
		case 'book-reading': return settings.bookReading;
	}
}

function operationForKind(
	kind: NoteCreationKind,
): 'create-course-note' | 'create-paper-note' | 'create-book-note' {
	switch (kind) {
		case 'course-note': return 'create-course-note';
		case 'paper-reading': return 'create-paper-note';
		case 'book-reading': return 'create-book-note';
	}
}

function relatedNameKey(value: string): string {
	return value
		.normalize('NFKC')
		.toLocaleLowerCase()
		.replace(/[\p{P}\p{S}\s_-]+/gu, ' ')
		.trim();
}

function entryName(entry: NoteDestinationEntry): string {
	const name = entry.path.split('/').at(-1) ?? '';
	if (entry.kind === 'folder') return name;
	const extensionAt = name.lastIndexOf('.');
	return extensionAt > 0 ? name.slice(0, extensionAt) : name;
}

function containingFolder(entry: NoteDestinationEntry, fallback: string): string {
	if (entry.kind === 'folder') return entry.path;
	const separatorAt = entry.path.lastIndexOf('/');
	return separatorAt > 0 ? entry.path.slice(0, separatorAt) : fallback;
}

function relatedScore(
	entry: NoteDestinationEntry,
	titleKey: string,
): number | null {
	const candidate = relatedNameKey(entryName(entry));
	if (candidate === titleKey) return entry.kind === 'folder' ? 0 : 1;
	if (titleKey.length >= 4 && candidate.startsWith(`${titleKey} `)) {
		return entry.kind === 'file' ? 2 : 3;
	}
	return null;
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

	async prepareAgentCreation(
		request: NoteCreationRequest,
	): Promise<AgentNoteCreationPreparation> {
		const resolved = await this.resolveCreation(request);
		return Object.freeze({
			path: resolved.path,
			destination: resolved.setting.destinationFolder,
			...(resolved.setting.source === 'vault'
				? { templatePath: resolved.setting.vaultTemplatePath }
				: {
					templateContent: renderTemplate(
						resolved.setting.customTemplate,
						templateValues(resolved.title, this.now(), this.getMetadata()),
					),
				}),
		});
	}

	async preview(request: NoteCreationRequest): Promise<NoteCreationPreview> {
		const resolved = await this.resolveCreation(request);
		const source = await this.resolveTemplate(resolved.setting);
		const content = renderTemplate(
			source,
			templateValues(resolved.title, this.now(), this.getMetadata()),
		);

		try {
			const prepared = await this.writes.prepareCreation({
				operation: operationForKind(request.kind),
				path: resolved.path,
				content,
			});
			return Object.freeze({
				path: resolved.path,
				content,
				contentFingerprint: prepared.afterFingerprint,
				prepared,
			});
		} catch (error) {
			throw this.creationError(error, resolved.path);
		}
	}

	private async resolveCreation(request: NoteCreationRequest): Promise<{
		readonly title: string;
		readonly setting: NoteTemplateSetting;
		readonly path: string;
	}> {
		const title = validateTitle(request.title);
		const setting = settingForKind(this.getTemplates(), request.kind);
		if (!isSafeVaultRelativePath(setting.destinationFolder)) {
			throw new NoteCreationError(
				'invalid_destination',
				'The configured destination folder is not a safe Vault-relative path.',
			);
		}
		try {
			const entries = await this.port.listDescendants(setting.destinationFolder);
			const destinationFolder = this.resolveDestinationFolder(
				setting.destinationFolder,
				title,
				entries,
			);
			const path = `${destinationFolder}/${title}.md`;
			const pathKey = path.normalize('NFKC').toLocaleLowerCase();
			if (
				entries.some(
					(entry) =>
						entry.kind === 'file' &&
						entry.path.normalize('NFKC').toLocaleLowerCase() === pathKey,
				)
			) {
				throw new NoteCreationError(
					'note_exists',
					`A note already exists at ${path}. Nothing was overwritten.`,
				);
			}
			return Object.freeze({ title, setting, path });
		} catch (error) {
			if (error instanceof NoteCreationError) throw error;
			throw new NoteCreationError(
				'create_failed',
				'The destination folder could not be inspected safely.',
			);
		}
	}

	private resolveDestinationFolder(
		baseFolder: string,
		title: string,
		entries: readonly NoteDestinationEntry[],
	): string {
		const titleKey = relatedNameKey(title);
		if (relatedNameKey(baseFolder.split('/').at(-1) ?? '') === titleKey) {
			return baseFolder;
		}
		const scored = entries
			.map((entry) => ({ entry, score: relatedScore(entry, titleKey) }))
			.filter(
				(candidate): candidate is { entry: NoteDestinationEntry; score: number } =>
					candidate.score !== null,
			)
			.sort(
				(left, right) =>
					left.score - right.score || left.entry.path.localeCompare(right.entry.path),
			);
		if (scored.length === 0) return `${baseFolder}/${title}`;

		const bestScore = scored[0]!.score;
		const folders = new Set(
			scored
				.filter(({ score }) => score === bestScore)
				.map(({ entry }) => containingFolder(entry, baseFolder)),
		);
		if (folders.size !== 1) {
			throw new NoteCreationError(
				'ambiguous_destination',
				'Multiple matching folders or files were found. Choose a more specific title or destination.',
			);
		}
		return [...folders][0]!;
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
