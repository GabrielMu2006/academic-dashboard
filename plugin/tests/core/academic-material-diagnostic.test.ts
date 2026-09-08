import { describe, expect, it } from 'vitest';
import {
	AcademicMaterialDiagnosticCancelledError,
	diagnoseAcademicMaterials,
	type AcademicMaterialDiagnosticVaultPort,
} from '../../src/core/academic-material-diagnostic';
import { DEFAULT_METADATA_SETTINGS } from '../../src/core/metadata-settings';

function vault(
	frontmatter: Readonly<Record<string, Readonly<Record<string, unknown>> | Error | null>>,
): AcademicMaterialDiagnosticVaultPort {
	return {
		listMarkdownFiles: () => Object.keys(frontmatter).map((path) => ({ path })),
		frontmatter: (path) => {
			const value = frontmatter[path];
			if (value instanceof Error) throw value;
			return value ?? null;
		},
	};
}

describe('diagnoseAcademicMaterials', () => {
	it('reports mappings, bounded issue categories, and no note bodies', async () => {
		const report = await diagnoseAcademicMaterials(vault({
			'Course/Math.md': { type: 'course-note', course: 'Math' },
			'Course/Loose.md': null,
			'Notes/Marked.md': { type: 'misc', course: 'Math' },
			'Paper/Invalid.md': { type: 'paper', status: 'started' },
			'Paper/Loose.md': null,
			'Course/Broken.md': new Error('private detail'),
			'.hidden/generated.md': { type: 'course-note' },
		}), {
			metadata: DEFAULT_METADATA_SETTINGS,
			rootFolder: 'Course',
			paperRootFolder: 'Paper',
			sampleLimit: 8,
		});

			expect(report.mapping).toEqual({
			rootFolder: 'Course',
			paperRootFolder: 'Paper',
			noteTypeField: 'type',
			courseField: 'course',
			expectedType: 'course-note',
			expectedPaperType: 'paper',
			statusField: 'status',
		});
		expect(report.counts).toEqual({
			markdownFiles: 7,
			inspected: 6,
			excluded: 1,
			matchedCourseNotes: 1,
			matchedPaperNotes: 1,
			courseMarkerTypeMismatches: 1,
			courseRootNotesUnclassified: 1,
			paperRootNotesUnclassified: 1,
			invalidPaperStatuses: 1,
			metadataReadErrors: 1,
		});
		expect(report.samples).toHaveLength(5);
		expect(JSON.stringify(report)).not.toContain('private detail');
	});

	it('previews custom mappings without changing the supplied settings', async () => {
		const custom = {
			...DEFAULT_METADATA_SETTINGS,
			fields: { ...DEFAULT_METADATA_SETTINGS.fields, noteType: 'kind', course: 'module', status: 'progress' },
			values: { courseNoteType: 'class', paperType: 'article' },
		};
		const progress: Array<[number, number]> = [];
		const report = await diagnoseAcademicMaterials(vault({
			'Classes/A.md': { kind: 'class', module: 'A' },
			'Articles/B.md': { kind: 'article', progress: 'reading' },
		}), {
			metadata: custom,
			rootFolder: 'Classes',
			paperRootFolder: 'Articles',
			onProgress: (scanned, total) => progress.push([scanned, total]),
		});

		expect(report.counts.matchedCourseNotes).toBe(1);
		expect(report.counts.matchedPaperNotes).toBe(1);
		expect(progress).toEqual([[0, 2], [1, 2], [2, 2]]);
		expect(DEFAULT_METADATA_SETTINGS.fields.noteType).toBe('type');
	});

	it('explains empty roots without manufacturing matches', async () => {
		const report = await diagnoseAcademicMaterials(vault({}), {
			metadata: DEFAULT_METADATA_SETTINGS,
			rootFolder: 'Course',
			paperRootFolder: 'Paper',
		});
		expect(report.counts.markdownFiles).toBe(0);
		expect(report.counts.matchedCourseNotes).toBe(0);
		expect(report.counts.matchedPaperNotes).toBe(0);
		expect(report.samples).toEqual([]);
	});

	it('fails promptly when cancelled', async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(diagnoseAcademicMaterials(vault({ 'Course/A.md': {} }), {
			metadata: DEFAULT_METADATA_SETTINGS,
			rootFolder: 'Course',
			paperRootFolder: 'Paper',
			signal: controller.signal,
		})).rejects.toBeInstanceOf(AcademicMaterialDiagnosticCancelledError);
	});
});
