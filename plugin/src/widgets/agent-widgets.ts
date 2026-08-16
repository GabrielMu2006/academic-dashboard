import type { AgentSettings } from '../core/agent-settings';
import type { MetadataSettings } from '../core/metadata-settings';
import {
	AGENT_WORKFLOWS,
	getAgentWorkflow,
	type AgentTarget,
	type AgentWorkflowId,
} from '../core/agent-workflows';
import type {
	AgentWorkflowRequest,
	ClaudianAdapter,
	ClaudianHandoffResult,
} from '../core/claudian';
import type { WidgetRegistry } from '../core/widget-registry';
import type { WidgetLifecycle, WidgetMountContext } from '../core/widgets';
import { t, translateEnglishSource } from '../core/localization';

export interface AgentCreationContext {
	readonly templatePath?: string;
	readonly templateContent?: string;
	readonly destination: string;
	readonly resolvedPath: string;
}

export interface AgentWidgetServices {
	readonly claudian: ClaudianAdapter;
	readonly getAgentSettings: () => AgentSettings;
	readonly setAgentSettings: (settings: AgentSettings) => boolean;
	readonly activeNotePath: () => string | null;
	readonly dailyNotePath: () => string | null;
	readonly academicMetadata: () => MetadataSettings;
	readonly creationContext: (
		workflowId:
			| 'create-course-note'
			| 'create-paper-reading-note'
			| 'create-book-reading-note',
		title: string,
	) => Promise<AgentCreationContext>;
	readonly onHandoff?: (
		request: AgentWorkflowRequest,
		result: ClaudianHandoffResult,
	) => void | Promise<void>;
}

interface ObsidianWindowDom {
	createEl<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K];
}

function element<K extends keyof HTMLElementTagNameMap>(
	document: Document,
	tag: K,
	className: string,
	text?: string,
): HTMLElementTagNameMap[K] {
	const result = (document.win as Window & ObsidianWindowDom).createEl(tag);
	result.className = className;
	if (text !== undefined) result.textContent = translateEnglishSource(text);
	return result;
}

function targetLabel(target: AgentTarget): string {
	return target === 'codex' ? 'Codex' : 'OpenCode';
}

export class AgentStatusWidget implements WidgetLifecycle {
	private generation = 0;

	constructor(private readonly services: AgentWidgetServices) {}

	mount(context: WidgetMountContext): Promise<void> { return this.load(context); }
	update(context: WidgetMountContext): Promise<void> { return this.load(context); }
	destroy(): void { this.generation += 1; }

	private async load(context: WidgetMountContext): Promise<void> {
		const generation = ++this.generation;
		context.contentEl.replaceChildren();
		context.setState({ status: 'loading', message: 'Checking Claudian…' });
		const availability = await this.services.claudian.availability();
		if (generation !== this.generation) return;
		if (availability.status === 'unavailable') {
			context.setState({
				status: 'unavailable',
				reason: `Claudian unavailable: ${availability.reason}.`,
				recovery: availability.recovery,
			});
			return;
		}
		if (availability.status === 'unknown') {
			context.setState({ status: 'unavailable', reason: availability.reason });
			return;
		}
		const document = context.contentEl.ownerDocument;
		const selected = this.services.getAgentSettings().selectedTarget;
		const preference = element(document, 'div', 'academic-dashboard-agent-status');
		const preferenceLabel = element(document, 'span', 'academic-dashboard-agent-status__label', t('agent.preferenceLabel'));
		const preferenceValue = element(document, 'strong', 'academic-dashboard-agent__target', targetLabel(selected));
		const ready = element(document, 'p', 'academic-dashboard-agent__copy', `✓ ${t('agent.statusReady')}`);
		preference.append(preferenceLabel, preferenceValue);
		context.contentEl.append(
			preference,
			element(
				document,
				'p',
				'academic-dashboard-agent__copy',
				t('agent.versionStatus', { version: availability.pluginVersion }),
			),
			ready,
			element(document, 'p', 'academic-dashboard-agent__copy', t('agent.preferenceHelp')),
			element(
				document,
				'p',
				'academic-dashboard-agent__copy',
				'Provider, model, authentication, and permissions stay in Claudian and the selected Agent.',
			),
		);
		context.setState({ status: 'ready' });
	}
}

export class AgentWorkflowWidget implements WidgetLifecycle {
	private events: AbortController | null = null;
	private context: WidgetMountContext | null = null;
	private workflowId: AgentWorkflowId = 'summarize-current-note';
	private input = '';
	private busy = false;

	constructor(private readonly services: AgentWidgetServices) {}

	mount(context: WidgetMountContext): void { this.render(context); }
	update(context: WidgetMountContext): void { this.render(context); }
	destroy(): void {
		this.events?.abort();
		this.events = null;
		this.context = null;
	}

	private render(context: WidgetMountContext): void {
		this.events?.abort();
		this.events = new AbortController();
		this.context = context;
		context.contentEl.replaceChildren();
		const document = context.contentEl.ownerDocument;
		const form = element(document, 'form', 'academic-dashboard-agent-form');
		const row = element(document, 'div', 'academic-dashboard-agent-form__row');
		const targetField = element(document, 'label', 'academic-dashboard-agent-form__field');
		targetField.append(element(document, 'span', 'academic-dashboard-agent-form__label', t('agent.preferenceLabel')));
		const target = element(document, 'select', 'academic-dashboard-filter');
		target.setAttribute('aria-label', t('agent.selectedTarget'));
		for (const [value, label] of [['codex', 'Codex'], ['opencode', 'OpenCode']] as const) {
			const option = element(document, 'option', '', label);
			option.value = value;
			target.append(option);
		}
		target.value = this.services.getAgentSettings().selectedTarget;
		targetField.append(target);
		const workflowField = element(document, 'label', 'academic-dashboard-agent-form__field');
		workflowField.append(element(document, 'span', 'academic-dashboard-agent-form__label', t('agent.workflowLabel')));
		const workflow = element(document, 'select', 'academic-dashboard-filter');
		workflow.setAttribute('aria-label', t('agent.workflow'));
		for (const definition of AGENT_WORKFLOWS) {
			const option = element(document, 'option', '', definition.title);
			option.value = definition.id;
			workflow.append(option);
		}
		workflow.value = this.workflowId;
		workflowField.append(workflow);
		row.append(targetField, workflowField);

		const inputField = element(document, 'label', 'academic-dashboard-agent-form__field');
		inputField.append(element(document, 'span', 'academic-dashboard-agent-form__label', t('agent.focusLabel')));
		const input = element(document, 'textarea', 'academic-dashboard-agent-form__input');
		input.value = this.input;
		input.rows = 4;
		input.maxLength = 2_000;
		input.placeholder = this.inputPlaceholder();
		input.setAttribute('aria-label', this.inputPlaceholder());
		inputField.append(input);

		const boundary = element(
			document,
			'p',
			'academic-dashboard-agent__copy',
			this.workflowBoundary(),
		);
		const button = element(
			document,
			'button',
			'academic-dashboard-agent__button',
			this.busy ? 'Preparing…' : 'Prepare handoff',
		);
		button.type = 'button';
		const unavailable = this.workflowUnavailable();
		button.disabled = this.busy || unavailable !== null;
		const handoffStatus = element(
			document,
			'div',
			'academic-dashboard-agent__handoff',
			unavailable ?? (getAgentWorkflow(this.workflowId).access === 'direct-write'
				? t('agent.directWriteStatus')
				: t('agent.reviewBoundary')),
		);
		handoffStatus.setAttribute('aria-live', 'polite');

		target.addEventListener('change', () => {
			const settings = this.services.getAgentSettings();
			if (this.services.setAgentSettings({
				...settings,
				selectedTarget: target.value as AgentTarget,
			})) {
				handoffStatus.textContent = t('agent.selectedConfirm', {
					target: targetLabel(target.value as AgentTarget),
				});
			}
		}, { signal: this.events.signal });
		workflow.addEventListener('change', () => {
			this.workflowId = workflow.value as AgentWorkflowId;
			this.input = input.value;
			this.render(context);
		}, { signal: this.events.signal });
		input.addEventListener('input', () => { this.input = input.value; }, {
			signal: this.events.signal,
		});
		button.addEventListener('click', () => {
			void this.handoff(button, handoffStatus);
		}, { signal: this.events.signal });
		form.addEventListener('submit', (event) => {
			event.preventDefault();
			void this.handoff(button, handoffStatus);
		}, { signal: this.events.signal });

		form.append(row, inputField, boundary, button, handoffStatus);
		context.contentEl.append(form);
		context.setState({ status: 'ready' });
	}

	private inputPlaceholder(): string {
		if (this.workflowId === 'answer-from-vault') return 'Question to answer from this Vault';
		if (this.workflowId === 'organize-daily-note-into-academic-notes') return t('agent.dailyRoutingFocus');
		if (this.workflowId === 'create-course-note') return 'Course note title';
		if (this.workflowId === 'create-paper-reading-note') return 'Paper-reading note title';
		if (this.workflowId === 'create-book-reading-note') return t('agent.bookTitlePlaceholder');
		return 'Optional focus or constraints (note content is not stored here)';
	}

	private workflowBoundary(): string {
		const workflow = getAgentWorkflow(this.workflowId);
		return workflow.access === 'read-only'
			? t('agent.readOnlyBoundary')
			: workflow.access === 'direct-write'
				? t('agent.directWriteBoundary')
				: t('agent.writeBoundary');
	}

	private workflowUnavailable(): string | null {
		return this.workflowId === 'organize-daily-note-into-academic-notes' &&
			this.services.dailyNotePath() === null
			? t('agent.dailyRoutingMissing')
			: null;
	}

	private async request(): Promise<AgentWorkflowRequest> {
		const target = this.services.getAgentSettings().selectedTarget;
		const definition = getAgentWorkflow(this.workflowId);
		if (definition.scope === 'current-note') {
			return {
				workflowId: this.workflowId,
				target,
				currentNotePath: this.services.activeNotePath() ?? undefined,
				...(this.input.trim() ? { userInput: this.input.trim() } : {}),
			};
		}
		if (definition.scope === 'daily-note') {
			return {
				workflowId: this.workflowId,
				target,
				currentNotePath: this.services.dailyNotePath() ?? undefined,
				academicMetadata: this.services.academicMetadata(),
				...(this.input.trim() ? { userInput: this.input.trim() } : {}),
			};
		}
		if (definition.scope === 'new-note') {
			const creation = await this.services.creationContext(
				this.workflowId as
					| 'create-course-note'
					| 'create-paper-reading-note'
					| 'create-book-reading-note',
				this.input.trim(),
			);
			return {
				workflowId: this.workflowId,
				target,
				userInput: this.input.trim(),
				...(creation.templatePath ? { templatePath: creation.templatePath } : {}),
				...(creation.templateContent
					? { templateContent: creation.templateContent }
					: {}),
				requestedDestination: creation.destination,
				resolvedNotePath: creation.resolvedPath,
			};
		}
		return { workflowId: this.workflowId, target, userInput: this.input.trim() };
	}

	private async handoff(button: HTMLButtonElement, status: HTMLElement): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		button.disabled = true;
		button.textContent = 'Preparing…';
		status.textContent = 'Opening handoff…';
		try {
			const request = await this.request();
			const result = await this.services.claudian.handoff(request);
			await this.services.onHandoff?.(request, result);
			if (!this.context) return;
			status.textContent = result.message;
			status.setAttribute('data-status', result.status);
		} catch (error) {
			status.textContent = error instanceof Error
				? error.message
				: 'The workflow handoff could not be prepared.';
			status.setAttribute('data-status', 'failed');
		} finally {
			this.busy = false;
			button.disabled = this.workflowUnavailable() !== null;
			button.textContent = t('agent.prepare');
			button.focus();
		}
	}
}

export class AgentWorkflowCatalogWidget implements WidgetLifecycle {
	mount(context: WidgetMountContext): void { this.render(context); }
	update(context: WidgetMountContext): void { this.render(context); }
	destroy(): void {}

	private render(context: WidgetMountContext): void {
		const document = context.contentEl.ownerDocument;
		const list = element(document, 'ul', 'academic-dashboard-agent-workflows');
		for (const workflow of AGENT_WORKFLOWS) {
			const item = element(document, 'li', 'academic-dashboard-agent-workflows__item');
			item.append(
				element(document, 'strong', '', workflow.title),
				element(
					document,
					'span',
					'',
					workflow.access === 'read-only'
						? t('agent.readOnly')
						: workflow.access === 'direct-write'
							? t('agent.directWrite')
							: t('agent.reviewBeforeWrite'),
				),
			);
			list.append(item);
		}
		context.contentEl.replaceChildren(list);
		context.setState({ status: 'ready' });
	}
}

export class ClaudianEntryWidget implements WidgetLifecycle {
	private events: AbortController | null = null;
	constructor(private readonly services: AgentWidgetServices) {}
	mount(context: WidgetMountContext): void { this.render(context); }
	update(context: WidgetMountContext): void { this.render(context); }
	destroy(): void { this.events?.abort(); this.events = null; }

	private render(context: WidgetMountContext): void {
		this.events?.abort();
		this.events = new AbortController();
		const document = context.contentEl.ownerDocument;
		const button = element(document, 'button', 'academic-dashboard-agent__button', 'Open Claudian');
		button.type = 'button';
		const status = element(document, 'p', 'academic-dashboard-agent__handoff');
		status.setAttribute('role', 'status');
		status.setAttribute('aria-live', 'polite');
		button.addEventListener('click', () => {
			void this.services.claudian.open().then((result) => {
				if (result.status === 'failed') {
					context.setState({ status: 'error', message: result.message, code: result.errorCode });
				} else {
					status.textContent = result.message;
				}
				button.focus();
			});
		}, { signal: this.events.signal });
		context.contentEl.replaceChildren(
			element(document, 'p', 'academic-dashboard-agent__copy', 'Continue conversations and manage target settings in Claudian.'),
			button,
			status,
		);
		context.setState({ status: 'ready' });
	}
}

export function registerAgentWidgets(
	registry: WidgetRegistry,
	services: AgentWidgetServices,
): void {
	registry.register({
		definition: { id: 'agent.status', title: 'Agent Status', allowedPages: ['agent'], allowedSizes: ['small', 'medium'], defaultSize: 'medium' },
		create: () => new AgentStatusWidget(services),
	});
	registry.register({
		definition: { id: 'agent.prompt', title: 'Agent Handoff', allowedPages: ['agent'], allowedSizes: ['medium', 'large'], defaultSize: 'large' },
		create: () => new AgentWorkflowWidget(services),
	});
	registry.register({
		definition: { id: 'agent.workflows', title: 'Approved Workflows', allowedPages: ['agent'], allowedSizes: ['medium', 'large'], defaultSize: 'large' },
		create: () => new AgentWorkflowCatalogWidget(),
	});
	registry.register({
		definition: { id: 'agent.claudian-entry', title: 'Claudian', allowedPages: ['agent'], allowedSizes: ['small', 'medium'], defaultSize: 'medium' },
		create: () => new ClaudianEntryWidget(services),
	});
}
