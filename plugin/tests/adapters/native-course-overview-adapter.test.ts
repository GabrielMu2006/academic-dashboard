import { describe, expect, it } from 'vitest';
import { NativeCourseOverviewAdapter, type CourseOverviewVaultPort } from '../../src/adapters/native-course-overview-adapter';
import { adapterAvailable } from '../../src/core/data-adapter';
import { DEFAULT_METADATA_SETTINGS } from '../../src/core/metadata-settings';

function adapter() {
	const metadata: Record<string, Readonly<Record<string, unknown>> | null> = {
		'Course/Math/Fall.md': { type: 'course-note', course: 'Math', term: 'Fall' },
		'Archive/Math-Spring.md': { type: 'course-note', course: 'Math', term: 'Spring' },
		'Course/Math/Assignment.md': { course: 'Math', term: 'Fall' },
		'Course/History/Notes.md': { type: 'course-note', course: 'History', term: 'Fall' },
	};
	const vault: CourseOverviewVaultPort = {
		listFiles: () => [
			...Object.keys(metadata).map((path) => ({ path, extension: 'md' })),
			{ path: 'Course/Math/Slides.pdf', extension: 'pdf' },
			{ path: '.dashboard-cache/Course/Math/Private.md', extension: 'md' },
			{ path: 'Course/Math/node_modules/generated.pdf', extension: 'pdf' },
		],
		frontmatter: (path) => metadata[path] ?? null,
	};
	return new NativeCourseOverviewAdapter({
		vault,
		tasks: {
			id: 'tasks', availability: async () => adapterAvailable('native-vault'),
			query: async () => ({
				overdue: [{ path: 'Course/Math/Assignment.md', line: 3, text: 'Submit work', dueDate: '2026-09-07' }],
				today: [], upcoming: [],
			}),
		},
		reviews: {
			id: 'reviews', availability: async () => adapterAvailable('native-vault'),
			query: async () => [{ path: 'Course/Math/Fall.md', title: 'Fall', kind: 'note', dueCount: 1, totalCount: 1 }],
		},
		getMetadata: () => DEFAULT_METADATA_SETTINGS,
		getDailyNotePath: (date) => `Daily/${date}.md`,
	});
}

describe('NativeCourseOverviewAdapter', () => {
	it('keeps same-name courses in different terms separate and uses the selected term for root resources', async () => {
		const result = await adapter().query({ date: '2026-09-08', rootFolder: 'Course', currentTerm: 'Fall', limit: 20 });
		expect(result.courses.map(({ name, term }) => `${name}:${term}`)).toEqual(['History:Fall', 'Math:Fall']);
		const math = result.courses.find(({ name }) => name === 'Math');
		expect(math?.notes.map(({ path }) => path)).toEqual(['Course/Math/Fall.md']);
		expect(math?.resources.map(({ path }) => path)).toEqual([
			'Course/Math/Assignment.md', 'Course/Math/Slides.pdf',
		]);
		expect(math?.id).toBe('["math","fall"]');
		expect(math?.tasks).toHaveLength(1);
		expect(math?.reviews).toHaveLength(1);
		expect(math?.basis).toBe('metadata');
	});

	it('leaves shared-root resources unresolved when same-name terms are ambiguous', async () => {
		const result = await adapter().query({ date: '2026-09-08', rootFolder: 'Course', currentTerm: '', limit: 20 });
		expect(result.courses.filter(({ name }) => name === 'Math')).toHaveLength(2);
		expect(result.unresolvedCount).toBe(1);
		expect(result.courses.flatMap(({ resources }) => resources).some(({ path }) => path.endsWith('Slides.pdf'))).toBe(false);
	});

	it('returns an explainable empty result for a nonmatching current term', async () => {
		const result = await adapter().query({ date: '2026-09-08', rootFolder: 'Course', currentTerm: 'Winter', limit: 20 });
		expect(result.courses).toEqual([]);
		expect(result.incomplete).toBe(false);
	});

	it('uses the selected term for a folder-only course with no term metadata', async () => {
		const base = adapter();
		const folderOnly = new NativeCourseOverviewAdapter({
			vault: {
				listFiles: () => [{ path: 'Course/Physics/Outline.pdf', extension: 'pdf' }],
				frontmatter: () => null,
			},
			tasks: { id: 'tasks', availability: () => base.availability(), query: async () => ({ overdue: [], today: [], upcoming: [] }) },
			reviews: { id: 'reviews', availability: () => base.availability(), query: async () => [] },
			getMetadata: () => DEFAULT_METADATA_SETTINGS,
			getDailyNotePath: (date) => `Daily/${date}.md`,
		});
		const result = await folderOnly.query({ date: '2026-09-08', rootFolder: 'Course', currentTerm: 'Fall', limit: 20 });
		expect(result.courses.map(({ name, term }) => `${name}:${term}`)).toEqual(['Physics:Fall']);
	});
});
