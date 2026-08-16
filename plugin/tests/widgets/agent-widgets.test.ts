import { describe, expect, it, vi } from 'vitest';
import type {
	AgentWorkflowRequest,
	ClaudianAdapter,
} from '../../src/core/claudian';
import { DEFAULT_METADATA_SETTINGS } from '../../src/core/metadata-settings';
import { WidgetRegistry } from '../../src/core/widget-registry';
import type { WidgetMountContext, WidgetState } from '../../src/core/widgets';
import {
	AgentStatusWidget,
	AgentWorkflowWidget,
	ClaudianEntryWidget,
	registerAgentWidgets,
	type AgentWidgetServices,
} from '../../src/widgets/agent-widgets';

class FakeElement {
	className = '';
	textContent = '';
	type = '';
	title = '';
	value = '';
	placeholder = '';
	disabled = false;
	rows = 0;
	maxLength = 0;
	readonly children: FakeElement[] = [];
	readonly listeners = new Map<string, () => void>();
	readonly attributes = new Map<string, string>();
	focused = false;
	constructor(readonly ownerDocument: FakeDocument) {}
	append(...children: FakeElement[]): void { this.children.push(...children); }
	replaceChildren(...children: FakeElement[]): void {
		this.children.length = 0;
		this.children.push(...children);
	}
	addEventListener(type: string, listener: () => void, options?: AddEventListenerOptions): void {
		this.listeners.set(type, listener);
		options?.signal?.addEventListener('abort', () => this.listeners.delete(type));
	}
	setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
	click(): void { this.listeners.get('click')?.(); }
	change(): void { this.listeners.get('change')?.(); }
	input(): void { this.listeners.get('input')?.(); }
	focus(): void { this.focused = true; }
}

class FakeDocument {
	readonly win = this;
	createEl(): FakeElement { return new FakeElement(this); }
}

function mounted(widgetId = 'agent.prompt') {
	const document = new FakeDocument();
	const content = new FakeElement(document);
	const states: WidgetState[] = [];
	return {
		content,
		states,
		context: {
			widgetId,
			pageId: 'agent',
			size: 'large',
			contentEl: content as unknown as HTMLElement,
			setState: (state: WidgetState) => states.push(state),
		} satisfies WidgetMountContext,
	};
}

function adapter(overrides: Partial<ClaudianAdapter> = {}): ClaudianAdapter {
	return {
		id: 'claudian.workflow-handoff',
		availability: async () => ({
			status: 'available',
			pluginVersion: '2.1.3',
			compatibility: 'verified',
			capabilities: {
				openView: true,
				prefillPrompt: true,
				selectTarget: false,
				executionSignals: false,
			},
		}),
		open: async () => ({ status: 'opened', message: 'Claudian opened.' }),
		handoff: async (request) => ({
			status: 'ready-for-review',
			target: request.target,
			workflowId: request.workflowId,
			message: 'Prepared in Claudian.',
			requiresTargetConfirmation: true,
		}),
		...overrides,
	};
}

function services(overrides: Partial<AgentWidgetServices> = {}): AgentWidgetServices {
	let agent = { selectedTarget: 'codex' as const, writeLogRetentionDays: 30 };
	return {
		claudian: adapter(),
		getAgentSettings: () => agent,
		setAgentSettings: (settings) => {
			agent = settings as typeof agent;
			return true;
		},
		activeNotePath: () => 'Course/Week 1.md',
		dailyNotePath: () => 'Daily Notes/2026-08-15.md',
		academicMetadata: () => DEFAULT_METADATA_SETTINGS,
		creationContext: async (_workflowId, title) => ({
			destination: 'Academic Notes',
			resolvedPath: `Academic Notes/${title}/${title}.md`,
		}),
		...overrides,
	};
}

describe('Agent Widgets', () => {
	it('registers all four pre-allocated Agent Widget IDs', () => {
		const registry = new WidgetRegistry();
		registerAgentWidgets(registry, services());
		expect(registry.definitions().map(({ id }) => id)).toEqual([
			'agent.status',
			'agent.prompt',
			'agent.workflows',
			'agent.claudian-entry',
		]);
	});

	it('shows verified Claudian status without provider/model claims', async () => {
		const target = mounted('agent.status');
		await new AgentStatusWidget(services()).mount(target.context);
		expect(target.states.at(-1)).toEqual({ status: 'ready' });
		expect(target.content.children[0]?.children[1]?.textContent).toBe('Codex');
		expect(target.content.children[1]?.textContent).toContain('Claudian 2.1.3');
		expect(target.content.children[4]?.textContent).toContain(
			'Provider, model, authentication, and permissions stay in Claudian',
		);
		expect(target.content.children[2]?.textContent).toContain('available for review');
	});

	it('switches selected Agent state and hands the active note to Claudian', async () => {
		const baseAdapter = adapter();
		const handoff = vi.fn((request: AgentWorkflowRequest) =>
			baseAdapter.handoff(request));
		const onHandoff = vi.fn();
		const target = mounted();
		new AgentWorkflowWidget(
			services({ claudian: adapter({ handoff }), onHandoff }),
		).mount(target.context);
		const form = target.content.children[0];
		const targetSelect = form?.children[0]?.children[0]?.children[1];
		if (targetSelect) {
			targetSelect.value = 'opencode';
			targetSelect.change();
		}
		form?.children[3]?.click();

		await vi.waitFor(() => expect(handoff).toHaveBeenCalledOnce());
		expect(handoff).toHaveBeenCalledWith({
			workflowId: 'summarize-current-note',
			target: 'opencode',
			currentNotePath: 'Course/Week 1.md',
		});
		expect(onHandoff).toHaveBeenCalledWith(
			expect.objectContaining({ target: 'opencode' }),
			expect.objectContaining({ status: 'ready-for-review' }),
		);
		await vi.waitFor(() => {
			expect(form?.children[4]?.textContent).toBe('Prepared in Claudian.');
		});
		expect(form?.children[3]?.focused).toBe(true);
	});

	it('opens Claudian through the adapter entry point', async () => {
		const open = vi.fn(async () => ({ status: 'opened' as const, message: 'Opened.' }));
		const target = mounted('agent.claudian-entry');
		new ClaudianEntryWidget(services({ claudian: adapter({ open }) })).mount(
			target.context,
		);
		target.content.children[1]?.click();
		await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
	});

	it('hands today’s configured Daily Note and metadata mapping to Claudian', async () => {
		const baseAdapter = adapter();
		const handoff = vi.fn((request: AgentWorkflowRequest) =>
			baseAdapter.handoff(request));
		const target = mounted();
		new AgentWorkflowWidget(services({ claudian: adapter({ handoff }) })).mount(
			target.context,
		);
		let form = target.content.children[0];
		const workflow = form?.children[0]?.children[1]?.children[1];
		if (workflow) {
			workflow.value = 'organize-daily-note-into-academic-notes';
			workflow.change();
		}
		form = target.content.children[0];
		form?.children[3]?.click();

		await vi.waitFor(() => expect(handoff).toHaveBeenCalledOnce());
		expect(handoff).toHaveBeenCalledWith({
			workflowId: 'organize-daily-note-into-academic-notes',
			target: 'codex',
			currentNotePath: 'Daily Notes/2026-08-15.md',
			academicMetadata: DEFAULT_METADATA_SETTINGS,
		});
	});

	it('disables Daily Note routing when today’s configured note is missing', () => {
		const target = mounted();
		new AgentWorkflowWidget(services({ dailyNotePath: () => null })).mount(
			target.context,
		);
		let form = target.content.children[0];
		const workflow = form?.children[0]?.children[1]?.children[1];
		if (workflow) {
			workflow.value = 'organize-daily-note-into-academic-notes';
			workflow.change();
		}
		form = target.content.children[0];

		expect(form?.children[3]?.disabled).toBe(true);
		expect(form?.children[4]?.textContent).toContain(
			'Today’s configured Daily Note does not exist',
		);
	});

	it('hands a book-reading title and Reading destination to Claudian as a direct creation', async () => {
		const baseAdapter = adapter();
		const handoff = vi.fn((request: AgentWorkflowRequest) =>
			baseAdapter.handoff(request));
		const creationContext = vi.fn(async () => ({
			destination: 'Reading',
			resolvedPath: 'Reading/DL_Recommender_System/Designing Data-Intensive Applications.md',
			templateContent: '# Designing Data-Intensive Applications\n',
		}));
		const target = mounted();
		new AgentWorkflowWidget(services({
			claudian: adapter({ handoff }),
			creationContext,
		})).mount(target.context);
		let form = target.content.children[0];
		const workflow = form?.children[0]?.children[1]?.children[1];
		if (workflow) {
			workflow.value = 'create-book-reading-note';
			workflow.change();
		}
		form = target.content.children[0];
		const input = form?.children[1]?.children[1];
		if (input) {
			input.value = 'Designing Data-Intensive Applications';
			input.input();
		}
		expect(form?.children[2]?.textContent).toContain('no second approval');
		form?.children[3]?.click();

		await vi.waitFor(() => expect(handoff).toHaveBeenCalledOnce());
		expect(creationContext).toHaveBeenCalledWith(
			'create-book-reading-note',
			'Designing Data-Intensive Applications',
		);
		expect(handoff).toHaveBeenCalledWith({
			workflowId: 'create-book-reading-note',
			target: 'codex',
			userInput: 'Designing Data-Intensive Applications',
			templateContent: '# Designing Data-Intensive Applications\n',
			requestedDestination: 'Reading',
			resolvedNotePath: 'Reading/DL_Recommender_System/Designing Data-Intensive Applications.md',
		});
	});

	it('stops before Claudian when native creation preflight fails', async () => {
		const handoff = vi.fn();
		const target = mounted();
		new AgentWorkflowWidget(services({
			claudian: adapter({ handoff }),
			creationContext: async () => {
				throw new Error('Multiple matching folders or files were found.');
			},
		})).mount(target.context);
		let form = target.content.children[0];
		const workflow = form?.children[0]?.children[1]?.children[1];
		if (workflow) {
			workflow.value = 'create-book-reading-note';
			workflow.change();
		}
		form = target.content.children[0];
		const input = form?.children[1]?.children[1];
		if (input) {
			input.value = 'Ambiguous Book';
			input.input();
		}
		form?.children[3]?.click();

		await vi.waitFor(() => {
			expect(form?.children[4]?.textContent).toContain('Multiple matching folders');
		});
		expect(handoff).not.toHaveBeenCalled();
		expect(form?.children[4]?.attributes.get('data-status')).toBe('failed');
	});
});
