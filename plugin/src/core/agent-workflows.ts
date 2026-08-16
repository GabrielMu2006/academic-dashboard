export const AGENT_TARGETS = ['codex', 'opencode'] as const;
export type AgentTarget = (typeof AGENT_TARGETS)[number];

export const AGENT_WORKFLOW_IDS = [
	'organize-current-note',
	'summarize-current-note',
	'repair-current-note-markdown',
	'answer-from-vault',
	'organize-daily-note-into-academic-notes',
	'create-course-note',
	'create-paper-reading-note',
	'create-book-reading-note',
] as const;

export type AgentWorkflowId = (typeof AGENT_WORKFLOW_IDS)[number];
export type AgentWorkflowAccess = 'read-only' | 'proposed-write' | 'direct-write';
export type AgentWorkflowScope = 'current-note' | 'daily-note' | 'vault' | 'new-note';

export interface AgentWorkflowDefinition {
	readonly id: AgentWorkflowId;
	readonly title: string;
	readonly description: string;
	readonly access: AgentWorkflowAccess;
	readonly scope: AgentWorkflowScope;
}

export const AGENT_WORKFLOWS: readonly AgentWorkflowDefinition[] = Object.freeze([
	Object.freeze({
		id: 'organize-current-note',
		title: 'Organize and polish current note',
		description: 'Prepare a conservative, reviewable cleanup of the active note.',
		access: 'proposed-write',
		scope: 'current-note',
	}),
	Object.freeze({
		id: 'summarize-current-note',
		title: 'Summarize current note',
		description: 'Read the active note and answer with a concise summary.',
		access: 'read-only',
		scope: 'current-note',
	}),
	Object.freeze({
		id: 'repair-current-note-markdown',
		title: 'Check and repair Markdown',
		description: 'Prepare a narrow Markdown repair for the active note.',
		access: 'proposed-write',
		scope: 'current-note',
	}),
	Object.freeze({
		id: 'answer-from-vault',
		title: 'Search Vault and answer',
		description: 'Search visible Vault notes and answer a focused question.',
		access: 'read-only',
		scope: 'vault',
	}),
	Object.freeze({
		id: 'organize-daily-note-into-academic-notes',
		title: 'Organize today’s note into academic notes',
		description: 'Route today’s captured material into existing course, paper, or book notes.',
		access: 'proposed-write',
		scope: 'daily-note',
	}),
	Object.freeze({
		id: 'create-course-note',
		title: 'Create course note',
		description: 'Create one grouped course note from the configured template.',
		access: 'direct-write',
		scope: 'new-note',
	}),
	Object.freeze({
		id: 'create-paper-reading-note',
		title: 'Create paper-reading note',
		description: 'Create one grouped paper-reading note from the configured template.',
		access: 'direct-write',
		scope: 'new-note',
	}),
	Object.freeze({
		id: 'create-book-reading-note',
		title: 'Create book-reading note',
		description: 'Create one grouped book-reading note from the configured template.',
		access: 'direct-write',
		scope: 'new-note',
	}),
]);

const WORKFLOW_BY_ID = new Map(
	AGENT_WORKFLOWS.map((workflow) => [workflow.id, workflow]),
);

export function isAgentTarget(value: unknown): value is AgentTarget {
	return typeof value === 'string' && AGENT_TARGETS.includes(value as AgentTarget);
}

export function isAgentWorkflowId(value: unknown): value is AgentWorkflowId {
	return (
		typeof value === 'string' &&
		AGENT_WORKFLOW_IDS.includes(value as AgentWorkflowId)
	);
}

export function getAgentWorkflow(
	workflowId: AgentWorkflowId,
): AgentWorkflowDefinition {
	const workflow = WORKFLOW_BY_ID.get(workflowId);
	if (!workflow) throw new Error(`Unknown Agent workflow: ${workflowId}`);
	return workflow;
}
