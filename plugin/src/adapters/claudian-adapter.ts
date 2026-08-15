import { buildAgentWorkflowPrompt } from '../core/agent-workflow-prompts';
import type {
	AgentWorkflowRequest,
	ClaudianAdapter,
	ClaudianAvailability,
	ClaudianHandoffResult,
	ClaudianOpenResult,
} from '../core/claudian';
import { CLAUDIAN_2_1_3_CAPABILITIES } from '../core/claudian';

export interface ClaudianCompatibilityPort {
	installedVersion(): string | null;
	loadedPlugin(): ClaudianPluginCompatibility | null;
}

export interface ClaudianPluginCompatibility {
	activateView?(): Promise<void> | void;
	getView?(): ClaudianViewCompatibility | null;
}

export interface ClaudianViewCompatibility {
	appendToActiveInput?(text: string): boolean;
	focusActiveInput?(): void;
}

function failed(
	request: AgentWorkflowRequest,
	message: string,
	errorCode: string,
): ClaudianHandoffResult {
	return Object.freeze({
		status: 'failed',
		target: request.target,
		workflowId: request.workflowId,
		message,
		requiresTargetConfirmation: true,
		errorCode,
	});
}

export class ClaudianWorkflowAdapter implements ClaudianAdapter {
	readonly id = 'claudian.workflow-handoff' as const;

	constructor(private readonly port: ClaudianCompatibilityPort) {}

	async availability(): Promise<ClaudianAvailability> {
		const pluginVersion = this.port.installedVersion();
		if (!pluginVersion) {
			return Object.freeze({
				status: 'unavailable',
				reason: 'not-installed',
				recovery: 'Install and enable Claudian, then reopen the Dashboard.',
			});
		}
		const plugin = this.port.loadedPlugin();
		if (!plugin) {
			return Object.freeze({
				status: 'unavailable',
				reason: 'disabled',
				recovery: 'Enable Claudian in Community Plugins, then retry.',
			});
		}
		if (
			typeof plugin.activateView !== 'function' ||
			typeof plugin.getView !== 'function'
		) {
			return Object.freeze({
				status: 'unavailable',
				reason: 'missing-handoff-capability',
				recovery: 'Use a compatible Claudian release or open Claudian manually.',
			});
		}
		return Object.freeze({
			status: 'available',
			pluginVersion,
			compatibility: pluginVersion === '2.1.3' ? 'verified' : 'compatible',
			capabilities: CLAUDIAN_2_1_3_CAPABILITIES,
		});
	}

	async open(): Promise<ClaudianOpenResult> {
		const availability = await this.availability();
		if (availability.status !== 'available') {
			return Object.freeze({
				status: 'failed',
				message: availability.status === 'unavailable'
					? availability.recovery
					: availability.reason,
				errorCode: availability.status,
			});
		}
		const plugin = this.port.loadedPlugin();
		if (!plugin || typeof plugin.activateView !== 'function') {
			return Object.freeze({
				status: 'failed',
				message: 'Claudian is no longer available.',
				errorCode: 'plugin-unloaded',
			});
		}
		try {
			await plugin.activateView();
			return Object.freeze({ status: 'opened', message: 'Claudian opened.' });
		} catch {
			return Object.freeze({
				status: 'failed',
				message: 'Claudian could not be opened.',
				errorCode: 'open-failed',
			});
		}
	}

	async handoff(request: AgentWorkflowRequest): Promise<ClaudianHandoffResult> {
		const availability = await this.availability();
		if (availability.status !== 'available') {
			return failed(
				request,
				availability.status === 'unavailable'
					? availability.recovery
					: availability.reason,
				availability.status,
			);
		}

		let prompt: string;
		try {
			prompt = buildAgentWorkflowPrompt(request);
		} catch (error) {
			return failed(
				request,
				error instanceof Error ? error.message : 'The workflow request is invalid.',
				'request-invalid',
			);
		}

		const plugin = this.port.loadedPlugin();
		if (
			!plugin ||
			typeof plugin.activateView !== 'function' ||
			typeof plugin.getView !== 'function'
		) {
			return failed(request, 'Claudian is no longer available.', 'plugin-unloaded');
		}
		try {
			await plugin.activateView();
			const view = plugin.getView();
			if (!view || typeof view.appendToActiveInput !== 'function') {
				return Object.freeze({
					status: 'opened-without-prefill',
					target: request.target,
					workflowId: request.workflowId,
					message: 'Claudian opened, but this release cannot accept a prepared request. Paste the workflow manually.',
					requiresTargetConfirmation: true,
				});
			}
			if (!view.appendToActiveInput(prompt)) {
				return failed(request, 'Claudian opened but its composer was unavailable.', 'composer-unavailable');
			}
			view.focusActiveInput?.();
			return Object.freeze({
				status: 'ready-for-review',
				target: request.target,
				workflowId: request.workflowId,
				message: `Prepared in Claudian. Verify ${request.target === 'codex' ? 'Codex' : 'OpenCode'}, review the request, then send it there.`,
				requiresTargetConfirmation: true,
			});
		} catch {
			return failed(request, 'Claudian could not open the workflow handoff.', 'handoff-failed');
		}
	}
}
