import { describe, expect, it } from 'vitest';
import type { ConservativeWritePort } from '../../src/core/conservative-writes';
import { buildWeeklyReviewDraft } from '../../src/core/weekly-review';
import { WeeklyReviewService } from '../../src/templates/weekly-review-service';

function memoryPort() {
	const files = new Map<string, string>(); const folders: string[] = [];
	const port: ConservativeWritePort = {
		read: async (path) => files.get(path) ?? null,
		compareAndSwap: async () => 'conflict',
		ensureFolder: async (path) => { folders.push(path); },
		createExclusive: async (path, content) => {
			if (files.has(path)) return 'exists'; files.set(path, content); return 'created';
		},
	};
	return { port, files, folders };
}

const draft = () => buildWeeklyReviewDraft({ now: new Date(2026, 8, 8), files: [], localWrites: [], agentWrites: [] });

describe('WeeklyReviewService', () => {
	it('previews edited content without writing, then creates it exclusively', async () => {
		const memory = memoryPort(); const service = new WeeklyReviewService(memory.port);
		const edited = `${draft().content}\nMy own reflection.\n`;
		const preview = await service.prepare(draft(), edited);
		expect(memory.files.size).toBe(0);
		await service.confirm(preview);
		expect(memory.folders).toEqual(['Weekly Reviews']);
		expect(memory.files.get(draft().path)).toBe(edited);
	});

	it('refuses an existing destination and a destination race', async () => {
		const existing = memoryPort(); existing.files.set(draft().path, 'mine');
		await expect(new WeeklyReviewService(existing.port).prepare(draft(), draft().content)).rejects.toMatchObject({ code: 'target-exists' });

		const raced = memoryPort(); const service = new WeeklyReviewService(raced.port);
		const preview = await service.prepare(draft(), draft().content);
		raced.files.set(draft().path, 'concurrent note');
		await expect(service.confirm(preview)).rejects.toMatchObject({ code: 'target-exists' });
		expect(raced.files.get(draft().path)).toBe('concurrent note');
	});
});
