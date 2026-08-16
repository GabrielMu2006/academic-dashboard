import {
	isAgentTarget,
	isAgentWorkflowId,
	getAgentWorkflow,
	type AgentTarget,
	type AgentWorkflowId,
} from './agent-workflows';
import type {
	AgentWorkflowRequest,
	ClaudianHandoffResult,
} from './claudian';
import { isSafeVaultRelativePath } from './template-settings';
import {
	isRecord,
	validationFailure,
	validationIssue,
	validationSuccess,
	type ValidationIssue,
	type ValidationResult,
} from './validation';

export const AGENT_WRITE_LOG_OUTCOMES = [
	'prepared-for-review',
	'prepared-to-send',
	'opened-without-prefill',
	'handoff-failed',
] as const;

export type AgentWriteLogOutcome = (typeof AGENT_WRITE_LOG_OUTCOMES)[number];

export interface AgentWriteLogEntry {
	readonly timestamp: string;
	readonly workflowId: AgentWorkflowId;
	readonly target: AgentTarget;
	readonly affectedPaths: readonly string[];
	readonly outcome: AgentWriteLogOutcome;
	readonly errorCode?: string;
}

const MAX_LOG_ENTRIES = 2_000;
const MAX_AFFECTED_PATHS = 20;
const ERROR_CODE_PATTERN = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/;

function validateEntry(
	input: unknown,
	path: string,
	issues: ValidationIssue[],
): AgentWriteLogEntry | null {
	if (!isRecord(input)) {
		issues.push(validationIssue('invalid_agent_write_log_entry', path, 'Expected a write-log entry.'));
		return null;
	}
	const timestamp = typeof input.timestamp === 'string' ? input.timestamp : '';
	if (!timestamp || !Number.isFinite(Date.parse(timestamp))) {
		issues.push(validationIssue('invalid_agent_write_log_timestamp', `${path}.timestamp`, 'Expected an ISO timestamp.'));
	}
	if (!isAgentWorkflowId(input.workflowId)) {
		issues.push(validationIssue('invalid_agent_write_log_workflow', `${path}.workflowId`, 'Expected an approved workflow.'));
	}
	if (!isAgentTarget(input.target)) {
		issues.push(validationIssue('invalid_agent_write_log_target', `${path}.target`, 'Expected Codex or OpenCode.'));
	}
	if (
		!Array.isArray(input.affectedPaths) ||
		input.affectedPaths.length > MAX_AFFECTED_PATHS ||
		input.affectedPaths.some((candidate) => !isSafeVaultRelativePath(candidate))
	) {
		issues.push(validationIssue('invalid_agent_write_log_paths', `${path}.affectedPaths`, 'Expected bounded visible Vault-relative paths.'));
	}
	if (!AGENT_WRITE_LOG_OUTCOMES.includes(input.outcome as AgentWriteLogOutcome)) {
		issues.push(validationIssue('invalid_agent_write_log_outcome', `${path}.outcome`, 'Expected a supported handoff outcome.'));
	}
	if (
		input.errorCode !== undefined &&
		(typeof input.errorCode !== 'string' ||
			input.errorCode.length > 80 ||
			!ERROR_CODE_PATTERN.test(input.errorCode))
	) {
		issues.push(validationIssue('invalid_agent_write_log_error', `${path}.errorCode`, 'Expected a bounded non-sensitive error code.'));
	}
	if (issues.some((issue) => issue.path === path || issue.path.startsWith(`${path}.`))) {
		return null;
	}
	return Object.freeze({
		timestamp: new Date(timestamp).toISOString(),
		workflowId: input.workflowId as AgentWorkflowId,
		target: input.target as AgentTarget,
		affectedPaths: Object.freeze([...(input.affectedPaths as string[])]),
		outcome: input.outcome as AgentWriteLogOutcome,
		...(typeof input.errorCode === 'string' ? { errorCode: input.errorCode } : {}),
	});
}

export function validateAgentWriteLog(
	input: unknown,
): ValidationResult<readonly AgentWriteLogEntry[]> {
	if (!Array.isArray(input) || input.length > MAX_LOG_ENTRIES) {
		return validationFailure([
			validationIssue(
				'invalid_agent_write_log',
				'settings.agentWriteLog',
				'Expected a bounded Agent write-log array.',
			),
		]);
	}
	const issues: ValidationIssue[] = [];
	const entries = input.map((entry, index) =>
		validateEntry(entry, `settings.agentWriteLog.${index}`, issues));
	if (issues.length > 0 || entries.some((entry) => entry === null)) {
		return validationFailure(issues);
	}
	return validationSuccess(
		Object.freeze(entries as readonly AgentWriteLogEntry[]),
	);
}

export function cleanExpiredAgentWriteLog(
	entries: readonly AgentWriteLogEntry[],
	now: Date,
	retentionDays: number,
): readonly AgentWriteLogEntry[] {
	const cutoff = now.getTime() - retentionDays * 86_400_000;
	return Object.freeze(
		entries.filter((entry) => Date.parse(entry.timestamp) >= cutoff),
	);
}

export function agentWriteLogEntryForHandoff(
	request: AgentWorkflowRequest,
	result: ClaudianHandoffResult,
	now: Date,
): AgentWriteLogEntry | null {
	if (getAgentWorkflow(request.workflowId).access === 'read-only') return null;
	const affectedPaths = [
		request.currentNotePath,
		request.resolvedNotePath ?? request.requestedDestination,
	].filter((path): path is string => Boolean(path));
	const candidate = {
		timestamp: now.toISOString(),
		workflowId: request.workflowId,
		target: request.target,
		affectedPaths,
		outcome: result.status === 'ready-for-review'
			? 'prepared-for-review'
			: result.status === 'ready-to-send'
				? 'prepared-to-send'
			: result.status === 'opened-without-prefill'
					? 'opened-without-prefill'
					: 'handoff-failed',
		...(result.errorCode ? { errorCode: result.errorCode } : {}),
	};
	const validated = validateAgentWriteLog([candidate]);
	return validated.ok ? validated.value[0] ?? null : null;
}
