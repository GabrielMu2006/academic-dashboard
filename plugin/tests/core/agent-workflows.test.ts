import { describe, expect, it } from 'vitest';
import {
	AGENT_WORKFLOWS,
	getAgentWorkflow,
	isAgentTarget,
	isAgentWorkflowId,
} from '../../src/core/agent-workflows';

describe('Agent workflow contracts', () => {
	it('publishes the approved workflows including bounded Daily Note routing', () => {
		expect(AGENT_WORKFLOWS.map(({ id }) => id)).toEqual([
			'organize-current-note',
			'summarize-current-note',
			'repair-current-note-markdown',
			'answer-from-vault',
			'organize-daily-note-into-academic-notes',
			'create-course-note',
			'create-paper-reading-note',
		]);
	});

	it('marks read-only and proposed-write boundaries explicitly', () => {
		expect(getAgentWorkflow('summarize-current-note')).toMatchObject({
			access: 'read-only',
			scope: 'current-note',
		});
		expect(getAgentWorkflow('answer-from-vault')).toMatchObject({
			access: 'read-only',
			scope: 'vault',
		});
		expect(getAgentWorkflow('organize-daily-note-into-academic-notes')).toMatchObject({
			access: 'proposed-write',
			scope: 'daily-note',
		});
		expect(getAgentWorkflow('organize-current-note')).toMatchObject({
			access: 'proposed-write',
			scope: 'current-note',
		});
		expect(getAgentWorkflow('create-course-note')).toMatchObject({
			access: 'proposed-write',
			scope: 'new-note',
		});
	});

	it('accepts only the two V1 targets and approved workflow IDs', () => {
		expect(isAgentTarget('codex')).toBe(true);
		expect(isAgentTarget('opencode')).toBe(true);
		expect(isAgentTarget('claude')).toBe(false);
		expect(isAgentWorkflowId('answer-from-vault')).toBe(true);
		expect(isAgentWorkflowId('delete-vault')).toBe(false);
	});
});
