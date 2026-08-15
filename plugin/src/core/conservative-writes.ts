import { PAPER_STATUSES, type PaperStatus } from './metadata-settings';
import { isSafeVaultRelativePath } from './template-settings';

export const LOCAL_WRITE_OPERATION_TYPES = [
	'task-toggle',
	'review-date',
	'paper-status',
	'paper-favorite',
	'create-daily-note',
	'create-course-note',
	'create-paper-note',
] as const;

export type LocalWriteOperationType =
	(typeof LOCAL_WRITE_OPERATION_TYPES)[number];

export const LOCAL_WRITE_ERROR_CODES = [
	'invalid-path',
	'invalid-request',
	'target-missing',
	'target-exists',
	'target-ambiguous',
	'unsupported-value',
	'malformed-markdown',
	'malformed-frontmatter',
	'conflict',
	'write-failed',
	'postcondition-failed',
	'undo-unavailable',
] as const;

export type LocalWriteErrorCode = (typeof LOCAL_WRITE_ERROR_CODES)[number];

export class ConservativeWriteError extends Error {
	constructor(
		readonly code: LocalWriteErrorCode,
		message: string,
	) {
		super(message);
		this.name = 'ConservativeWriteError';
	}
}

export interface TaskToggleRequest {
	readonly operation: 'task-toggle';
	readonly path: string;
	readonly line: number;
	readonly completed: boolean;
}

export interface ReviewDateRequest {
	readonly operation: 'review-date';
	readonly path: string;
	readonly line: number;
	readonly nextReviewDate: string;
}

export interface PaperStatusRequest {
	readonly operation: 'paper-status';
	readonly path: string;
	readonly field: string;
	readonly value: PaperStatus;
	readonly expectedValue: PaperStatus;
	readonly paper: PaperIdentity;
}

export interface PaperFavoriteRequest {
	readonly operation: 'paper-favorite';
	readonly path: string;
	readonly field: string;
	readonly value: boolean;
	readonly expectedValue: boolean | null;
	readonly paper: PaperIdentity;
}

export interface PaperIdentity {
	readonly field: string;
	readonly value: string;
}

export type ConservativeEditRequest =
	| TaskToggleRequest
	| ReviewDateRequest
	| PaperStatusRequest
	| PaperFavoriteRequest;

export interface CreationRequest {
	readonly operation:
		| 'create-daily-note'
		| 'create-course-note'
		| 'create-paper-note';
	readonly path: string;
	readonly content: string;
}

interface PreviewBase {
	readonly operation: LocalWriteOperationType;
	readonly path: string;
	readonly preview: Readonly<{
		readonly before: string;
		readonly after: string;
	}>;
}

export interface EditWritePreview extends PreviewBase {
	readonly kind: 'edit';
	readonly beforeFingerprint: string;
	readonly afterFingerprint: string;
	/** Exact session precondition. Never persist or log this content. */
	readonly beforeContent: string;
	/** Exact prepared post-state. Never persist or log this content. */
	readonly afterContent: string;
}

export interface CreationWritePreview extends PreviewBase {
	readonly kind: 'create';
	readonly beforeFingerprint: 'absent';
	readonly afterFingerprint: string;
	/** Bounded content required by the review-first creation contract. */
	readonly content: string;
}

export type ConservativeWritePreview = EditWritePreview | CreationWritePreview;

export interface ConservativeWriteCommitResult {
	readonly operation: LocalWriteOperationType;
	readonly path: string;
	readonly outcome: 'committed';
	readonly undoToken?: string;
}

export interface ConservativeUndoResult {
	readonly operation: LocalWriteOperationType;
	readonly path: string;
	readonly outcome: 'undone';
}

export interface ConservativeWritePort {
	read(path: string): Promise<string | null>;
	compareAndSwap(
		path: string,
		expectedContent: string,
		nextContent: string,
	): Promise<'written' | 'missing' | 'conflict'>;
	ensureFolder(path: string): Promise<void>;
	createExclusive(
		path: string,
		content: string,
	): Promise<'created' | 'exists'>;
}

export type LocalWriteLogOutcome =
	| 'committed'
	| 'undone'
	| 'rejected'
	| 'conflict';

export interface LocalWriteLogEvent {
	readonly timestamp: string;
	readonly operation: LocalWriteOperationType;
	readonly path: string;
	readonly outcome: LocalWriteLogOutcome;
	readonly errorCode?: LocalWriteErrorCode;
}

export interface ConservativeWriteServiceOptions {
	readonly log?: (event: LocalWriteLogEvent) => void;
	readonly now?: () => Date;
}

interface SessionUndoState {
	readonly operation: LocalWriteOperationType;
	readonly path: string;
	readonly beforeContent: string;
	readonly afterContent: string;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const MAX_CREATE_CONTENT_LENGTH = 100_000;
const MAX_PREVIEW_TEXT_LENGTH = 2_000;

export function isSafeWritePath(value: unknown): value is string {
	return isSafeVaultRelativePath(value, { markdownFile: true });
}

/** Stable opaque identity; exact content is also compared before every write. */
export function fingerprintContent(content: string): string {
	let first = 0x811c9dc5;
	let second = 0x9e3779b9;
	for (let index = 0; index < content.length; index += 1) {
		const code = content.charCodeAt(index);
		first = Math.imul(first ^ code, 0x01000193) >>> 0;
		second = Math.imul(second ^ (code + index), 0x85ebca6b) >>> 0;
	}
	return `v1-${content.length}-${first.toString(16).padStart(8, '0')}${second
		.toString(16)
		.padStart(8, '0')}`;
}

function boundedPreview(value: string): string {
	return value.length <= MAX_PREVIEW_TEXT_LENGTH
		? value
		: `${value.slice(0, MAX_PREVIEW_TEXT_LENGTH - 1)}…`;
}

function splitLines(content: string): string[] {
	return content.split('\n');
}

function checkedLineTransform(
	content: string,
	lineNumber: number,
	completed: boolean,
): { readonly content: string; readonly before: string; readonly after: string } {
	if (!Number.isInteger(lineNumber) || lineNumber < 1) {
		throw new ConservativeWriteError('invalid-request', 'Task line must be positive.');
	}
	const lines = splitLines(content);
	const index = lineNumber - 1;
	const target = lines[index];
	if (target === undefined) {
		throw new ConservativeWriteError('target-missing', 'Task line is unavailable.');
	}
	let fence: '`' | '~' | null = null;
	for (let cursor = 0; cursor <= index; cursor += 1) {
		const marker = /^\s*(`{3,}|~{3,})/u.exec(lines[cursor] ?? '')?.[1]?.[0];
		if (marker) {
			const kind = marker === '~' ? '~' : '`';
			fence = fence === null ? kind : fence === kind ? null : fence;
			if (cursor === index) {
				throw new ConservativeWriteError('target-ambiguous', 'A fence is not a task.');
			}
		}
	}
	if (fence !== null) {
		throw new ConservativeWriteError('target-ambiguous', 'Task is inside fenced code.');
	}
	const match = /^(\s*[-*+]\s+\[)([ xX])(\]\s+.+)$/u.exec(target);
	if (!match) {
		throw new ConservativeWriteError('target-ambiguous', 'Expected one Markdown task.');
	}
	const isCompleted = match[2]?.toLocaleLowerCase() === 'x';
	if (isCompleted === completed) {
		throw new ConservativeWriteError('invalid-request', 'Task already has that state.');
	}
	const after = `${match[1]}${completed ? 'x' : ' '}${match[3]}`;
	lines[index] = after;
	return { content: lines.join('\n'), before: target, after };
}

function reviewLineTransform(
	content: string,
	lineNumber: number,
	nextReviewDate: string,
): { readonly content: string; readonly before: string; readonly after: string } {
	if (!Number.isInteger(lineNumber) || lineNumber < 1 || !ISO_DATE_PATTERN.test(nextReviewDate)) {
		throw new ConservativeWriteError('invalid-request', 'Review update is invalid.');
	}
	const lines = splitLines(content);
	const index = lineNumber - 1;
	const target = lines[index];
	if (target === undefined) {
		throw new ConservativeWriteError('target-missing', 'Review line is unavailable.');
	}
	const matches = [...target.matchAll(/<!--SR:!?(\d{4}-\d{2}-\d{2})([^>]*)-->/gu)];
	if (matches.length !== 1) {
		throw new ConservativeWriteError(
			'target-ambiguous',
			'Expected exactly one supported review marker on the target line.',
		);
	}
	const match = matches[0]!;
	if (match[1] === nextReviewDate) {
		throw new ConservativeWriteError('invalid-request', 'Review date is unchanged.');
	}
	const marker = match[0];
	const replacement = marker.replace(match[1]!, nextReviewDate);
	const after = `${target.slice(0, match.index)}${replacement}${target.slice(
		(match.index ?? 0) + marker.length,
	)}`;
	lines[index] = after;
	return { content: lines.join('\n'), before: target, after };
}

function parseFrontmatterKey(line: string): { key: string; value: string } | null {
	const match = /^(?:"((?:[^"\\]|\\.)+)"|'([^']+)'|([A-Za-z0-9_-]+))\s*:\s*(.*)$/u.exec(
		line,
	);
	if (!match) return null;
	const key = match[1] ?? match[2] ?? match[3];
	return key ? { key, value: match[4] ?? '' } : null;
}

function splitFrontmatterLines(content: string): {
	readonly lines: string[];
	readonly lineEnding: '\n' | '\r\n' | '\r';
} {
	const hasCrLf = content.includes('\r\n');
	const withoutCrLf = content.replace(/\r\n/gu, '');
	const hasLf = withoutCrLf.includes('\n');
	const hasCr = withoutCrLf.includes('\r');
	if ([hasCrLf, hasLf, hasCr].filter(Boolean).length > 1) {
		throw new ConservativeWriteError(
			'malformed-markdown',
			'Mixed line endings are outside the safe paper-write subset.',
		);
	}
	const lineEnding = hasCrLf ? '\r\n' : hasCr ? '\r' : '\n';
	return { lines: content.split(lineEnding), lineEnding };
}

function isUnsafeInsertionContextValue(value: string): boolean {
	const trimmed = value.trim();
	if (!trimmed) return true;
	if (['|', '>', '&', '*', '!'].some((prefix) => trimmed.startsWith(prefix))) {
		return true;
	}
	return (
		(trimmed.startsWith('"') && !trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && !trimmed.endsWith("'"))
	);
}

function scalarReplacement(
	content: string,
	field: string,
	value: string,
	acceptedCurrentValue: RegExp,
	expectedCurrentValue: string | null,
	paper: PaperIdentity,
): { readonly content: string; readonly before: string; readonly after: string } {
	if (
		!/^[A-Za-z][A-Za-z0-9_-]{0,119}$/u.test(field) ||
		!/^[A-Za-z][A-Za-z0-9_-]{0,119}$/u.test(paper.field) ||
		!paper.value.trim()
	) {
		throw new ConservativeWriteError('invalid-request', 'Paper field is invalid.');
	}
	const { lines, lineEnding } = splitFrontmatterLines(content);
	if (lines[0]?.trim() !== '---') {
		throw new ConservativeWriteError('malformed-frontmatter', 'Frontmatter is missing.');
	}
	const end = lines.slice(1).findIndex((line) => line.trim() === '---');
	if (end < 0) {
		throw new ConservativeWriteError('malformed-frontmatter', 'Frontmatter is unclosed.');
	}
	const closingIndex = end + 1;
	const seen = new Set<string>();
	let targetIndex = -1;
	let targetCurrentValue: string | null = null;
	let paperIdentityMatches = false;
	let insertionContextIsSafe = true;
	for (let index = 1; index < closingIndex; index += 1) {
		const line = lines[index] ?? '';
		if (!line.trim() || /^\s*#/u.test(line)) continue;
		if (/^\s/u.test(line)) {
			throw new ConservativeWriteError(
				'unsupported-value',
				'Nested or multiline frontmatter is outside the safe write subset.',
			);
		}
		const property = parseFrontmatterKey(line);
		if (!property) {
			throw new ConservativeWriteError('malformed-frontmatter', 'Unsupported YAML structure.');
		}
		if (seen.has(property.key)) {
			throw new ConservativeWriteError('target-ambiguous', 'Duplicate frontmatter field.');
		}
		seen.add(property.key);
		if (isUnsafeInsertionContextValue(property.value)) {
			insertionContextIsSafe = false;
		}
		if (property.key === field) {
			targetIndex = index;
			if (
				!acceptedCurrentValue.test(property.value) ||
				['|', '>', '{', '[', '&', '*', '!'].some((prefix) =>
					property.value.startsWith(prefix),
				) ||
				property.value.includes(' #')
			) {
				throw new ConservativeWriteError(
					'unsupported-value',
					'Paper field must contain one supported scalar.',
				);
			}
			targetCurrentValue = property.value.replace(/^(?:"([^"]*)"|'([^']*)')$/u, '$1$2');
		}
		if (property.key === paper.field) {
			const identity = property.value.replace(/^(?:"([^"]*)"|'([^']*)')$/u, '$1$2');
			paperIdentityMatches = identity === paper.value;
		}
	}
	if (!paperIdentityMatches) {
		throw new ConservativeWriteError('conflict', 'The target is no longer the selected paper.');
	}
	if (targetIndex < 0) {
		if (expectedCurrentValue !== null) {
			throw new ConservativeWriteError('conflict', 'Paper field changed after the list loaded.');
		}
		if (!insertionContextIsSafe) {
			throw new ConservativeWriteError(
				'unsupported-value',
				'Paper field insertion requires structurally safe existing frontmatter.',
			);
		}
		const after = `${field}: ${value}`;
		lines.splice(closingIndex, 0, after);
		return {
			content: lines.join(lineEnding),
			before: '(missing)',
			after,
		};
	}
	if (expectedCurrentValue === null || targetCurrentValue !== expectedCurrentValue) {
		throw new ConservativeWriteError('conflict', 'Paper field changed after the list loaded.');
	}
	const before = lines[targetIndex]!;
	const prefix = before.slice(0, before.indexOf(':') + 1);
	const after = `${prefix} ${value}`;
	if (before === after) {
		throw new ConservativeWriteError('invalid-request', 'Paper field is unchanged.');
	}
	lines[targetIndex] = after;
	return { content: lines.join(lineEnding), before, after };
}

function transformEdit(
	content: string,
	request: ConservativeEditRequest,
): { readonly content: string; readonly before: string; readonly after: string } {
	switch (request.operation) {
		case 'task-toggle':
			return checkedLineTransform(content, request.line, request.completed);
		case 'review-date':
			return reviewLineTransform(content, request.line, request.nextReviewDate);
		case 'paper-status':
			if (!PAPER_STATUSES.includes(request.value)) {
				throw new ConservativeWriteError('unsupported-value', 'Paper status is unsupported.');
			}
			return scalarReplacement(
				content,
				request.field,
				request.value,
				/^(?:unread|reading|reviewed|"(?:unread|reading|reviewed)"|'(?:unread|reading|reviewed)')$/u,
				request.expectedValue,
				request.paper,
			);
		case 'paper-favorite':
			return scalarReplacement(
				content,
				request.field,
				request.value ? 'true' : 'false',
				/^(?:true|false|"(?:true|false)"|'(?:true|false)')$/u,
				request.expectedValue === null ? null : request.expectedValue ? 'true' : 'false',
				request.paper,
			);
	}
}

function parentFolder(path: string): string {
	return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
}

export class ConservativeWriteService {
	private readonly undoStates = new Map<string, SessionUndoState>();
	private readonly preparedPreviews = new WeakSet<object>();
	private undoSequence = 0;
	private readonly now: () => Date;

	constructor(
		private readonly port: ConservativeWritePort,
		private readonly options: ConservativeWriteServiceOptions = {},
	) {
		this.now = options.now ?? (() => new Date());
	}

	async prepareEdit(request: ConservativeEditRequest): Promise<EditWritePreview> {
		this.assertPath(request.path);
		const beforeContent = await this.port.read(request.path);
		if (beforeContent === null) {
			throw new ConservativeWriteError('target-missing', 'Target note is unavailable.');
		}
		const transformed = transformEdit(beforeContent, request);
		const preview: EditWritePreview = Object.freeze({
			kind: 'edit',
			operation: request.operation,
			path: request.path,
			beforeFingerprint: fingerprintContent(beforeContent),
			afterFingerprint: fingerprintContent(transformed.content),
			beforeContent,
			afterContent: transformed.content,
			preview: Object.freeze({
				before: boundedPreview(transformed.before),
				after: boundedPreview(transformed.after),
			}),
		});
		this.preparedPreviews.add(preview);
		return preview;
	}

	async prepareCreation(request: CreationRequest): Promise<CreationWritePreview> {
		this.assertPath(request.path);
		if (
			typeof request.content !== 'string' ||
			!request.content.length ||
			request.content.length > MAX_CREATE_CONTENT_LENGTH
		) {
			throw new ConservativeWriteError('invalid-request', 'Creation content is invalid.');
		}
		if ((await this.port.read(request.path)) !== null) {
			throw new ConservativeWriteError('target-exists', 'Destination already exists.');
		}
		const preview: CreationWritePreview = Object.freeze({
			kind: 'create',
			operation: request.operation,
			path: request.path,
			beforeFingerprint: 'absent',
			afterFingerprint: fingerprintContent(request.content),
			content: request.content,
			preview: Object.freeze({
				before: '(new note)',
				after: boundedPreview(request.content),
			}),
		});
		this.preparedPreviews.add(preview);
		return preview;
	}

	async commit(preview: ConservativeWritePreview): Promise<ConservativeWriteCommitResult> {
		if (!this.preparedPreviews.has(preview)) {
			throw new ConservativeWriteError(
				'invalid-request',
				'Commit requires the unchanged preview produced by this session.',
			);
		}
		this.assertPath(preview.path);
		try {
			if (preview.kind === 'create') return await this.commitCreation(preview);
			const current = await this.port.read(preview.path);
			if (
				current === null ||
				current !== preview.beforeContent ||
				fingerprintContent(current) !== preview.beforeFingerprint
			) {
				throw new ConservativeWriteError('conflict', 'Target changed after preview.');
			}
			const outcome = await this.port.compareAndSwap(
				preview.path,
				preview.beforeContent,
				preview.afterContent,
			);
			if (outcome !== 'written') {
				throw new ConservativeWriteError(
					outcome === 'conflict' ? 'conflict' : 'target-missing',
					'Target changed before commit.',
				);
			}
			if ((await this.port.read(preview.path)) !== preview.afterContent) {
				throw new ConservativeWriteError(
					'postcondition-failed',
					'Written state could not be verified.',
				);
			}
			const undoToken = `session-${++this.undoSequence}`;
			this.undoStates.set(undoToken, Object.freeze({
				operation: preview.operation,
				path: preview.path,
				beforeContent: preview.beforeContent,
				afterContent: preview.afterContent,
			}));
			this.log(preview.operation, preview.path, 'committed');
			return Object.freeze({
				operation: preview.operation,
				path: preview.path,
				outcome: 'committed',
				undoToken,
			});
		} catch (error) {
			this.logFailure(preview.operation, preview.path, error);
			throw error;
		}
	}

	async undo(token: string): Promise<ConservativeUndoResult> {
		const state = this.undoStates.get(token);
		if (!state) {
			throw new ConservativeWriteError('undo-unavailable', 'Undo is unavailable.');
		}
		try {
			const current = await this.port.read(state.path);
			if (current !== state.afterContent) {
				throw new ConservativeWriteError('conflict', 'Target changed after Dashboard write.');
			}
			const outcome = await this.port.compareAndSwap(
				state.path,
				state.afterContent,
				state.beforeContent,
			);
			if (outcome !== 'written') {
				throw new ConservativeWriteError('conflict', 'Target changed before Undo.');
			}
			this.undoStates.delete(token);
			this.log(state.operation, state.path, 'undone');
			return Object.freeze({
				operation: state.operation,
				path: state.path,
				outcome: 'undone',
			});
		} catch (error) {
			this.logFailure(state.operation, state.path, error);
			throw error;
		}
	}

	clearUndoHistory(): void {
		this.undoStates.clear();
	}

	private async commitCreation(
		preview: CreationWritePreview,
	): Promise<ConservativeWriteCommitResult> {
		if ((await this.port.read(preview.path)) !== null) {
			throw new ConservativeWriteError('target-exists', 'Destination appeared after preview.');
		}
		const folder = parentFolder(preview.path);
		if (folder) await this.port.ensureFolder(folder);
		if ((await this.port.read(preview.path)) !== null) {
			throw new ConservativeWriteError('target-exists', 'Destination appeared during preparation.');
		}
		const outcome = await this.port.createExclusive(preview.path, preview.content);
		if (outcome !== 'created') {
			throw new ConservativeWriteError('target-exists', 'Destination was not overwritten.');
		}
		if ((await this.port.read(preview.path)) !== preview.content) {
			throw new ConservativeWriteError(
				'postcondition-failed',
				'Created state could not be verified.',
			);
		}
		this.log(preview.operation, preview.path, 'committed');
		return Object.freeze({
			operation: preview.operation,
			path: preview.path,
			outcome: 'committed',
		});
	}

	private assertPath(path: string): void {
		if (!isSafeWritePath(path)) {
			throw new ConservativeWriteError('invalid-path', 'Expected a safe Vault-relative Markdown path.');
		}
	}

	private log(
		operation: LocalWriteOperationType,
		path: string,
		outcome: LocalWriteLogOutcome,
		errorCode?: LocalWriteErrorCode,
	): void {
		this.options.log?.(Object.freeze({
			timestamp: this.now().toISOString(),
			operation,
			path,
			outcome,
			...(errorCode ? { errorCode } : {}),
		}));
	}

	private logFailure(
		operation: LocalWriteOperationType,
		path: string,
		error: unknown,
	): void {
		const code = error instanceof ConservativeWriteError ? error.code : 'write-failed';
		this.log(operation, path, code === 'conflict' ? 'conflict' : 'rejected', code);
	}
}
