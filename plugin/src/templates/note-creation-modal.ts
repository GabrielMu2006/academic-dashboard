import { App, Modal, Notice, Setting } from 'obsidian';
import type {
	NoteCreationKind,
	NoteCreationPreview,
	NoteCreationResult,
} from './note-template-service';
import { requestLocalWriteConfirmation } from './local-write-review-modal';

export interface NoteCreationModalOptions {
	readonly kind: NoteCreationKind;
	readonly destinationFolder: string;
	readonly preview: (title: string) => Promise<NoteCreationPreview>;
	readonly confirm: (preview: NoteCreationPreview) => Promise<NoteCreationResult>;
	readonly openCreatedNote: (path: string) => Promise<void>;
}

export class NoteCreationModal extends Modal {
	constructor(
		app: App,
		private readonly options: NoteCreationModalOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const noteLabel = this.options.kind === 'course-note'
			? 'course note'
			: this.options.kind === 'paper-reading'
				? 'paper-reading note'
				: 'book-reading note';
		this.setTitle(
			`Create ${noteLabel}`,
		);
		this.contentEl.createEl('p', {
			text: `Searches ${this.options.destinationFolder} for a matching folder or file, then creates one grouped note. Existing files are never overwritten.`,
			cls: 'setting-item-description',
		});
		let title = '';
		let submitting = false;
		const setting = new Setting(this.contentEl)
			.setName('Note title')
			.setDesc('This becomes the Markdown filename and heading.')
			.addText((text) => {
				text.setPlaceholder('Enter a unique title').onChange((value) => {
					title = value;
				});
				this.contentEl.ownerDocument.defaultView?.setTimeout(
					() => text.inputEl.focus(),
					0,
				);
			});
		setting.addButton((button) =>
			button
				.setButtonText('Review note')
				.setCta()
				.onClick(async () => {
					if (submitting) return;
					submitting = true;
					button.setDisabled(true);
					try {
						const preview = await this.options.preview(title);
						const confirmed = await requestLocalWriteConfirmation(this.app, {
							title: `Review ${noteLabel}`,
							summary: 'Review this single-file creation. Existing files are never overwritten.',
							path: preview.path,
							afterLabel: 'Content preview (bounded to 2,000 characters when needed)',
							after: preview.prepared.preview.after,
							confirmLabel: 'Create this note',
						});
						if (!confirmed) return;
						const result = await this.options.confirm(preview);
						this.close();
						new Notice(`Created ${result.path}.`);
						await this.options.openCreatedNote(result.path);
					} catch (error) {
						new Notice(
							error instanceof Error ? error.message : 'The note could not be created.',
						);
					} finally {
						submitting = false;
						button.setDisabled(false);
					}
				}),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
