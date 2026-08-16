import type { AgentTarget, AgentWorkflowId } from './agent-workflows';
import type { MetadataSettings } from './metadata-settings';

export interface ClaudianCapabilities {
	readonly openView: boolean;
	readonly prefillPrompt: boolean;
	readonly selectTarget: boolean;
	readonly executionSignals: boolean;
}

export type ClaudianAvailability =
	| {
			readonly status: 'available';
			readonly pluginVersion: string;
			readonly compatibility: 'verified' | 'compatible';
			readonly capabilities: ClaudianCapabilities;
	  }
	| {
			readonly status: 'unavailable';
			readonly reason: 'not-installed' | 'disabled' | 'missing-handoff-capability';
			readonly recovery: string;
	  }
	| {
			readonly status: 'unknown';
			readonly reason: string;
	  };

export interface AgentWorkflowRequest {
	readonly workflowId: AgentWorkflowId;
	readonly target: AgentTarget;
	readonly currentNotePath?: string;
	readonly userInput?: string;
	readonly templatePath?: string;
	readonly requestedDestination?: string;
	readonly academicMetadata?: MetadataSettings;
}

export type ClaudianHandoffStatus =
	| 'preparing'
	| 'ready-for-review'
	| 'ready-to-send'
	| 'opened-without-prefill'
	| 'failed';

export interface ClaudianHandoffResult {
	readonly status: ClaudianHandoffStatus;
	readonly target: AgentTarget;
	readonly workflowId: AgentWorkflowId;
	readonly message: string;
	readonly requiresTargetConfirmation: boolean;
	readonly errorCode?: string;
}

export type ClaudianOpenResult =
	| { readonly status: 'opened'; readonly message: string }
	| { readonly status: 'failed'; readonly message: string; readonly errorCode: string };

/**
 * Project-owned handoff boundary. It deliberately exposes no provider runtime,
 * CLI process, credential, model, or provider API.
 */
export interface ClaudianAdapter {
	readonly id: 'claudian.workflow-handoff';
	availability(): Promise<ClaudianAvailability>;
	open(): Promise<ClaudianOpenResult>;
	handoff(request: AgentWorkflowRequest): Promise<ClaudianHandoffResult>;
}

export const CLAUDIAN_2_1_3_CAPABILITIES: ClaudianCapabilities = Object.freeze({
	openView: true,
	prefillPrompt: true,
	selectTarget: false,
	executionSignals: false,
});
