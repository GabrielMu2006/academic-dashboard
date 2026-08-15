import { App, Modal, Setting } from 'obsidian';

export interface LocalWriteReview {
	readonly title: string;
	readonly summary: string;
	readonly path: string;
	readonly beforeLabel?: string;
	readonly before?: string;
	readonly afterLabel: string;
	readonly after: string;
	readonly confirmLabel: string;
}

class LocalWriteReviewModal extends Modal {
	private settled = false;

	constructor(
		app: App,
		private readonly review: LocalWriteReview,
		private readonly settle: (confirmed: boolean) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(this.review.title);
		this.contentEl.createEl('p', {
			text: this.review.summary,
			cls: 'setting-item-description',
		});
		this.section('Vault-relative path', this.review.path, 'code');
		if (this.review.beforeLabel && this.review.before !== undefined) {
			this.section(this.review.beforeLabel, this.review.before, 'pre');
		}
		this.section(this.review.afterLabel, this.review.after, 'pre');

		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.finish(false)),
			)
			.addButton((button) =>
				button
					.setButtonText(this.review.confirmLabel)
					.setCta()
					.onClick(() => this.finish(true)),
			);
	}

	onClose(): void {
		if (!this.settled) this.settle(false);
		this.contentEl.empty();
	}

	private section(label: string, value: string, tag: 'code' | 'pre'): void {
		const wrapper = this.contentEl.createDiv({
			cls: 'academic-dashboard-write-review',
		});
		wrapper.createDiv({
			text: label,
			cls: 'academic-dashboard-write-review__label',
		});
		wrapper.createEl(tag, {
			text: value,
			cls: 'academic-dashboard-write-review__value',
		});
	}

	private finish(confirmed: boolean): void {
		if (this.settled) return;
		this.settled = true;
		this.settle(confirmed);
		this.close();
	}
}

export function requestLocalWriteConfirmation(
	app: App,
	review: LocalWriteReview,
): Promise<boolean> {
	return new Promise((resolve) => {
		new LocalWriteReviewModal(app, review, resolve).open();
	});
}
