import { describe, expect, it } from 'vitest';
import {
	ConservativeWriteError,
	ConservativeWriteService,
	fingerprintContent,
	isSafeWritePath,
	type ConservativeWritePort,
	type LocalWriteLogEvent,
} from '../../src/core/conservative-writes';

class MemoryWritePort implements ConservativeWritePort {
	readonly files = new Map<string, string>();
	readonly folders: string[] = [];
	beforeSwap?: () => void;
	beforeCreate?: () => void;

	read(path: string): Promise<string | null> {
		return Promise.resolve(this.files.get(path) ?? null);
	}

	compareAndSwap(path: string, expected: string, next: string) {
		this.beforeSwap?.();
		this.beforeSwap = undefined;
		const current = this.files.get(path);
		if (current === undefined) return Promise.resolve<'missing'>('missing');
		if (current !== expected) return Promise.resolve<'conflict'>('conflict');
		this.files.set(path, next);
		return Promise.resolve<'written'>('written');
	}

	ensureFolder(path: string): Promise<void> {
		this.folders.push(path);
		return Promise.resolve();
	}

	createExclusive(path: string, content: string) {
		this.beforeCreate?.();
		this.beforeCreate = undefined;
		if (this.files.has(path)) return Promise.resolve<'exists'>('exists');
		this.files.set(path, content);
		return Promise.resolve<'created'>('created');
	}
}

const PAPER_IDENTITY = Object.freeze({ field: 'type', value: 'paper' });

describe('conservative write paths and fingerprints', () => {
	it('accepts only visible Vault-relative Markdown targets', () => {
		expect(isSafeWritePath('Courses/Week 1.md')).toBe(true);
		for (const path of [
			'/tmp/note.md',
			'../note.md',
			'.hidden-config/config.md',
			'Courses/.hidden/note.md',
			'C:\\note.md',
			'Courses/note.txt',
		]) {
			expect(isSafeWritePath(path)).toBe(false);
		}
	});

	it('fingerprints exact content deterministically without returning content', () => {
		expect(fingerprintContent('private')).toBe(fingerprintContent('private'));
		expect(fingerprintContent('private')).not.toBe(fingerprintContent('private!'));
		expect(fingerprintContent('private')).not.toContain('private');
	});
});

describe('single-target edit preparation', () => {
	it('prepares and commits one task line, then conditionally undoes it', async () => {
		const port = new MemoryWritePort();
		port.files.set('Daily Notes/2026-08-12.md', '# Today\n- [ ] Read\n- [ ] Keep');
		const service = new ConservativeWriteService(port);
		const preview = await service.prepareEdit({
			operation: 'task-toggle',
			path: 'Daily Notes/2026-08-12.md',
			line: 2,
			completed: true,
		});

		expect(preview.preview).toEqual({ before: '- [ ] Read', after: '- [x] Read' });
		const result = await service.commit(preview);
		expect(port.files.get(preview.path)).toBe('# Today\n- [x] Read\n- [ ] Keep');
		expect(result.undoToken).toMatch(/^session-/u);

		await service.undo(result.undoToken!);
		expect(port.files.get(preview.path)).toBe('# Today\n- [ ] Read\n- [ ] Keep');
		await expect(service.undo(result.undoToken!)).rejects.toMatchObject({
			code: 'undo-unavailable',
		});
	});

	it('rejects tasks in code fences and ambiguous review markers', async () => {
		const port = new MemoryWritePort();
		port.files.set('Note.md', '```md\n- [ ] example\n```');
		const service = new ConservativeWriteService(port);
		await expect(service.prepareEdit({
			operation: 'task-toggle', path: 'Note.md', line: 2, completed: true,
		})).rejects.toMatchObject({ code: 'target-ambiguous' });

		port.files.set('Review.md', 'Q <!--SR:!2026-08-12--> <!--SR:!2026-08-13-->');
		await expect(service.prepareEdit({
			operation: 'review-date', path: 'Review.md', line: 1, nextReviewDate: '2026-08-20',
		})).rejects.toMatchObject({ code: 'target-ambiguous' });
	});

	it('updates exactly one review marker while preserving scheduling suffix', async () => {
		const port = new MemoryWritePort();
		port.files.set('Review.md', 'Question <!--SR:!2026-08-12,3,250-->');
		const service = new ConservativeWriteService(port);
		const preview = await service.prepareEdit({
			operation: 'review-date', path: 'Review.md', line: 1, nextReviewDate: '2026-08-20',
		});
		expect(preview.preview.after).toBe('Question <!--SR:!2026-08-20,3,250-->');
	});

	it('updates one supported paper scalar and rejects duplicate or complex targets', async () => {
		const port = new MemoryWritePort();
		port.files.set('Papers/Safe.md', '---\ntype: paper\nauthors: []\nstatus: unread\nfavorite: false\n---\n# Safe');
		const service = new ConservativeWriteService(port);
		const preview = await service.prepareEdit({
			operation: 'paper-status', path: 'Papers/Safe.md', field: 'status', value: 'reading',
			expectedValue: 'unread', paper: PAPER_IDENTITY,
		});
		expect(preview.preview).toEqual({ before: 'status: unread', after: 'status: reading' });
		expect(preview.afterContent).toContain('authors: []');

		port.files.set('Papers/Duplicate.md', '---\ntype: paper\nstatus: unread\nstatus: reviewed\n---');
		await expect(service.prepareEdit({
			operation: 'paper-status', path: 'Papers/Duplicate.md', field: 'status', value: 'reading',
			expectedValue: 'unread', paper: PAPER_IDENTITY,
		})).rejects.toMatchObject({ code: 'target-ambiguous' });

		port.files.set('Papers/Complex.md', '---\ntype: paper\nfavorite: [false]\n---');
		await expect(service.prepareEdit({
			operation: 'paper-favorite', path: 'Papers/Complex.md', field: 'favorite', value: true,
			expectedValue: false, paper: PAPER_IDENTITY,
		})).rejects.toMatchObject({ code: 'unsupported-value' });

		port.files.set('Papers/Broken.md', '---\ntype: paper\nstatus: "unread\n---');
		await expect(service.prepareEdit({
			operation: 'paper-status', path: 'Papers/Broken.md', field: 'status', value: 'reading',
			expectedValue: 'unread', paper: PAPER_IDENTITY,
		})).rejects.toMatchObject({ code: 'unsupported-value' });
	});

	it('inserts one missing paper scalar into safe frontmatter and undoes only that line', async () => {
		const port = new MemoryWritePort();
		const before = '---\ntype: paper\nauthors: []\nstatus: unread\n---\n# Safe';
		port.files.set('Papers/Missing favorite.md', before);
		const service = new ConservativeWriteService(port);
		const preview = await service.prepareEdit({
			operation: 'paper-favorite',
			path: 'Papers/Missing favorite.md',
			field: 'favorite',
			value: true,
			expectedValue: null,
			paper: PAPER_IDENTITY,
		});

		expect(preview.preview).toEqual({ before: '(missing)', after: 'favorite: true' });
		expect(preview.afterContent).toBe(
			'---\ntype: paper\nauthors: []\nstatus: unread\nfavorite: true\n---\n# Safe',
		);
		const result = await service.commit(preview);
		await service.undo(result.undoToken!);
		expect(port.files.get(preview.path)).toBe(before);
	});

	it('preserves CRLF bytes when replacing or inserting a paper scalar', async () => {
		const port = new MemoryWritePort();
		port.files.set('Papers/CRLF.md', '---\r\ntype: paper\r\nstatus: unread\r\n---\r\nBody\r\n');
		const service = new ConservativeWriteService(port);
		const status = await service.prepareEdit({
			operation: 'paper-status',
			path: 'Papers/CRLF.md',
			field: 'status',
			value: 'reviewed',
			expectedValue: 'unread',
			paper: PAPER_IDENTITY,
		});
		expect(status.afterContent).toBe(
			'---\r\ntype: paper\r\nstatus: reviewed\r\n---\r\nBody\r\n',
		);

		port.files.set('Papers/CRLF.md', status.afterContent);
		const favorite = await service.prepareEdit({
			operation: 'paper-favorite',
			path: 'Papers/CRLF.md',
			field: 'favorite',
			value: true,
			expectedValue: null,
			paper: PAPER_IDENTITY,
		});
		expect(favorite.afterContent).toBe(
			'---\r\ntype: paper\r\nstatus: reviewed\r\nfavorite: true\r\n---\r\nBody\r\n',
		);
	});

	it('rejects malformed, nested, multiline, tagged, aliased, and mixed-line-ending targets', async () => {
		const port = new MemoryWritePort();
		const service = new ConservativeWriteService(port);
		const cases = [
			['Nested.md', '---\nstatus:\n  value: unread\n---', 'paper-status', 'status', 'reading'],
			['Multiline.md', '---\nstatus: |\n  unread\n---', 'paper-status', 'status', 'reading'],
			['Tagged.md', '---\nstatus: !state unread\n---', 'paper-status', 'status', 'reading'],
			['Aliased.md', '---\nstatus: *paper-state\n---', 'paper-status', 'status', 'reading'],
			['Mixed.md', '---\r\nstatus: unread\n---', 'paper-status', 'status', 'reading'],
		] as const;

		for (const [path, content, operation, field, value] of cases) {
			port.files.set(`Papers/${path}`, content);
			await expect(service.prepareEdit({
				operation,
				path: `Papers/${path}`,
				field,
				value,
				expectedValue: 'unread',
				paper: PAPER_IDENTITY,
			})).rejects.toBeInstanceOf(ConservativeWriteError);
			expect(port.files.get(`Papers/${path}`)).toBe(content);
		}
	});

	it('does not insert into frontmatter with an unsafe existing multiline, tagged, alias, or quote context', async () => {
		const port = new MemoryWritePort();
		const service = new ConservativeWriteService(port);
		for (const [path, content] of [
			['Multiline.md', '---\ntype: paper\nsummary: |\n  private abstract\nstatus: unread\n---'],
			['Tagged.md', '---\ntype: paper\nkind: !paper research\nstatus: unread\n---'],
			['Aliased.md', '---\ntype: paper\nkind: *paper-kind\nstatus: unread\n---'],
			['Broken quote.md', '---\ntype: paper\ntitle: "unfinished\nstatus: unread\n---'],
		] as const) {
			port.files.set(`Papers/${path}`, content);
			await expect(service.prepareEdit({
				operation: 'paper-favorite',
				path: `Papers/${path}`,
				field: 'favorite',
				value: true,
				expectedValue: null,
				paper: PAPER_IDENTITY,
			})).rejects.toMatchObject({ code: 'unsupported-value' });
			expect(port.files.get(`Papers/${path}`)).toBe(content);
		}
	});

	it('lets only the first concurrently prepared paper action commit', async () => {
		const port = new MemoryWritePort();
		const before = '---\ntype: paper\nstatus: unread\n---\n# Paper';
		port.files.set('Papers/Race.md', before);
		const service = new ConservativeWriteService(port);
		const status = await service.prepareEdit({
			operation: 'paper-status', path: 'Papers/Race.md', field: 'status', value: 'reading',
			expectedValue: 'unread', paper: PAPER_IDENTITY,
		});
		const favorite = await service.prepareEdit({
			operation: 'paper-favorite', path: 'Papers/Race.md', field: 'favorite', value: true,
			expectedValue: null, paper: PAPER_IDENTITY,
		});

		await service.commit(status);
		await expect(service.commit(favorite)).rejects.toMatchObject({ code: 'conflict' });
		expect(port.files.get('Papers/Race.md')).toBe(
			'---\ntype: paper\nstatus: reading\n---\n# Paper',
		);
	});

	it('rejects stale scalar state and notes that no longer identify as the listed paper', async () => {
		const port = new MemoryWritePort();
		const service = new ConservativeWriteService(port);
		port.files.set('Papers/Stale.md', '---\ntype: paper\nstatus: reviewed\n---');
		await expect(service.prepareEdit({
			operation: 'paper-status',
			path: 'Papers/Stale.md',
			field: 'status',
			value: 'reading',
			expectedValue: 'unread',
			paper: PAPER_IDENTITY,
		})).rejects.toMatchObject({ code: 'conflict' });

		port.files.set('Papers/Stale.md', '---\ntype: note\nstatus: unread\n---');
		await expect(service.prepareEdit({
			operation: 'paper-status',
			path: 'Papers/Stale.md',
			field: 'status',
			value: 'reading',
			expectedValue: 'unread',
			paper: PAPER_IDENTITY,
		})).rejects.toMatchObject({ code: 'conflict' });
	});
});

describe('compare-before-write and creation contracts', () => {
	it('fails closed when content changes after preview or during atomic swap', async () => {
		const port = new MemoryWritePort();
		port.files.set('Task.md', '- [ ] Original');
		const service = new ConservativeWriteService(port);
		const preview = await service.prepareEdit({
			operation: 'task-toggle', path: 'Task.md', line: 1, completed: true,
		});
		port.files.set('Task.md', '- [ ] User edit');
		await expect(service.commit(preview)).rejects.toMatchObject({ code: 'conflict' });
		expect(port.files.get('Task.md')).toBe('- [ ] User edit');

		port.files.set('Task.md', '- [ ] Original');
		const raced = await service.prepareEdit({
			operation: 'task-toggle', path: 'Task.md', line: 1, completed: true,
		});
		port.beforeSwap = () => port.files.set('Task.md', '- [ ] Atomic race');
		await expect(service.commit(raced)).rejects.toMatchObject({ code: 'conflict' });
		expect(port.files.get('Task.md')).toBe('- [ ] Atomic race');
	});

	it('rejects a cloned preview whose path or prepared state was changed', async () => {
		const port = new MemoryWritePort();
		port.files.set('Task.md', '- [ ] Original');
		const service = new ConservativeWriteService(port);
		const preview = await service.prepareEdit({
			operation: 'task-toggle', path: 'Task.md', line: 1, completed: true,
		});
		await expect(service.commit({ ...preview, path: 'Other.md' })).rejects.toMatchObject({
			code: 'invalid-request',
		});
		expect(port.files.get('Task.md')).toBe('- [ ] Original');
	});

	it('does not undo over a later user edit and clears tokens at session end', async () => {
		const port = new MemoryWritePort();
		port.files.set('Task.md', '- [ ] Original');
		const service = new ConservativeWriteService(port);
		const result = await service.commit(await service.prepareEdit({
			operation: 'task-toggle', path: 'Task.md', line: 1, completed: true,
		}));
		port.files.set('Task.md', '- [x] Original plus user note');
		await expect(service.undo(result.undoToken!)).rejects.toMatchObject({ code: 'conflict' });
		expect(port.files.get('Task.md')).toContain('user note');
		service.clearUndoHistory();
		await expect(service.undo(result.undoToken!)).rejects.toBeInstanceOf(ConservativeWriteError);
	});

	it('previews one creation, checks absence around folder preparation, and never overwrites', async () => {
		const port = new MemoryWritePort();
		const service = new ConservativeWriteService(port);
		const preview = await service.prepareCreation({
			operation: 'create-daily-note',
			path: 'Daily Notes/2026-08-12.md',
			content: '# 2026-08-12\n',
		});
		expect(preview.preview).toEqual({ before: '(new note)', after: '# 2026-08-12\n' });
		await service.commit(preview);
		expect(port.folders).toEqual(['Daily Notes']);
		expect(port.files.get(preview.path)).toBe(preview.content);

		await expect(service.prepareCreation({
			operation: 'create-daily-note', path: preview.path, content: 'overwrite',
		})).rejects.toMatchObject({ code: 'target-exists' });
	});

	it('contains logs to the operation, relative path, outcome, and finite code', async () => {
		const port = new MemoryWritePort();
		port.files.set('Task.md', '- [ ] Secret task text');
		const events: LocalWriteLogEvent[] = [];
		const service = new ConservativeWriteService(port, {
			log: (event) => events.push(event),
			now: () => new Date('2026-08-12T00:00:00.000Z'),
		});
		const preview = await service.prepareEdit({
			operation: 'task-toggle', path: 'Task.md', line: 1, completed: true,
		});
		port.files.set('Task.md', '- [ ] Changed');
		await expect(service.commit(preview)).rejects.toMatchObject({ code: 'conflict' });
		expect(events).toEqual([{
			timestamp: '2026-08-12T00:00:00.000Z',
			operation: 'task-toggle',
			path: 'Task.md',
			outcome: 'conflict',
			errorCode: 'conflict',
		}]);
		expect(JSON.stringify(events)).not.toContain('Secret task text');
	});
});
