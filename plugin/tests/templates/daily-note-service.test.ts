import { describe, expect, it, vi } from 'vitest';
import type { ConservativeWritePort } from '../../src/core/conservative-writes';
import { DEFAULT_LOCAL_WRITE_SETTINGS } from '../../src/core/local-write-settings';
import {
	DailyNoteError,
	DailyNoteService,
	dailyNotePathForDate,
} from '../../src/templates/daily-note-service';

function port(overrides: Partial<ConservativeWritePort> = {}) {
	const files = new Map<string, string>();
	const ensured: string[] = [];
	const created: Array<{ path: string; content: string }> = [];
	const value: ConservativeWritePort = {
		read: async (path) => files.get(path) ?? null,
		compareAndSwap: async () => 'conflict',
		ensureFolder: async (path) => {
			ensured.push(path);
		},
		createExclusive: async (path, content) => {
			if (files.has(path)) return 'exists';
			files.set(path, content);
			created.push({ path, content });
			return 'created';
		},
		...overrides,
	};
	return { value, files, ensured, created };
}

describe('Daily Note review-first creation', () => {
	it('resolves the configured Daily Note path for a local ISO date', () => {
		expect(dailyNotePathForDate(
			DEFAULT_LOCAL_WRITE_SETTINGS.dailyNote,
			'2026-08-15',
		)).toBe('Daily Notes/2026-08-15.md');
		expect(dailyNotePathForDate(
			DEFAULT_LOCAL_WRITE_SETTINGS.dailyNote,
			'not-a-date',
		)).toBeNull();
	});

	it('previews the configured Vault-relative path and rendered content before creation', async () => {
		const fake = port();
		const service = new DailyNoteService(fake.value, () => DEFAULT_LOCAL_WRITE_SETTINGS);

		const preview = await service.preview('2026-08-12');

		expect(preview.path).toBe('Daily Notes/2026-08-12.md');
		expect(preview.content).toBe('# 2026-08-12\n\n');
		expect(preview.prepared.preview.after).toBe('# 2026-08-12\n\n');
		expect(fake.created).toHaveLength(0);

		await service.confirm(preview);
		expect(fake.ensured).toEqual(['Daily Notes']);
		expect(fake.created).toEqual([{ path: preview.path, content: preview.content }]);
	});

	it('reads a safe Vault template without modifying it', async () => {
		const fake = port();
		fake.files.set('Templates/daily.md', '# Journal {{date}}');
		const service = new DailyNoteService(fake.value, () => ({
			...DEFAULT_LOCAL_WRITE_SETTINGS,
			dailyNote: {
				...DEFAULT_LOCAL_WRITE_SETTINGS.dailyNote,
				templateSource: 'vault',
				vaultTemplatePath: 'Templates/daily.md',
			},
		}));

		const preview = await service.preview('2026-08-12');
		expect(preview.content).toBe('# Journal 2026-08-12\n');
		expect(fake.files.get('Templates/daily.md')).toBe('# Journal {{date}}');
	});

	it('rejects invalid dates, existing notes, and changed displayed previews', async () => {
		const fake = port();
		const service = new DailyNoteService(fake.value, () => DEFAULT_LOCAL_WRITE_SETTINGS);
		await expect(service.preview('2026-02-30')).rejects.toMatchObject({
			code: 'invalid_date',
		});
		fake.files.set('Daily Notes/2026-08-12.md', 'user content');
		await expect(service.preview('2026-08-12')).rejects.toMatchObject({
			code: 'note_exists',
		});
		fake.files.delete('Daily Notes/2026-08-12.md');
		const preview = await service.preview('2026-08-12');
		await expect(service.confirm({ ...preview, path: 'Daily Notes/other.md' }))
			.rejects.toMatchObject({ code: 'invalid_destination' });
		expect(fake.created).toHaveLength(0);
	});

	it('fails closed when the destination appears after preview', async () => {
		const fake = port();
		const service = new DailyNoteService(fake.value, () => DEFAULT_LOCAL_WRITE_SETTINGS);
		const preview = await service.preview('2026-08-12');
		fake.files.set(preview.path, 'concurrent user note');

		await expect(service.confirm(preview)).rejects.toBeInstanceOf(DailyNoteError);
		expect(fake.files.get(preview.path)).toBe('concurrent user note');
		expect(fake.created).toHaveLength(0);
	});

	it('does not call exclusive create when folder preparation exposes a race', async () => {
		const createExclusive = vi.fn(async () => 'created' as const);
		let reads = 0;
		const fake = port({
			read: async () => (++reads >= 3 ? 'raced' : null),
			createExclusive,
		});
		const service = new DailyNoteService(fake.value, () => DEFAULT_LOCAL_WRITE_SETTINGS);
		const preview = await service.preview('2026-08-12');

		await expect(service.confirm(preview)).rejects.toMatchObject({ code: 'note_exists' });
		expect(createExclusive).not.toHaveBeenCalled();
	});
});
