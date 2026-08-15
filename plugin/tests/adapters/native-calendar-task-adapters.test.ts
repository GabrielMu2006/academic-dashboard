import { describe, expect, it, vi } from 'vitest';
import {
	NativeCalendarAdapter,
	NativeTodayTasksAdapter,
	OptionalTasksPluginAdapter,
	type NativeMarkdownTaskPort,
} from '../../src/adapters/native-calendar-task-adapters';
import type { NativeVaultPort } from '../../src/adapters/native-vault-academic-adapters';

describe('Native Calendar adapter', () => {
	it('builds a leap-month calendar and links only existing ISO daily notes', async () => {
		const vault: NativeVaultPort = {
			listMarkdownFiles: () => [
				{
					path: 'node_modules/pkg/2024-02-01.md',
					basename: '2024-02-01',
					modifiedAt: 4,
				},
				{ path: 'Daily/2024-02-01.md', basename: '2024-02-01', modifiedAt: 1 },
				{ path: 'Archive/2024-02-01.md', basename: '2024-02-01', modifiedAt: 2 },
				{ path: 'Notes/not-a-date.md', basename: 'not-a-date', modifiedAt: 3 },
			],
			frontmatter: () => null,
		};
		const month = await new NativeCalendarAdapter(vault).query({
			year: 2024,
			month: 2,
		});

		expect(month.days).toHaveLength(29);
		expect(month.startsOn).toBe(4);
		expect(month.days[0]).toEqual({
			date: '2024-02-01',
			day: 1,
			notePaths: ['Archive/2024-02-01.md', 'Daily/2024-02-01.md'],
		});
		expect(month.days[1]?.notePaths).toEqual([]);
	});

	it('rejects invalid month queries without touching Vault data', async () => {
		const list = vi.fn(() => []);
		const adapter = new NativeCalendarAdapter({
			listMarkdownFiles: list,
			frontmatter: () => null,
		});

		await expect(adapter.query({ year: 2026, month: 13 })).rejects.toThrow();
		expect(list).not.toHaveBeenCalled();
	});
});

function taskPort(): NativeMarkdownTaskPort {
	const content: Record<string, string> = {
		'node_modules/pkg/README.md': '- [ ] Dependency example 📅 2026-08-11',
		'Daily/2026-08-11.md': [
			'- [ ] Read chapter',
			'- [ ] Submit response 📅 2026-08-11',
			'- [x] Completed item 📅 2026-08-11',
			'```md',
			'- [ ] Example only 📅 2026-08-11',
			'```',
		].join('\n'),
		'Course/project.md': [
			'- [ ] Prepare slides due:: 2026-08-11',
			'- [ ] Future task 📅 2026-08-12',
			'- [ ] Undated elsewhere',
		].join('\n'),
	};
	return {
		listMarkdownFiles: () => [
			{
				path: 'node_modules/pkg/README.md',
				basename: 'README',
				modifiedAt: 30,
			},
			{ path: 'Course/project.md', basename: 'project', modifiedAt: 20 },
			{ path: 'Daily/2026-08-11.md', basename: '2026-08-11', modifiedAt: 10 },
		],
		readMarkdown: async (path) => content[path] ?? '',
	};
}

describe('Native Markdown Today Tasks adapter', () => {
	it('includes today-due tasks plus undated tasks in today’s daily note', async () => {
		const tasks = await new NativeTodayTasksAdapter(taskPort()).query({
			date: '2026-08-11',
			limit: 20,
		});

		expect(tasks.map(({ text }) => text)).toEqual([
			'Prepare slides',
			'Read chapter',
			'Submit response',
		]);
		expect(tasks.map(({ line }) => line)).toEqual([1, 1, 2]);
		expect(tasks[0]?.dueDate).toBe('2026-08-11');
		expect(tasks.some(({ text }) => text.includes('Example only'))).toBe(false);
	});

	it('bounds results and rejects malformed dates', async () => {
		const adapter = new NativeTodayTasksAdapter(taskPort());
		expect(await adapter.query({ date: '2026-08-11', limit: 1 })).toHaveLength(1);
		await expect(adapter.query({ date: '2026-02-30', limit: 20 })).rejects.toThrow();
	});
});

describe('optional Tasks adapter boundary', () => {
	it('declares and executes Native fallback when Tasks is missing', async () => {
		const native = new NativeTodayTasksAdapter(taskPort());
		const adapter = new OptionalTasksPluginAdapter(
			{ isInstalled: () => false },
			native,
		);

		expect(await adapter.availability()).toEqual({
			status: 'fallback',
			source: 'optional-plugin',
			reason: 'Tasks is not installed; using Native Markdown tasks.',
			fallbackAdapterId: 'native-vault.today-tasks',
		});
		expect(await adapter.query({ date: '2026-08-11', limit: 20 })).toHaveLength(3);
	});

	it('uses only an explicitly supplied compatible query capability', async () => {
		const queryToday = vi.fn(async () => [
			{ path: 'Tasks.md', line: 4, text: 'Plugin task', dueDate: '2026-08-11' },
		]);
		const adapter = new OptionalTasksPluginAdapter(
			{ isInstalled: () => true, queryToday },
			new NativeTodayTasksAdapter(taskPort()),
		);

		expect(await adapter.availability()).toEqual({
			status: 'available',
			source: 'optional-plugin',
		});
		expect(await adapter.query({ date: '2026-08-11', limit: 500 })).toHaveLength(1);
		expect(queryToday).toHaveBeenCalledWith('2026-08-11', 100);
	});

	it('falls back safely when a compatible plugin query fails at runtime', async () => {
		const adapter = new OptionalTasksPluginAdapter(
			{
				isInstalled: () => true,
				queryToday: async () => {
					throw new Error('Plugin changed');
				},
			},
			new NativeTodayTasksAdapter(taskPort()),
		);

		expect(await adapter.query({ date: '2026-08-11', limit: 20 })).toHaveLength(3);
	});

	it('rejects malformed optional-plugin output and uses the Native fallback', async () => {
		const adapter = new OptionalTasksPluginAdapter(
			{
				isInstalled: () => true,
				queryToday: async () => [
					{ path: '../outside.md', line: 0, text: 'Unsafe plugin task' },
				],
			},
			new NativeTodayTasksAdapter(taskPort()),
		);

		const tasks = await adapter.query({ date: '2026-08-11', limit: 20 });
		expect(tasks).toHaveLength(3);
		expect(tasks.some(({ text }) => text === 'Unsafe plugin task')).toBe(false);
	});
});
