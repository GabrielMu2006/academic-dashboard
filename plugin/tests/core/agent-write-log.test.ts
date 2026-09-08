import { describe, expect, it } from 'vitest';
import {
	agentWriteLogEntryForHandoff,
	cleanExpiredAgentWriteLog,
	validateAgentWriteLog,
} from '../../src/core/agent-write-log';

describe('Agent write log', () => {
	it('keeps only minimal attributable metadata', () => {
		const result = validateAgentWriteLog([{
			timestamp: '2026-08-12T00:00:00.000Z',
			workflowId: 'organize-current-note',
			target: 'codex',
			affectedPaths: ['Course/Week 1.md'],
			outcome: 'prepared-for-review',
			prompt: 'private note contents',
			apiKey: 'secret',
		}]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).toEqual([{
				timestamp: '2026-08-12T00:00:00.000Z',
				workflowId: 'organize-current-note',
				target: 'codex',
				affectedPaths: ['Course/Week 1.md'],
				outcome: 'prepared-for-review',
			}]);
			expect(JSON.stringify(result.value)).not.toContain('private note contents');
			expect(JSON.stringify(result.value)).not.toContain('secret');
		}
	});

	it('rejects hidden/traversing paths and free-form error messages', () => {
		const result = validateAgentWriteLog([{
			timestamp: '2026-08-12T00:00:00.000Z',
			workflowId: 'repair-current-note-markdown',
			target: 'opencode',
			affectedPaths: ['../outside.md'],
			outcome: 'handoff-failed',
			errorCode: 'full error with secret detail',
		}]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues.map(({ code }) => code)).toContain(
				'invalid_agent_write_log_paths',
			);
			expect(result.issues.map(({ code }) => code)).toContain(
				'invalid_agent_write_log_error',
			);
		}
	});

	it('cleans entries older than the configured retention', () => {
		const result = validateAgentWriteLog([
			{
				timestamp: '2026-07-12T00:00:00.000Z',
				workflowId: 'create-course-note',
				target: 'codex',
				affectedPaths: ['Courses'],
				outcome: 'prepared-for-review',
			},
			{
				timestamp: '2026-07-14T00:00:00.000Z',
				workflowId: 'create-paper-reading-note',
				target: 'opencode',
				affectedPaths: ['Papers'],
				outcome: 'handoff-failed',
			},
		]);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(
			cleanExpiredAgentWriteLog(
				result.value,
				new Date('2026-08-12T00:00:00.000Z'),
				30,
			),
		).toEqual([result.value[1]]);
	});

	it('retains an entry exactly on the retention cutoff', () => {
		const result = validateAgentWriteLog([
			{
				timestamp: '2026-07-13T00:00:00.000Z',
				workflowId: 'create-course-note',
				target: 'codex',
				affectedPaths: ['Courses'],
				outcome: 'prepared-for-review',
			},
		]);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(
			cleanExpiredAgentWriteLog(
				result.value,
				new Date('2026-08-12T00:00:00.000Z'),
				30,
			),
		).toEqual(result.value);
	});

	it('logs every request with minimal evidence state and bounded context size', () => {
		const now = new Date('2026-08-12T00:00:00.000Z');
		const readOnly = agentWriteLogEntryForHandoff(
			{
				workflowId: 'summarize-current-note',
				target: 'codex',
				currentNotePath: 'Course/Week 1.md',
			},
			{
				status: 'ready-for-review',
				target: 'codex',
				workflowId: 'summarize-current-note',
				message: 'Prepared.',
				requiresTargetConfirmation: true,
			},
			now,
		);
		expect(readOnly).toEqual(expect.objectContaining({
			workflowId: 'summarize-current-note',
			affectedPaths: ['Course/Week 1.md'],
			outcome: 'prefilled-awaiting-user-send',
		}));
		expect(typeof readOnly?.contextCharacters).toBe('number');

		const direct = agentWriteLogEntryForHandoff(
			{
				workflowId: 'repair-current-note-markdown',
				target: 'opencode',
				currentNotePath: 'Course/Week 1.md',
			},
			{
				status: 'failed',
				target: 'opencode',
				workflowId: 'repair-current-note-markdown',
				message: 'Not logged.',
				requiresTargetConfirmation: true,
				errorCode: 'handoff-failed',
			},
			now,
		);
		expect(direct).toEqual(expect.objectContaining({
			timestamp: '2026-08-12T00:00:00.000Z',
			workflowId: 'repair-current-note-markdown',
			target: 'opencode',
			affectedPaths: ['Course/Week 1.md'],
			outcome: 'handoff-failed',
			errorCode: 'handoff-failed',
		}));

		expect(agentWriteLogEntryForHandoff(
			{
				workflowId: 'create-book-reading-note',
				target: 'codex',
				userInput: 'Book',
				requestedDestination: 'Reading',
				resolvedNotePath: 'Reading/Book/Book.md',
			},
			{
				status: 'ready-to-send',
				target: 'codex',
				workflowId: 'create-book-reading-note',
				message: 'Prepared.',
				requiresTargetConfirmation: true,
			},
			now,
		)).toEqual(expect.objectContaining({
			timestamp: '2026-08-12T00:00:00.000Z',
			workflowId: 'create-book-reading-note',
			target: 'codex',
			affectedPaths: ['Reading/Book/Book.md'],
			outcome: 'prefilled-awaiting-user-send',
		}));
		expect(typeof direct?.contextCharacters).toBe('number');
	});

	it('accepts a user-complete marker while rejecting unbounded context metadata', () => {
		expect(validateAgentWriteLog([{
			timestamp: '2026-08-12T00:00:00.000Z', workflowId: 'summarize-current-note', target: 'codex', affectedPaths: [], outcome: 'user-marked-complete', contextCharacters: 900,
		}]).ok).toBe(true);
		const invalid = validateAgentWriteLog([{
			timestamp: '2026-08-12T00:00:00.000Z', workflowId: 'summarize-current-note', target: 'codex', affectedPaths: [], outcome: 'prefilled-awaiting-user-send', contextCharacters: 100_001,
		}]);
		expect(invalid.ok).toBe(false);
	});
});
