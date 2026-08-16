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
		requestedDestination: 'Course',
		resolvedNotePath: 'Course/Algorithms — Week 3/Algorithms — Week 3.md',
	},
	{
		workflowId: 'create-paper-reading-note',
		target: 'opencode',
		userInput: 'Attention Is All You Need',
		templatePath: 'Templates/Paper.md',
		requestedDestination: 'Paper',
		resolvedNotePath: 'Paper/Attention Is All You Need/Attention Is All You Need.md',
	},
	{
		workflowId: 'create-book-reading-note',
		target: 'codex',
		userInput: 'Designing Data-Intensive Applications',
		templateContent: '# Designing Data-Intensive Applications\n',
		requestedDestination: 'Reading',
		resolvedNotePath: 'Reading/Designing Data-Intensive Applications/Designing Data-Intensive Applications.md',
	},
];

describe('Agent workflow prompts', () => {
	it('builds all approved handoffs with shared safety boundaries', () => {
		for (const request of REQUESTS) {
			const prompt = buildAgentWorkflowPrompt(request);
			expect(prompt).toContain('[Academic Dashboard workflow handoff]');
			expect(prompt).toMatch(/Do not delete, move,(?: rename, overwrite,)? or (?:otherwise )?reorganize existing files|Do not delete, move, or reorganize files/u);
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
		expect(prompt).toContain('frontmatter field "type" equals "book-note"');
		expect(prompt).toContain('show a routing table');
		expect(prompt).toContain('Preserve the source Daily Note unchanged');
		expect(prompt).toContain('Do not touch more than 10 target notes');
		expect(prompt).toContain('No other bulk edit is authorized');
	});

	it('keeps read-only workflows read-only, existing-note writes review-first, and new notes direct', () => {
		expect(buildAgentWorkflowPrompt(REQUESTS[1]!)).toContain(
			'This is read-only. Return the result in Claudian chat and make no file changes.',
		);
		expect(buildAgentWorkflowPrompt(REQUESTS[3]!)).toContain(
			'Cite the Vault-relative note paths used.',
		);
		expect(buildAgentWorkflowPrompt(REQUESTS[0]!)).toContain(
			'Show a plan or diff and wait for explicit user approval in Claudian',
		);
		for (const request of REQUESTS.slice(5)) {
			const prompt = buildAgentWorkflowPrompt(request);
			expect(prompt).toContain('completed the required recursive path preflight through the Obsidian Vault API');
			expect(prompt).toContain('The one resolved new-note path is');
			expect(prompt).toContain('Do not repeat the directory scan');
			expect(prompt).toContain('request a recursive file listing');
			expect(prompt).toContain('ask for Shell permission');
			expect(prompt).toContain('Do not show another plan or diff');
			expect(prompt).toContain('without requesting another approval');
		}
		expect(buildAgentWorkflowPrompt(REQUESTS[7]!)).toContain(
			'<markdown-template>\n# Designing Data-Intensive Applications',
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
				resolvedNotePath: 'Course/Course/Course.md',
			}),
		).toThrow('visible Vault content');
		expect(() =>
			buildAgentWorkflowPrompt({
				workflowId: 'create-book-reading-note',
				target: 'codex',
				userInput: 'Book',
			}),
		).toThrow('requires a visible Vault-relative destination root');
		expect(() =>
			buildAgentWorkflowPrompt({
				workflowId: 'create-book-reading-note',
				target: 'codex',
				userInput: 'Book',
				requestedDestination: 'Reading',
			}),
		).toThrow('requires a Dashboard-resolved note path');
		expect(() =>
			buildAgentWorkflowPrompt({
				workflowId: 'create-book-reading-note',
				target: 'codex',
				userInput: 'Book',
				requestedDestination: 'Reading',
				resolvedNotePath: 'Paper/Book/Book.md',
			}),
		).toThrow('must stay inside the requested destination');
	});
});
