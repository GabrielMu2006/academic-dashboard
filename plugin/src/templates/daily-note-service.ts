import { isIsoDate } from '../core/calendar-tasks';
import {
	ConservativeWriteError,
	ConservativeWriteService,
	type ConservativeWritePort,
	type ConservativeWriteServiceOptions,
	type CreationWritePreview,
} from '../core/conservative-writes';
import type { LocalWriteSettings } from '../core/local-write-settings';
import { isSafeVaultRelativePath } from '../core/template-settings';

export interface DailyNotePreview {
	readonly path: string;
	readonly content: string;
	readonly prepared: CreationWritePreview;
}

export class DailyNoteError extends Error {
	constructor(
		readonly code:
			| 'invalid_date'
			| 'invalid_destination'
			| 'template_unavailable'
			| 'note_exists'
			| 'create_failed',
		message: string,
	) {
		super(message);
		this.name = 'DailyNoteError';
	}
}

export function dailyNotePathForDate(
	setting: LocalWriteSettings['dailyNote'],
	date: string,
): string | null {
	if (!isIsoDate(date)) return null;
	const [year = '', month = '', day = ''] = date.split('-');
	const filename = setting.filenameFormat
		.replace(/YYYY/gu, year)
		.replace(/MM/gu, month)
		.replace(/DD/gu, day);
	const path = `${setting.folder}/${filename}`;
	return isSafeVaultRelativePath(path, { markdownFile: true }) ? path : null;
}

function renderTemplate(template: string, date: string): string {
	const rendered = template.replace(/\{\{\s*date\s*\}\}/gu, date);
	return rendered.endsWith('\n') ? rendered : `${rendered}\n`;
}

export class DailyNoteService {
	private readonly writes: ConservativeWriteService;

	constructor(
		private readonly port: ConservativeWritePort,
		private readonly getSettings: () => LocalWriteSettings,
		writeOptions: ConservativeWriteServiceOptions = {},
	) {
		this.writes = new ConservativeWriteService(port, writeOptions);
	}

	async preview(date: string): Promise<DailyNotePreview> {
		if (!isIsoDate(date)) {
			throw new DailyNoteError('invalid_date', 'Daily Note creation requires a valid date.');
		}
		const setting = this.getSettings().dailyNote;
		const path = dailyNotePathForDate(setting, date);
		if (!path) {
			throw new DailyNoteError(
				'invalid_destination',
				'The configured Daily Note destination is not a safe Vault-relative path.',
			);
		}
		const source = await this.resolveTemplate();
		const content = renderTemplate(source, date);
		try {
			const prepared = await this.writes.prepareCreation({
				operation: 'create-daily-note',
				path,
				content,
			});
			return Object.freeze({ path, content, prepared });
		} catch (error) {
			throw this.creationError(error, path);
		}
	}

	async confirm(preview: DailyNotePreview): Promise<{ readonly path: string }> {
		if (
			preview.path !== preview.prepared.path ||
			preview.content !== preview.prepared.content
		) {
			throw new DailyNoteError(
				'invalid_destination',
				'The Daily Note preview changed before confirmation.',
			);
		}
		try {
			await this.writes.commit(preview.prepared);
			return Object.freeze({ path: preview.path });
		} catch (error) {
			throw this.creationError(error, preview.path);
		}
	}

	private async resolveTemplate(): Promise<string> {
		const setting = this.getSettings().dailyNote;
		if (setting.templateSource === 'dashboard') return setting.dashboardTemplate;
		if (!isSafeVaultRelativePath(setting.vaultTemplatePath, { markdownFile: true })) {
			throw new DailyNoteError(
				'template_unavailable',
				'The selected Daily Note template is unavailable.',
			);
		}
		let content: string | null;
		try {
			content = await this.port.read(setting.vaultTemplatePath);
		} catch {
			content = null;
		}
		if (content === null) {
			throw new DailyNoteError(
				'template_unavailable',
				'The selected Daily Note template could not be read.',
			);
		}
		return content;
	}

	private creationError(error: unknown, path: string): DailyNoteError {
		if (
			error instanceof ConservativeWriteError &&
			(error.code === 'target-exists' || error.code === 'conflict')
		) {
			return new DailyNoteError(
				'note_exists',
				`A note already exists at ${path}. Nothing was overwritten.`,
			);
		}
		return new DailyNoteError(
			'create_failed',
			'The Daily Note could not be created. No existing note was overwritten.',
		);
	}
}
