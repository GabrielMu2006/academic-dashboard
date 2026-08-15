import { isAgentTarget, type AgentTarget } from './agent-workflows';
import {
	isRecord,
	validationFailure,
	validationIssue,
	validationSuccess,
	type ValidationIssue,
	type ValidationResult,
} from './validation';

export const DEFAULT_AGENT_WRITE_LOG_RETENTION_DAYS = 30;
export const MIN_AGENT_WRITE_LOG_RETENTION_DAYS = 1;
export const MAX_AGENT_WRITE_LOG_RETENTION_DAYS = 3650;

export interface AgentSettings {
	readonly selectedTarget: AgentTarget;
	readonly writeLogRetentionDays: number;
}

export const DEFAULT_AGENT_SETTINGS: AgentSettings = Object.freeze({
	selectedTarget: 'codex',
	writeLogRetentionDays: DEFAULT_AGENT_WRITE_LOG_RETENTION_DAYS,
});

export function validateAgentSettings(
	input: unknown,
): ValidationResult<AgentSettings> {
	if (!isRecord(input)) {
		return validationFailure([
			validationIssue(
				'invalid_agent_settings',
				'settings.agent',
				'Expected Agent settings.',
			),
		]);
	}

	const issues: ValidationIssue[] = [];
	if (!isAgentTarget(input.selectedTarget)) {
		issues.push(
			validationIssue(
				'invalid_agent_target',
				'settings.agent.selectedTarget',
				'Expected Codex or OpenCode.',
			),
		);
	}
	if (
		typeof input.writeLogRetentionDays !== 'number' ||
		!Number.isInteger(input.writeLogRetentionDays) ||
		input.writeLogRetentionDays < MIN_AGENT_WRITE_LOG_RETENTION_DAYS ||
		input.writeLogRetentionDays > MAX_AGENT_WRITE_LOG_RETENTION_DAYS
	) {
		issues.push(
			validationIssue(
				'invalid_agent_log_retention',
				'settings.agent.writeLogRetentionDays',
				`Expected an integer from ${MIN_AGENT_WRITE_LOG_RETENTION_DAYS} to ${MAX_AGENT_WRITE_LOG_RETENTION_DAYS}.`,
			),
		);
	}

	if (issues.length > 0) return validationFailure(issues);
	return validationSuccess(
		Object.freeze({
			selectedTarget: input.selectedTarget as AgentTarget,
			writeLogRetentionDays: input.writeLogRetentionDays as number,
		}),
	);
}
