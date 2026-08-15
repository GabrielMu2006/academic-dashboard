import { describe, expect, it } from 'vitest';
import {
	DEFAULT_AGENT_SETTINGS,
	validateAgentSettings,
} from '../../src/core/agent-settings';

describe('Agent settings', () => {
	it('defaults to Codex and 30-day write-log retention', () => {
		expect(DEFAULT_AGENT_SETTINGS).toEqual({
			selectedTarget: 'codex',
			writeLogRetentionDays: 30,
		});
	});

	it('accepts OpenCode without provider, model, or auth fields', () => {
		const result = validateAgentSettings({
			selectedTarget: 'opencode',
			writeLogRetentionDays: 90,
			provider: 'deepseek',
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).toEqual({
				selectedTarget: 'opencode',
				writeLogRetentionDays: 90,
			});
		}
	});

	it('rejects unknown targets and unsafe retention values', () => {
		const result = validateAgentSettings({
			selectedTarget: 'claude',
			writeLogRetentionDays: 0,
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues.map(({ code }) => code)).toEqual([
				'invalid_agent_target',
				'invalid_agent_log_retention',
			]);
		}
	});
});
