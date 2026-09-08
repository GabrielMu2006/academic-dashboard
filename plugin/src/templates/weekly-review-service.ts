import {
	ConservativeWriteService,
	type ConservativeWriteCommitResult,
	type ConservativeWritePort,
	type ConservativeWriteServiceOptions,
	type CreationWritePreview,
} from '../core/conservative-writes';
import type { WeeklyReviewDraft } from '../core/weekly-review';

export class WeeklyReviewService {
	private readonly writes: ConservativeWriteService;

	constructor(port: ConservativeWritePort, options: ConservativeWriteServiceOptions = {}) {
		this.writes = new ConservativeWriteService(port, options);
	}

	prepare(draft: WeeklyReviewDraft, editedContent: string): Promise<CreationWritePreview> {
		return this.writes.prepareCreation({
			operation: 'create-weekly-review',
			path: draft.path,
			content: editedContent,
		});
	}

	confirm(preview: CreationWritePreview): Promise<ConservativeWriteCommitResult> {
		return this.writes.commit(preview);
	}
}
