import type { MetadataSettings } from './metadata-settings';
import { PAPER_STATUSES } from './metadata-settings';

export interface AcademicMaterialDiagnosticFile {
	readonly path: string;
}

export interface AcademicMaterialDiagnosticVaultPort {
	listMarkdownFiles(): readonly AcademicMaterialDiagnosticFile[];
	frontmatter(path: string): Readonly<Record<string, unknown>> | null;
}

export type AcademicMaterialDiagnosticIssueCategory =
	| 'course-marker-type-mismatch'
	| 'invalid-paper-status'
	| 'metadata-read-error'
	| 'paper-root-note-unclassified'
	| 'course-root-note-unclassified';

export interface AcademicMaterialDiagnosticSample {
	readonly path: string;
	readonly category: AcademicMaterialDiagnosticIssueCategory;
}

export interface AcademicMaterialDiagnosticReport {
	readonly mapping: {
		readonly rootFolder: string;
		readonly paperRootFolder: string;
		readonly noteTypeField: string;
		readonly courseField: string;
		readonly expectedType: string;
		readonly expectedPaperType: string;
		readonly statusField: string;
	};
	readonly counts: {
		readonly markdownFiles: number;
		readonly inspected: number;
		readonly excluded: number;
		readonly matchedCourseNotes: number;
		readonly matchedPaperNotes: number;
		readonly courseMarkerTypeMismatches: number;
		readonly courseRootNotesUnclassified: number;
		readonly paperRootNotesUnclassified: number;
		readonly invalidPaperStatuses: number;
		readonly metadataReadErrors: number;
	};
	readonly samples: readonly AcademicMaterialDiagnosticSample[];
}

export interface AcademicMaterialDiagnosticRequest {
	readonly metadata: MetadataSettings;
	readonly rootFolder: string;
	readonly paperRootFolder: string;
	readonly sampleLimit?: number;
	readonly signal?: AbortSignal;
	readonly onProgress?: (scanned: number, total: number) => void;
}

export class AcademicMaterialDiagnosticCancelledError extends Error {
	constructor() {
		super('Academic material diagnostic was cancelled.');
		this.name = 'AcademicMaterialDiagnosticCancelledError';
	}
}

function visibleMarkdownPath(path: string): boolean {
	return path.split('/').every((segment) =>
		segment.length > 0 && segment !== 'node_modules' && !segment.startsWith('.'));
}

function pathIsInRoot(path: string, rootFolder: string): boolean {
	const root = rootFolder.replace(/^\/+|\/+$/g, '');
	return root.length === 0 || path === root || path.startsWith(`${root}/`);
}

function nonEmptyMarker(value: unknown): boolean {
	return typeof value === 'string'
		? value.trim().length > 0
		: Array.isArray(value)
			? value.length > 0
			: value !== undefined && value !== null;
}

export async function diagnoseAcademicMaterials(
	vault: AcademicMaterialDiagnosticVaultPort,
	request: AcademicMaterialDiagnosticRequest,
): Promise<AcademicMaterialDiagnosticReport> {
	const files = [...vault.listMarkdownFiles()].sort((left, right) =>
		left.path.localeCompare(right.path));
	const sampleLimit = Math.max(0, Math.min(20, request.sampleLimit ?? 8));
	const samples: AcademicMaterialDiagnosticSample[] = [];
	let inspected = 0;
	let excluded = 0;
	let matchedCourseNotes = 0;
	let matchedPaperNotes = 0;
	let courseMarkerTypeMismatches = 0;
	let courseRootNotesUnclassified = 0;
	let paperRootNotesUnclassified = 0;
	let invalidPaperStatuses = 0;
	let metadataReadErrors = 0;
	const addSample = (path: string, category: AcademicMaterialDiagnosticIssueCategory): void => {
		if (samples.length < sampleLimit) samples.push(Object.freeze({ path, category }));
	};

	request.onProgress?.(0, files.length);
	for (const [index, file] of files.entries()) {
		if (request.signal?.aborted) throw new AcademicMaterialDiagnosticCancelledError();
		request.onProgress?.(index + 1, files.length);
		if (!visibleMarkdownPath(file.path)) {
			excluded += 1;
			continue;
		}
		inspected += 1;
		let frontmatter: Readonly<Record<string, unknown>> | null;
		try {
			frontmatter = vault.frontmatter(file.path);
		} catch {
			metadataReadErrors += 1;
			addSample(file.path, 'metadata-read-error');
			continue;
		}
		const noteType = frontmatter?.[request.metadata.fields.noteType];
		const courseMarker = frontmatter?.[request.metadata.fields.course];
		if (noteType === request.metadata.values.courseNoteType) {
			matchedCourseNotes += 1;
		} else if (noteType === request.metadata.values.paperType) {
			matchedPaperNotes += 1;
			const status = frontmatter?.[request.metadata.fields.status];
			if (status !== undefined && !(typeof status === 'string' &&
				(PAPER_STATUSES as readonly string[]).includes(status.trim()))) {
				invalidPaperStatuses += 1;
				addSample(file.path, 'invalid-paper-status');
			}
		} else if (nonEmptyMarker(courseMarker)) {
			courseMarkerTypeMismatches += 1;
			addSample(file.path, 'course-marker-type-mismatch');
		} else if (pathIsInRoot(file.path, request.rootFolder)) {
			courseRootNotesUnclassified += 1;
			addSample(file.path, 'course-root-note-unclassified');
		} else if (pathIsInRoot(file.path, request.paperRootFolder)) {
			paperRootNotesUnclassified += 1;
			addSample(file.path, 'paper-root-note-unclassified');
		}
		if (index > 0 && index % 100 === 0) {
			await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
			if (request.signal?.aborted) throw new AcademicMaterialDiagnosticCancelledError();
		}
	}

	return Object.freeze({
		mapping: Object.freeze({
			rootFolder: request.rootFolder,
			paperRootFolder: request.paperRootFolder,
			noteTypeField: request.metadata.fields.noteType,
			courseField: request.metadata.fields.course,
			expectedType: request.metadata.values.courseNoteType,
			expectedPaperType: request.metadata.values.paperType,
			statusField: request.metadata.fields.status,
		}),
		counts: Object.freeze({
			markdownFiles: files.length,
			inspected,
			excluded,
			matchedCourseNotes,
			matchedPaperNotes,
			courseMarkerTypeMismatches,
			courseRootNotesUnclassified,
			paperRootNotesUnclassified,
			invalidPaperStatuses,
			metadataReadErrors,
		}),
		samples: Object.freeze(samples),
	});
}
