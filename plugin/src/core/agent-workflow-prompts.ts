import {
	getAgentWorkflow,
	type AgentWorkflowDefinition,
} from './agent-workflows';
import type { AgentWorkflowRequest } from './claudian';
import { validateMetadataSettings } from './metadata-settings';
import { isSafeVaultRelativePath } from './template-settings';

const MAX_USER_INPUT_LENGTH = 2_000;

export class AgentWorkflowValidationError extends Error {
	constructor(readonly code: string, message: string) {
		super(message);
		this.name = 'AgentWorkflowValidationError';
	}
}

function normalizedInput(value: string | undefined): string {
	return value?.trim().slice(0, MAX_USER_INPUT_LENGTH) ?? '';
}

function requireCurrentNote(request: AgentWorkflowRequest): string {
	if (!isSafeVaultRelativePath(request.currentNotePath, { markdownFile: true })) {
		throw new AgentWorkflowValidationError(
			'current_note_required',
			'This workflow requires a visible Vault-relative Markdown note.',
		);
	}
	return request.currentNotePath.trim();
}

function requireDailyNote(request: AgentWorkflowRequest): string {
	if (!isSafeVaultRelativePath(request.currentNotePath, { markdownFile: true })) {
		throw new AgentWorkflowValidationError(
			'daily_note_required',
			'This workflow requires today’s configured Daily Note.',
		);
	}
	return request.currentNotePath.trim();
}

function academicRoutingInstruction(
	request: AgentWorkflowRequest,
): readonly string[] {
	const metadata = validateMetadataSettings(request.academicMetadata);
	if (!metadata.ok) {
		throw new AgentWorkflowValidationError(
			'academic_metadata_required',
			'This workflow requires valid academic metadata mappings.',
		);
	}
	const { fields, values } = metadata.value;
	return [
		`Read today’s Daily Note at "${requireDailyNote(request)}" as the only source note.`,
		`Treat an existing note as a course-note candidate only when frontmatter field "${fields.noteType}" equals "${values.courseNoteType}"; use "${fields.course}" and "${fields.term}" plus links, headings, and names as matching evidence.`,
		`Treat an existing note as a paper-note candidate only when frontmatter field "${fields.noteType}" equals "${values.paperType}"; use "${fields.title}", "${fields.authors}", and "${fields.doi}" plus links and names as matching evidence.`,
		'Break the source into coherent captured blocks. Route a block only when exactly one existing course or paper note is a confident match.',
		'Before changing anything, show a routing table with the source heading or excerpt, the exact target Vault-relative path, the reason for the match, and the proposed append-only Markdown.',
		'Put ambiguous or unmatched blocks in an Unmatched section and leave them unchanged. Never guess between multiple plausible targets.',
		'After explicit approval, append under a "Daily Note Inbox" section in each approved existing target and include a link back to the source Daily Note. Preserve the source Daily Note unchanged and avoid duplicate imports.',
		'Do not create target notes. Do not change frontmatter. Do not touch more than 10 target notes in one run.',
		...optionalFocus(request),
	];
}

function requireUserInput(request: AgentWorkflowRequest, message: string): string {
	const input = normalizedInput(request.userInput);
	if (!input) {
		throw new AgentWorkflowValidationError('user_input_required', message);
	}
	return input;
}

function optionalSafePath(
	value: string | undefined,
	options: { readonly markdownFile?: boolean } = {},
): string | null {
	if (!value?.trim()) return null;
	if (!isSafeVaultRelativePath(value, options)) {
		throw new AgentWorkflowValidationError(
			'invalid_vault_path',
			'Workflow paths must stay in visible Vault content.',
		);
	}
	return value.trim().replace(/\/$/, '');
}

function workflowInstruction(
	workflow: AgentWorkflowDefinition,
	request: AgentWorkflowRequest,
): readonly string[] {
	switch (workflow.id) {
		case 'organize-current-note':
			return [
				`Inspect only the current note at "${requireCurrentNote(request)}".`,
				'Propose a polished structure that preserves meaning, links, embeds, frontmatter, and factual content.',
				...optionalFocus(request),
			];
		case 'summarize-current-note':
			return [
				`Read the current note at "${requireCurrentNote(request)}".`,
				'Return a concise summary in chat. Do not modify any file.',
				...optionalFocus(request),
			];
		case 'repair-current-note-markdown':
			return [
				`Inspect only the current note at "${requireCurrentNote(request)}".`,
				'Propose the smallest repair for broken Markdown while preserving frontmatter, links, embeds, and content.',
				...optionalFocus(request),
			];
		case 'answer-from-vault':
			return [
				'Search visible Markdown notes across the current Vault and answer this question:',
				`<question>\n${requireUserInput(request, 'Enter a Vault question.')}\n</question>`,
				'Cite the Vault-relative note paths used. Do not modify any file.',
			];
		case 'organize-daily-note-into-academic-notes':
			return academicRoutingInstruction(request);
		case 'create-course-note':
			return creationInstruction('course note', request);
		case 'create-paper-reading-note':
			return creationInstruction('paper-reading note', request);
	}
}

function optionalFocus(request: AgentWorkflowRequest): readonly string[] {
	const focus = normalizedInput(request.userInput);
	return focus ? [`<user-focus>\n${focus}\n</user-focus>`] : [];
}

function creationInstruction(
	kind: 'course note' | 'paper-reading note',
	request: AgentWorkflowRequest,
): readonly string[] {
	const title = requireUserInput(request, `Enter a title for the ${kind}.`);
	const templatePath = optionalSafePath(request.templatePath, { markdownFile: true });
	const destination = optionalSafePath(request.requestedDestination);
	return [
		`Prepare exactly one new ${kind} titled:`,
		`<title>\n${title}\n</title>`,
		...(templatePath ? [`Use the existing template at "${templatePath}".`] : []),
		...(destination ? [`The requested destination folder is "${destination}".`] : []),
		'Do not overwrite an existing note. Present the proposed path and content for review before creating it.',
	];
}

export function buildAgentWorkflowPrompt(request: AgentWorkflowRequest): string {
	const workflow = getAgentWorkflow(request.workflowId);
	const isDailyRouting = workflow.id === 'organize-daily-note-into-academic-notes';
	const lines = [
		'[Academic Dashboard workflow handoff]',
		`Requested Claudian target: ${request.target === 'codex' ? 'Codex' : 'OpenCode'}.`,
		`Workflow: ${workflow.title}.`,
		`Declared access: ${workflow.access}. Scope: ${workflow.scope}.`,
		'',
		...workflowInstruction(workflow, request),
		'',
		'Safety boundary: work only inside visible Vault Markdown content. Do not delete, move, or reorganize files; do not modify the Vault configuration folder or hidden paths; do not run shell/Git commands; do not use the network.',
		...(isDailyRouting
			? ['The user requested this bounded multi-note routing only. No other bulk edit is authorized. Keep every proposed target explicit and independently reviewable.']
			: ['Do not bulk-edit files.']),
		...(workflow.access === 'proposed-write'
			? ['This is a proposed write. Show a plan or diff and wait for explicit user approval in Claudian before applying any change.']
			: ['This is read-only. Return the result in Claudian chat and make no file changes.']),
		'If the active Claudian target does not match the requested target above, stop and ask the user to switch it before continuing.',
	];
	return lines.join('\n');
}
