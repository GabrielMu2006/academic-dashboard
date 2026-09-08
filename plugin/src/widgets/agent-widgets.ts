import type { AgentSettings } from '../core/agent-settings';
import type { MetadataSettings } from '../core/metadata-settings';
import { buildAgentWorkflowPrompt } from '../core/agent-workflow-prompts';
import type { AgentWriteLogEntry } from '../core/agent-write-log';
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
	readonly getRequestLog: () => readonly AgentWriteLogEntry[];
	readonly markRequestComplete: (entry: AgentWriteLogEntry) => boolean;
	readonly openNote: (path: string) => Promise<void>;
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

export interface AgentHandoffPreview {
	readonly request: AgentWorkflowRequest;
	readonly workflowTitle: string;
	readonly access: 'read-only' | 'proposed-write' | 'direct-write';
	readonly paths: readonly string[];
	readonly requestedDestination?: string;
	readonly resolvedNotePath?: string;
	readonly contextCharacters: number;
	readonly userInputCharacters: number;
	readonly templateCharacters: number;
}

export function buildAgentHandoffPreview(request: AgentWorkflowRequest): AgentHandoffPreview {
	const definition = getAgentWorkflow(request.workflowId);
	const prompt = buildAgentWorkflowPrompt(request);
	const paths = [...new Set([
		request.currentNotePath,
		request.templatePath,
		request.resolvedNotePath,
	].filter((path): path is string => Boolean(path)))];
	return Object.freeze({
		request,
		workflowTitle: definition.title,
		access: definition.access,
		paths: Object.freeze(paths),
		...(request.requestedDestination ? { requestedDestination: request.requestedDestination } : {}),
		...(request.resolvedNotePath ? { resolvedNotePath: request.resolvedNotePath } : {}),
		contextCharacters: prompt.length,
		userInputCharacters: request.userInput?.length ?? 0,
		templateCharacters: request.templateContent?.length ?? 0,
	});
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
	private preview: AgentHandoffPreview | null = null;
	private handoffButton: HTMLButtonElement | null = null;
	private lastStatus: { readonly text: string; readonly state: string } | null = null;

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
		this.handoffButton = null;
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
			this.busy ? t('agent.preparing') : t('agent.previewRequest'),
		);
		button.type = 'button';
		const unavailable = this.workflowUnavailable();
		button.disabled = this.busy || unavailable !== null;
		const handoffStatus = element(
			document,
			'div',
			'academic-dashboard-agent__handoff',
			unavailable ?? this.lastStatus?.text ?? (getAgentWorkflow(this.workflowId).access === 'direct-write'
				? t('agent.directWriteStatus')
				: t('agent.reviewBoundary')),
		);
		handoffStatus.setAttribute('aria-live', 'polite');
		if (this.lastStatus) handoffStatus.setAttribute('data-status', this.lastStatus.state);

		target.addEventListener('change', () => {
			const settings = this.services.getAgentSettings();
			if (this.services.setAgentSettings({
				...settings,
				selectedTarget: target.value as AgentTarget,
			})) {
				this.preview = null;
				if (this.handoffButton) this.handoffButton.disabled = true;
				this.lastStatus = null;
				handoffStatus.textContent = t('agent.selectedConfirm', {
					target: targetLabel(target.value as AgentTarget),
				});
			}
		}, { signal: this.events.signal });
		workflow.addEventListener('change', () => {
			this.workflowId = workflow.value as AgentWorkflowId;
			this.input = input.value;
			this.preview = null;
			this.lastStatus = null;
			this.render(context);
		}, { signal: this.events.signal });
		input.addEventListener('input', () => {
			this.input = input.value;
			if (this.preview) {
				this.preview = null;
				if (this.handoffButton) this.handoffButton.disabled = true;
				this.lastStatus = { text: t('agent.previewStale'), state: 'stale' };
				handoffStatus.textContent = this.lastStatus.text;
				handoffStatus.setAttribute('data-status', 'stale');
			}
		}, {
			signal: this.events.signal,
		});
		button.addEventListener('click', () => {
			void this.preparePreview(button, handoffStatus);
		}, { signal: this.events.signal });
		form.addEventListener('submit', (event) => {
			event.preventDefault();
			void this.preparePreview(button, handoffStatus);
		}, { signal: this.events.signal });

		form.append(row, inputField, boundary, button, handoffStatus);
		if (this.preview) form.append(this.renderPreview(document, this.preview));
		form.append(this.renderHistory(document));
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

	private async preparePreview(button: HTMLButtonElement, status: HTMLElement): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		button.disabled = true;
		button.textContent = t('agent.preparing');
		status.textContent = t('agent.preparingPreview');
		try {
			const request = await this.request();
			this.preview = buildAgentHandoffPreview(request);
			this.lastStatus = { text: t('agent.state.prepared'), state: 'prepared' };
			if (this.context) this.render(this.context);
		} catch (error) {
			this.preview = null;
			const text = error instanceof Error
				? error.message
				: 'The workflow handoff could not be prepared.';
			this.lastStatus = { text, state: 'failed' };
			status.textContent = text;
			status.setAttribute('data-status', 'failed');
		} finally {
			this.busy = false;
			if (this.context && !this.preview) {
				button.disabled = this.workflowUnavailable() !== null;
				button.textContent = t('agent.previewRequest');
				button.focus();
			}
		}
	}

	private renderPreview(document: Document, preview: AgentHandoffPreview): HTMLElement {
		const panel = element(document, 'section', 'academic-dashboard-agent-preview');
		panel.append(
			element(document, 'strong', 'academic-dashboard-agent-preview__title', t('agent.previewTitle')),
			element(document, 'div', 'academic-dashboard-agent-preview__meta', t('agent.previewWorkflow', { workflow: preview.workflowTitle, target: targetLabel(preview.request.target) })),
			element(document, 'div', 'academic-dashboard-agent-preview__meta', t('agent.previewSize', { total: preview.contextCharacters, request: preview.userInputCharacters, template: preview.templateCharacters })),
			element(document, 'div', 'academic-dashboard-agent-preview__meta', t('agent.previewAccess', { access: preview.access })),
		);
		if (preview.requestedDestination) panel.append(element(document, 'div', 'academic-dashboard-agent-preview__meta', t('agent.previewDestination', { destination: preview.requestedDestination })));
		if (preview.resolvedNotePath) panel.append(element(document, 'div', 'academic-dashboard-agent-preview__meta', t('agent.previewResolved', { path: preview.resolvedNotePath })));
		const paths = element(document, 'div', 'academic-dashboard-agent-preview__paths');
		paths.append(element(document, 'span', 'academic-dashboard-agent-preview__label', t('agent.previewPaths')));
		if (preview.paths.length === 0) paths.append(element(document, 'span', '', t('agent.noPath')));
		for (const path of preview.paths) {
			const open = element(document, 'button', 'academic-dashboard-agent-preview__path', path); open.type = 'button'; open.title = path;
			open.addEventListener('click', () => { void this.services.openNote(path); }, { signal: this.events?.signal }); paths.append(open);
		}
		const explanation = element(document, 'p', 'academic-dashboard-agent__copy', t('agent.previewEditHelp'));
		const send = element(document, 'button', 'academic-dashboard-agent__button mod-cta', t('agent.prefillClaudian')); send.type = 'button';
		this.handoffButton = send;
		send.addEventListener('click', () => { void this.handoffPreview(preview, send); }, { signal: this.events?.signal });
		panel.append(paths, explanation, send); return panel;
	}

	private async handoffPreview(preview: AgentHandoffPreview, button: HTMLButtonElement): Promise<void> {
		if (this.busy || this.preview !== preview) return;
		this.busy = true; button.disabled = true; button.textContent = t('agent.openingHandoff');
		try {
			const result = await this.services.claudian.handoff(preview.request);
			await this.services.onHandoff?.(preview.request, result);
			this.lastStatus = result.status === 'ready-for-review' || result.status === 'ready-to-send'
				? { text: t('agent.state.waitingUserSend'), state: 'waiting-user-send' }
				: result.status === 'opened-without-prefill'
					? { text: t('agent.state.openedOnly'), state: 'opened-only' }
					: { text: result.message, state: 'failed' };
		} catch (error) {
			this.lastStatus = { text: error instanceof Error ? error.message : t('agent.handoffFailed'), state: 'failed' };
		} finally {
			this.busy = false; this.preview = null;
			if (this.context) this.render(this.context);
		}
	}

	private renderHistory(document: Document): HTMLElement {
		const section = element(document, 'section', 'academic-dashboard-agent-history');
		section.append(
			element(document, 'strong', 'academic-dashboard-agent-history__title', t('agent.historyTitle')),
			element(document, 'p', 'academic-dashboard-agent__copy', t('agent.historyBoundary')),
		);
		const entries = [...this.services.getRequestLog()].reverse().slice(0, 5);
		if (entries.length === 0) { section.append(element(document, 'p', 'academic-dashboard-agent__copy', t('agent.historyEmpty'))); return section; }
		for (const entry of entries) {
			const row = element(document, 'div', 'academic-dashboard-agent-history__item');
			row.append(element(document, 'div', 'academic-dashboard-agent-history__meta', `${entry.timestamp} · ${getAgentWorkflow(entry.workflowId).title} · ${targetLabel(entry.target)}`));
			row.append(element(document, 'div', 'academic-dashboard-agent-history__state', this.outcomeLabel(entry)));
			if (entry.affectedPaths.length > 0) row.append(element(document, 'div', 'academic-dashboard-agent-history__paths', entry.affectedPaths.join(' · ')));
			if (entry.contextCharacters !== undefined) row.append(element(document, 'div', 'academic-dashboard-agent-history__size', t('agent.historySize', { count: entry.contextCharacters })));
			const actions = element(document, 'div', 'academic-dashboard-agent-history__actions');
			const again = element(document, 'button', 'academic-dashboard-agent-history__action', t('agent.prepareAgain')); again.type = 'button';
			again.addEventListener('click', () => { this.workflowId = entry.workflowId; this.input = ''; this.preview = null; this.lastStatus = { text: t('agent.reprepareHelp'), state: 'prepared-again' }; const settings = this.services.getAgentSettings(); this.services.setAgentSettings({ ...settings, selectedTarget: entry.target }); if (this.context) this.render(this.context); }, { signal: this.events?.signal }); actions.append(again);
			if (!['handoff-failed', 'user-marked-complete'].includes(entry.outcome)) {
				const complete = element(document, 'button', 'academic-dashboard-agent-history__action', t('agent.markComplete')); complete.type = 'button';
				complete.addEventListener('click', () => { if (this.services.markRequestComplete(entry) && this.context) { this.lastStatus = { text: t('agent.state.userComplete'), state: 'user-marked-complete' }; this.render(this.context); } }, { signal: this.events?.signal }); actions.append(complete);
			}
			row.append(actions); section.append(row);
		}
		return section;
	}

	private outcomeLabel(entry: AgentWriteLogEntry): string {
		if (entry.outcome === 'handoff-failed') return t('agent.state.failed');
		if (entry.outcome === 'opened-without-prefill') return t('agent.state.openedOnly');
		if (entry.outcome === 'user-marked-complete') return t('agent.state.userComplete');
		return t('agent.state.waitingUserSend');
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
