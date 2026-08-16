import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_METADATA_SETTINGS } from '../../src/core/metadata-settings';
import { DEFAULT_TEMPLATE_SETTINGS } from '../../src/core/template-settings';
import {
	NoteCreationError,
	NoteTemplateService,
	type NoteTemplatePort,
} from '../../src/templates/note-template-service';

function port(overrides: Partial<NoteTemplatePort> = {}) {
	const created: Array<{ path: string; content: string }> = [];
	const ensured: string[] = [];
	const files = new Map<string, string>();
	const value: NoteTemplatePort = {
		read: async (path) => files.get(path) ?? null,
		listDescendants: async () => [],
		compareAndSwap: async () => 'conflict',
		ensureFolder: async (path) => {
			ensured.push(path);
		},
		createExclusive: async (path, content) => {
			if (files.has(path)) return 'exists';
			created.push({ path, content });
			files.set(path, content);
			return 'created';
		},
		...overrides,
	};
	return { value, created, ensured, files };
}

function service(templatePort: NoteTemplatePort) {
	return new NoteTemplateService(
		templatePort,
		() => DEFAULT_TEMPLATE_SETTINGS,
		() => ({
			fields: { ...DEFAULT_METADATA_SETTINGS.fields, noteType: 'kind' },
			values: { courseNoteType: 'class-note', paperType: 'literature' },
		}),
		() => new Date(2026, 7, 11, 9),
	);
}

describe('safe note template creation', () => {
	it('creates exactly one mapped course note in the configured folder', async () => {
		const templatePort = port();

		const result = await service(templatePort.value).create({
			kind: 'course-note',
			title: 'Distributed Systems',
		});

		expect(result.path).toBe('Course/Distributed Systems/Distributed Systems.md');
		expect(templatePort.ensured).toEqual(['Course/Distributed Systems']);
		expect(templatePort.created).toHaveLength(1);
		expect(templatePort.created[0]?.content).toContain('"kind": "class-note"');
		expect(templatePort.created[0]?.content).toContain('"date": "2026-08-11"');
		expect(templatePort.created[0]?.content).toContain('# Distributed Systems');
	});

	it('reads a selected Vault template without modifying the template file', async () => {
		const templatePort = port();
		templatePort.files.set('Templates/paper.md', '# Reading {{title}}');
		const templates = {
			...DEFAULT_TEMPLATE_SETTINGS,
			paperReading: {
				...DEFAULT_TEMPLATE_SETTINGS.paperReading,
				source: 'vault' as const,
				vaultTemplatePath: 'Templates/paper.md',
			},
		};
		const noteTemplates = new NoteTemplateService(
			templatePort.value,
			() => templates,
			() => DEFAULT_METADATA_SETTINGS,
			() => new Date(2026, 7, 11),
		);

		await noteTemplates.create({ kind: 'paper-reading', title: 'Safe Paper' });

		expect(templatePort.created[0]?.content).toBe('# Reading Safe Paper\n');
		expect(templatePort.files.get('Templates/paper.md')).toBe('# Reading {{title}}');
	});

	it('refuses invalid filenames and existing destinations before writing', async () => {
		const createExclusive = vi.fn(async () => 'created' as const);
		const invalidPort = port({ createExclusive });
		await expect(
			service(invalidPort.value).create({ kind: 'course-note', title: '../escape' }),
		).rejects.toMatchObject({ code: 'invalid_title' });
		expect(createExclusive).not.toHaveBeenCalled();

		const existingPort = port();
		existingPort.files.set(
			'Course/Existing/Existing.md',
			'user content',
		);
		await expect(
			service(existingPort.value).create({ kind: 'course-note', title: 'Existing' }),
		).rejects.toMatchObject({ code: 'note_exists' });
		expect(existingPort.created).toHaveLength(0);
	});

	it('rechecks the destination after folder creation to close overwrite races', async () => {
		let checks = 0;
		const createExclusive = vi.fn(async () => 'created' as const);
		const templatePort = port({
			read: async () => {
				checks += 1;
				return checks > 1 ? 'raced' : null;
			},
			createExclusive,
		});

		await expect(
			service(templatePort.value).create({ kind: 'course-note', title: 'Raced' }),
		).rejects.toBeInstanceOf(NoteCreationError);
		expect(createExclusive).not.toHaveBeenCalled();
	});

	it('exposes an immutable path and content preview before confirmation', async () => {
		const templatePort = port();
		const noteTemplates = service(templatePort.value);
		const preview = await noteTemplates.preview({
			kind: 'course-note',
			title: 'Previewed',
		});

		expect(preview.path).toBe('Course/Previewed/Previewed.md');
		expect(preview.content).toContain('# Previewed');
		expect(preview.contentFingerprint).toMatch(/^v1-/u);
		expect(Object.isFrozen(preview)).toBe(true);
		expect(templatePort.created).toHaveLength(0);

		await noteTemplates.confirm(preview);
		expect(templatePort.created).toHaveLength(1);
	});

	it('rejects a creation preview whose displayed path changed', async () => {
		const templatePort = port();
		const noteTemplates = service(templatePort.value);
		const preview = await noteTemplates.preview({
			kind: 'course-note',
			title: 'Bound Path',
		});

		await expect(noteTemplates.confirm({
			...preview,
			path: 'Course/Other/Other.md',
		})).rejects.toMatchObject({ code: 'invalid_destination' });
		expect(templatePort.created).toHaveLength(0);
	});

	it('creates a book-reading note with the book-note discriminator', async () => {
		const templatePort = port();

		const result = await service(templatePort.value).create({
			kind: 'book-reading',
			title: '深度学习推荐系统',
		});

		expect(result.path).toBe('Reading/深度学习推荐系统/深度学习推荐系统.md');
		expect(templatePort.created[0]?.content).toContain('"kind": "book-note"');
		expect(templatePort.created[0]?.content).toContain('## 读后思考');
	});

	it('groups a note into a matching folder before creating a new folder', async () => {
		const templatePort = port({
			listDescendants: async () => [
				{ path: 'Paper/Attention Is All You Need', kind: 'folder' },
				{ path: 'Paper/Attention Is All You Need/source.pdf', kind: 'file' },
			],
		});

		const preview = await service(templatePort.value).preview({
			kind: 'paper-reading',
			title: 'Attention Is All You Need',
		});

		expect(preview.path).toBe(
			'Paper/Attention Is All You Need/Attention Is All You Need.md',
		);
	});

	it('groups beside a title-prefixed source file in one existing folder', async () => {
		const templatePort = port({
			listDescendants: async () => [
				{
					path: 'Reading/DL_Recommender_System/深度学习推荐系统 (王喆).pdf',
					kind: 'file',
				},
			],
		});

		const preview = await service(templatePort.value).preview({
			kind: 'book-reading',
			title: '深度学习推荐系统',
		});

		expect(preview.path).toBe(
			'Reading/DL_Recommender_System/深度学习推荐系统.md',
		);
	});

	it('prepares an Agent creation with native path preflight and rendered content', async () => {
		const templatePort = port({
			listDescendants: async () => [
				{
					path: 'Reading/DL_Recommender_System/深度学习推荐系统 (王喆).pdf',
					kind: 'file',
				},
			],
		});

		const preparation = await service(templatePort.value).prepareAgentCreation({
			kind: 'book-reading',
			title: '深度学习推荐系统',
		});

		expect(preparation).toMatchObject({
			path: 'Reading/DL_Recommender_System/深度学习推荐系统.md',
			destination: 'Reading',
		});
		expect(preparation.templateContent).toContain('"kind": "book-note"');
		expect(preparation.templateContent).toContain('# 深度学习推荐系统');
		expect(templatePort.created).toHaveLength(0);
		expect(templatePort.ensured).toHaveLength(0);
	});

	it('refuses an existing Agent target during native preflight without reading it', async () => {
		const read = vi.fn(async () => null);
		const templatePort = port({
			read,
			listDescendants: async () => [
				{ path: 'Reading/Existing', kind: 'folder' },
				{ path: 'Reading/Existing/Existing.md', kind: 'file' },
			],
		});

		await expect(service(templatePort.value).prepareAgentCreation({
			kind: 'book-reading',
			title: 'Existing',
		})).rejects.toMatchObject({ code: 'note_exists' });
		expect(read).not.toHaveBeenCalled();
	});

	it('fails closed when equally strong matches point to multiple folders', async () => {
		const templatePort = port({
			listDescendants: async () => [
				{ path: 'Paper/First/Same Title.pdf', kind: 'file' },
				{ path: 'Paper/Second/Same Title.md', kind: 'file' },
			],
		});

		await expect(service(templatePort.value).preview({
			kind: 'paper-reading',
			title: 'Same Title',
		})).rejects.toMatchObject({ code: 'ambiguous_destination' });
	});
});
