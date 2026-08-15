import { describe, expect, it } from 'vitest';
import {
	CLAUDIAN_2_1_3_CAPABILITIES,
	type ClaudianAdapter,
} from '../../src/core/claudian';

describe('Claudian contract', () => {
	it('records the audited 2.1.3 compatibility limits', () => {
		expect(CLAUDIAN_2_1_3_CAPABILITIES).toEqual({
			openView: true,
			prefillPrompt: true,
			selectTarget: false,
			executionSignals: false,
		});
	});

	it('supports a review-first handoff without exposing runtime configuration', async () => {
		const adapter: ClaudianAdapter = {
			id: 'claudian.workflow-handoff',
			availability: async () => ({
				status: 'available',
				pluginVersion: '2.1.3',
				compatibility: 'verified',
				capabilities: CLAUDIAN_2_1_3_CAPABILITIES,
			}),
			open: async () => ({ status: 'opened', message: 'Claudian opened.' }),
			handoff: async (request) => ({
				status: 'ready-for-review',
				target: request.target,
				workflowId: request.workflowId,
				message: 'Review the prepared request in Claudian before sending.',
				requiresTargetConfirmation: true,
			}),
		};

		expect(
			await adapter.handoff({
				workflowId: 'summarize-current-note',
				target: 'codex',
				currentNotePath: 'Course/Week 1.md',
			}),
		).toMatchObject({
			status: 'ready-for-review',
			target: 'codex',
			requiresTargetConfirmation: true,
		});
	});
});
