import {
	LOCAL_WRITE_ERROR_CODES,
	LOCAL_WRITE_OPERATION_TYPES,
	type LocalWriteErrorCode,
	type LocalWriteLogEvent,
	type LocalWriteLogOutcome,
	type LocalWriteOperationType,
} from './conservative-writes';
import { isSafeVaultRelativePath } from './template-settings';
import {
	isRecord,
	validationFailure,
	validationIssue,
	validationSuccess,
	type ValidationIssue,
	type ValidationResult,
} from './validation';

const OUTCOMES = ['committed', 'undone', 'rejected', 'conflict'] as const;
const MAX_LOG_ENTRIES = 2_000;

export function validateLocalWriteLog(
	input: unknown,
): ValidationResult<readonly LocalWriteLogEvent[]> {
	if (!Array.isArray(input) || input.length > MAX_LOG_ENTRIES) {
		return validationFailure([
			validationIssue(
				'invalid_local_write_log',
				'settings.localWriteLog',
				'Expected a bounded local write log.',
			),
		]);
	}
	const issues: ValidationIssue[] = [];
	const entries: LocalWriteLogEvent[] = [];
	for (const [index, candidate] of input.entries()) {
		const path = `settings.localWriteLog.${index}`;
		if (!isRecord(candidate)) {
			issues.push(validationIssue('invalid_local_write_log_entry', path, 'Expected a log entry.'));
			continue;
		}
		if (typeof candidate.timestamp !== 'string' || !Number.isFinite(Date.parse(candidate.timestamp))) {
			issues.push(validationIssue('invalid_local_write_log_timestamp', `${path}.timestamp`, 'Expected an ISO timestamp.'));
		}
		if (!LOCAL_WRITE_OPERATION_TYPES.includes(candidate.operation as LocalWriteOperationType)) {
			issues.push(validationIssue('invalid_local_write_log_operation', `${path}.operation`, 'Expected an approved operation.'));
		}
		if (!isSafeVaultRelativePath(candidate.path, { markdownFile: true })) {
			issues.push(validationIssue('invalid_local_write_log_path', `${path}.path`, 'Expected a safe relative Markdown path.'));
		}
		if (!OUTCOMES.includes(candidate.outcome as LocalWriteLogOutcome)) {
			issues.push(validationIssue('invalid_local_write_log_outcome', `${path}.outcome`, 'Expected a finite outcome.'));
		}
		if (
			candidate.errorCode !== undefined &&
			!LOCAL_WRITE_ERROR_CODES.includes(candidate.errorCode as LocalWriteErrorCode)
		) {
			issues.push(validationIssue('invalid_local_write_log_error', `${path}.errorCode`, 'Expected a finite error code.'));
		}
		if (!issues.some((issue) => issue.path === path || issue.path.startsWith(`${path}.`))) {
			entries.push(Object.freeze({
				timestamp: candidate.timestamp as string,
				operation: candidate.operation as LocalWriteOperationType,
				path: candidate.path as string,
				outcome: candidate.outcome as LocalWriteLogOutcome,
				...(candidate.errorCode ? { errorCode: candidate.errorCode as LocalWriteErrorCode } : {}),
			}));
		}
	}
	return issues.length > 0
		? validationFailure(issues)
		: validationSuccess(Object.freeze(entries));
}

export function cleanExpiredLocalWriteLog(
	entries: readonly LocalWriteLogEvent[],
	now: Date,
	retentionDays: number,
): readonly LocalWriteLogEvent[] {
	const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1_000;
	return Object.freeze(entries.filter((entry) => Date.parse(entry.timestamp) >= cutoff));
}
