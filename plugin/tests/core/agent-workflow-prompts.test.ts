import { describe, expect, it } from 'vitest';
import { buildAgentWorkflowPrompt } from '../../src/core/agent-workflow-prompts';
import type { AgentWorkflowRequest } from '../../src/core/claudian';
import { DEFAULT_METADATA_SETTINGS } from '../../src/core/metadata-settings';

const REQUESTS: readonly AgentWorkflowRequest[] = [
	{
		workflowId: 'organize-current-note',
		target: 'codex',
		currentNotePath: 'Course/Week 1.md',
	},
	{
		workflowId: 'summarize-current-note',
		target: 'opencode',
		currentNotePath: 'Course/Week 1.md',
	},
	{
		workflowId: 'repair-current-note-markdown',
		target: 'codex',
		currentNotePath: 'Course/Week 1.md',
	},
	{
		workflowId: 'answer-from-vault',
		target: 'opencode',
		userInput: 'Which notes discuss retrieval practice?',
	},
	{
		workflowId: 'organize-daily-note-into-academic-notes',
		target: 'codex',
		currentNotePath: 'Daily Notes/2026-08-15.md',
		academicMetadata: DEFAULT_METADATA_SETTINGS,
		userInput: 'Leave personal reflections in the Daily Note.',
	},
	{
		workflowId: 'create-course-note',
		target: 'codex',
		userInput: 'Algorithms — Week 3',
		templatePath: 'Templates/Course.md',
		requestedDestination: 'Academic Notes/Courses',
	},
	{
		workflowId: 'create-paper-reading-note',
		target: 'opencode',
		userInput: 'Attention Is All You Need',
		templatePath: 'Templates/Paper.md',
		requestedDestination: 'Academic Notes/Papers',
	},
];

describe('Agent workflow prompts', () => {
	it('builds all approved handoffs with shared safety boundaries', () => {
		for (const request of REQUESTS) {
			const prompt = buildAgentWorkflowPrompt(request);
			expect(prompt).toContain('[Academic Dashboard workflow handoff]');
			expect(prompt).toContain('Do not delete, move, or reorganize files');
			expect(prompt).toContain('do not modify the Vault configuration folder or hidden paths');
			expect(prompt).toContain('do not run shell/Git commands');
			expect(prompt).toContain('do not use the network');
			expect(prompt).toContain('stop and ask the user to switch it');
		}
	});

	it('builds bounded, metadata-aware Daily Note routing', () => {
		const prompt = buildAgentWorkflowPrompt(REQUESTS[4]!);
		expect(prompt).toContain('Daily Notes/2026-08-15.md');
		expect(prompt).toContain('frontmatter field "type" equals "course-note"');
		expect(prompt).toContain('frontmatter field "type" equals "paper"');
		expect(prompt).toContain('show a routing table');
		expect(prompt).toContain('Preserve the source Daily Note unchanged');
		expect(prompt).toContain('Do not touch more than 10 target notes');
		expect(prompt).toContain('No other bulk edit is authorized');
	});

	it('keeps read-only workflows read-only and write workflows review-first', () => {
		expect(buildAgentWorkflowPrompt(REQUESTS[1]!)).toContain(
			'This is read-only. Return the result in Claudian chat and make no file changes.',
		);
		expect(buildAgentWorkflowPrompt(REQUESTS[3]!)).toContain(
			'Cite the Vault-relative note paths used.',
		);
		expect(buildAgentWorkflowPrompt(REQUESTS[0]!)).toContain(
			'Show a plan or diff and wait for explicit user approval in Claudian',
		);
		expect(buildAgentWorkflowPrompt(REQUESTS[5]!)).toContain(
			'Do not overwrite an existing note.',
		);
	});

	it('rejects Daily Note routing without a safe source or metadata mapping', () => {
		expect(() => buildAgentWorkflowPrompt({
			workflowId: 'organize-daily-note-into-academic-notes',
			target: 'codex',
			academicMetadata: DEFAULT_METADATA_SETTINGS,
		})).toThrow('requires today’s configured Daily Note');
		expect(() => buildAgentWorkflowPrompt({
			workflowId: 'organize-daily-note-into-academic-notes',
			target: 'codex',
			currentNotePath: 'Daily Notes/2026-08-15.md',
		})).toThrow('requires valid academic metadata mappings');
	});

	it('rejects missing context, hidden paths, traversal, and absolute paths', () => {
		expect(() =>
			buildAgentWorkflowPrompt({
				workflowId: 'summarize-current-note',
				target: 'codex',
			}),
		).toThrow('requires a visible Vault-relative Markdown note');
		for (const currentNotePath of ['.vault-config/app.json', '../Secret.md', '/tmp/a.md']) {
			expect(() =>
				buildAgentWorkflowPrompt({
					workflowId: 'repair-current-note-markdown',
					target: 'codex',
					currentNotePath,
				}),
			).toThrow();
		}
	});

	it('bounds user input and rejects unsafe creation paths', () => {
		const prompt = buildAgentWorkflowPrompt({
			workflowId: 'answer-from-vault',
			target: 'codex',
			userInput: 'x'.repeat(3_000),
		});
		expect(prompt).not.toContain('x'.repeat(2_001));
		expect(() =>
			buildAgentWorkflowPrompt({
				workflowId: 'create-course-note',
				target: 'codex',
				userInput: 'Course',
				requestedDestination: '../outside',
			}),
		).toThrow('visible Vault content');
	});
});
