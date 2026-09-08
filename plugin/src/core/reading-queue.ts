import { isRecord, validationFailure, validationIssue, validationSuccess, type ValidationResult } from './validation';
import { isSafeVaultRelativePath } from './template-settings';

export const READING_STATUSES = ['to-read', 'reading', 'completed'] as const;
export type ReadingStatus = (typeof READING_STATUSES)[number];
export type ReadingKind = 'paper' | 'book';
export type ReadingPositionUnit = 'page' | 'chapter' | 'stage';

export interface ReadingProgressRecord {
	readonly path: string;
	readonly kind: ReadingKind;
	readonly status: ReadingStatus;
	readonly order: number;
	readonly nextStep: string;
	readonly position: string;
	readonly positionUnit: ReadingPositionUnit;
	readonly stableId?: string;
	readonly signature: string;
}

export interface ReadingMaterial {
	readonly path: string;
	readonly kind: ReadingKind;
	readonly title: string;
	readonly authors: readonly string[];
	readonly year?: number;
	readonly edition?: string;
	readonly stableId?: string;
	readonly signature: string;
	readonly sourceStatus?: ReadingStatus;
}

export interface ReadingQueueItem extends ReadingMaterial {
	readonly status: ReadingStatus;
	readonly order: number;
	readonly nextStep: string;
	readonly position: string;
	readonly positionUnit: ReadingPositionUnit;
	readonly association: 'path' | 'stable-id' | 'signature' | 'untracked';
}

const text = (value: unknown, maximum: number): string | null =>
	typeof value === 'string' && value.trim().length <= maximum ? value.trim() : null;

export function readingSignature(input: {
	readonly kind: ReadingKind;
	readonly title: string;
	readonly authors: readonly string[];
	readonly year?: number;
	readonly edition?: string;
}): string {
	return JSON.stringify([
		input.kind,
		input.title.normalize('NFC').toLocaleLowerCase(),
		[...input.authors].map((author) => author.normalize('NFC').toLocaleLowerCase()).sort(),
		input.year ?? null,
		input.edition?.normalize('NFC').toLocaleLowerCase() ?? null,
	]);
}

export function validateReadingProgressRecords(input: unknown): ValidationResult<readonly ReadingProgressRecord[]> {
	if (!Array.isArray(input) || input.length > 200) {
		return validationFailure([validationIssue('invalid_reading_records', 'settings.widgets.readingQueue', 'Expected at most 200 reading records.')]);
	}
	const records: ReadingProgressRecord[] = [];
	const issues = [];
	const paths = new Set<string>();
	for (const [index, value] of input.entries()) {
		const base = `settings.widgets.readingQueue.${index}`;
		if (!isRecord(value)) {
			issues.push(validationIssue('invalid_reading_record', base, 'Expected a reading record.'));
			continue;
		}
		const kind = value.kind === 'paper' || value.kind === 'book' ? value.kind : null;
		const status = (READING_STATUSES as readonly unknown[]).includes(value.status) ? value.status as ReadingStatus : null;
		const positionUnit = value.positionUnit === 'page' || value.positionUnit === 'chapter' || value.positionUnit === 'stage' ? value.positionUnit : null;
		const nextStep = text(value.nextStep, 300);
		const position = text(value.position, 120);
		const stableId = value.stableId === undefined ? undefined : text(value.stableId, 120);
		const signature = text(value.signature, 800);
		const order = typeof value.order === 'number' && Number.isInteger(value.order) && value.order >= 0 && value.order <= 10000 ? value.order : null;
		if (!isSafeVaultRelativePath(value.path, { markdownFile: true }) || !kind || !status || !positionUnit || nextStep === null || position === null || stableId === null || !signature || order === null || paths.has(value.path)) {
			issues.push(validationIssue('invalid_reading_record', base, 'Expected one unique visible Markdown path and bounded reading fields.'));
			continue;
		}
		paths.add(value.path);
		records.push(Object.freeze({ path: value.path.trim(), kind, status, order, nextStep, position, positionUnit, ...(stableId ? { stableId } : {}), signature }));
	}
	return issues.length > 0 ? validationFailure(issues) : validationSuccess(Object.freeze(records));
}

export function mergeReadingQueue(materials: readonly ReadingMaterial[], records: readonly ReadingProgressRecord[]): readonly ReadingQueueItem[] {
	const stableCounts = new Map<string, number>();
	const signatureCounts = new Map<string, number>();
	for (const material of materials) {
		if (material.stableId) stableCounts.set(`${material.kind}:${material.stableId}`, (stableCounts.get(`${material.kind}:${material.stableId}`) ?? 0) + 1);
		signatureCounts.set(material.signature, (signatureCounts.get(material.signature) ?? 0) + 1);
	}
	const claimed = new Set<ReadingProgressRecord>();
	const items = materials.map((material): ReadingQueueItem => {
		let association: ReadingQueueItem['association'] = 'untracked';
		let record = records.find((candidate) => candidate.kind === material.kind && candidate.path === material.path && !claimed.has(candidate));
		if (record) association = 'path';
		if (!record && material.stableId && stableCounts.get(`${material.kind}:${material.stableId}`) === 1) {
			record = records.find((candidate) => candidate.kind === material.kind && candidate.stableId === material.stableId && !claimed.has(candidate));
			if (record) association = 'stable-id';
		}
		if (!record && signatureCounts.get(material.signature) === 1) {
			record = records.find((candidate) => candidate.kind === material.kind && candidate.signature === material.signature && !claimed.has(candidate));
			if (record) association = 'signature';
		}
		if (record) claimed.add(record);
		return Object.freeze({ ...material, status: record?.status ?? material.sourceStatus ?? 'to-read', order: record?.order ?? 10000, nextStep: record?.nextStep ?? '', position: record?.position ?? '', positionUnit: record?.positionUnit ?? (material.kind === 'book' ? 'page' : 'stage'), association });
	});
	return Object.freeze(items.sort((left, right) => left.order - right.order || left.title.localeCompare(right.title) || left.path.localeCompare(right.path)));
}
