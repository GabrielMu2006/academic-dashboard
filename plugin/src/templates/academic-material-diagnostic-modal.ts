import { App, Modal, Notice, Setting } from 'obsidian';
import {
	AcademicMaterialDiagnosticCancelledError,
	diagnoseAcademicMaterials,
	type AcademicMaterialDiagnosticReport,
	type AcademicMaterialDiagnosticVaultPort,
} from '../core/academic-material-diagnostic';
import {
	validateMetadataSettings,
	type MetadataSettings,
} from '../core/metadata-settings';
import { isSafeVaultRelativePath } from '../core/template-settings';

export interface AcademicMaterialDiagnosticModalOptions {
	readonly vault: AcademicMaterialDiagnosticVaultPort;
	readonly getMetadata: () => MetadataSettings;
	readonly getRootFolder: () => string;
	readonly getPaperRootFolder: () => string;
}

function addResult(container: HTMLElement, report: AcademicMaterialDiagnosticReport): void {
	container.empty();
	container.createEl('h3', { text: 'Mapping preview' });
	container.createEl('p', {
		text: `Course root: ${report.mapping.rootFolder || '/'} · Paper root: ${report.mapping.paperRootFolder || '/'} · Type field: ${report.mapping.noteTypeField} · Course: ${report.mapping.expectedType} · Paper: ${report.mapping.expectedPaperType} · Status field: ${report.mapping.statusField}`,
	});
	container.createEl('h3', { text: 'Counts' });
	const counts = container.createEl('ul');
	const rows: readonly [string, number][] = [
		['Markdown files', report.counts.markdownFiles],
		['Inspected visible files', report.counts.inspected],
		['Excluded hidden/generated files', report.counts.excluded],
		['Matched course notes', report.counts.matchedCourseNotes],
		['Matched paper notes', report.counts.matchedPaperNotes],
		['Course markers with a different type', report.counts.courseMarkerTypeMismatches],
		['Unclassified notes under the course root', report.counts.courseRootNotesUnclassified],
		['Unclassified notes under the paper root', report.counts.paperRootNotesUnclassified],
		['Paper notes with invalid status', report.counts.invalidPaperStatuses],
		['Metadata read errors', report.counts.metadataReadErrors],
	];
	for (const [label, value] of rows) counts.createEl('li', { text: `${label}: ${value}` });
	container.createEl('h3', { text: 'Limited issue samples' });
	if (report.samples.length === 0) {
		container.createEl('p', { text: 'No sampled mapping issues.', cls: 'setting-item-description' });
		return;
	}
	const samples = container.createEl('ul');
	for (const sample of report.samples) {
		samples.createEl('li', { text: `${sample.category}: ${sample.path}` });
	}
}

export class AcademicMaterialDiagnosticModal extends Modal {
	private controller: AbortController | null = null;

	constructor(app: App, private readonly options: AcademicMaterialDiagnosticModalOptions) {
		super(app);
	}

	onOpen(): void {
		this.setTitle('Academic material diagnostic');
		this.contentEl.createEl('p', {
			text: 'Edit the draft rules to preview how many course and paper notes they would recognize. Draft values are never saved here. The scan does not read note bodies or write to the vault.',
			cls: 'setting-item-description',
		});
		const current = this.options.getMetadata();
		let courseRoot = this.options.getRootFolder();
		let paperRoot = this.options.getPaperRootFolder();
		let noteTypeField = current.fields.noteType;
		let courseField = current.fields.course;
		let statusField = current.fields.status;
		let courseType = current.values.courseNoteType;
		let paperType = current.values.paperType;
		const draftText = (name: string, value: string, update: (next: string) => void): void => {
			new Setting(this.contentEl).setName(name).addText((text) =>
				text.setValue(value).onChange(update));
		};
		draftText('Course root', courseRoot, (value) => { courseRoot = value.trim(); });
		draftText('Paper root', paperRoot, (value) => { paperRoot = value.trim(); });
		draftText('Note type field', noteTypeField, (value) => { noteTypeField = value.trim(); });
		draftText('Course field', courseField, (value) => { courseField = value.trim(); });
		draftText('Status field', statusField, (value) => { statusField = value.trim(); });
		draftText('Course type value', courseType, (value) => { courseType = value.trim(); });
		draftText('Paper type value', paperType, (value) => { paperType = value.trim(); });
		const result = this.contentEl.createDiv();
		let running = false;
		const setting = new Setting(this.contentEl).setName('Manual diagnostic');
		setting.addButton((button) => button
			.setButtonText('Run diagnostic')
			.setCta()
			.onClick(async () => {
				if (running) return;
				running = true;
				button.setDisabled(true);
				this.controller = new AbortController();
				result.empty();
				const progress = result.createEl('p', { text: 'Preparing local scan…' });
				try {
					if (!isSafeVaultRelativePath(courseRoot, { allowEmpty: true }) ||
						!isSafeVaultRelativePath(paperRoot, { allowEmpty: true })) {
						throw new Error('Draft roots must be safe vault-relative folders.');
					}
					const metadata = validateMetadataSettings({
						...current,
						fields: { ...current.fields, noteType: noteTypeField, course: courseField, status: statusField },
						values: { ...current.values, courseNoteType: courseType, paperType },
					});
					if (!metadata.ok) throw new Error('Draft metadata fields and values must be unique and non-empty.');
					const report = await diagnoseAcademicMaterials(this.options.vault, {
						metadata: metadata.value,
						rootFolder: courseRoot,
						paperRootFolder: paperRoot,
						sampleLimit: 8,
						signal: this.controller.signal,
						onProgress: (scanned, total) => {
							progress.textContent = `Scanned ${scanned} / ${total} Markdown files…`;
						},
					});
					addResult(result, report);
				} catch (error) {
					result.empty();
					const message = error instanceof Error ? error.message : 'Diagnostic failed.';
					result.createEl('p', { text: message });
					if (!(error instanceof AcademicMaterialDiagnosticCancelledError)) new Notice(message);
				} finally {
					running = false;
					button.setDisabled(false);
					this.controller = null;
				}
			}));
		setting.addButton((button) => button
			.setButtonText('Cancel')
			.onClick(() => this.controller?.abort()));
	}

	onClose(): void {
		this.controller?.abort();
		this.controller = null;
		this.contentEl.empty();
	}
}
