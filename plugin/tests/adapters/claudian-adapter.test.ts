import { describe, expect, it, vi } from 'vitest';
import {
	ClaudianWorkflowAdapter,
	type ClaudianCompatibilityPort,
} from '../../src/adapters/claudian-adapter';

function port(
	overrides: Partial<ClaudianCompatibilityPort> = {},
): ClaudianCompatibilityPort {
	return {
		installedVersion: () => '2.1.3',
		loadedPlugin: () => ({
			activateView: () => undefined,
			getView: () => ({ appendToActiveInput: () => true }),
		}),
		...overrides,
	};
}

describe('ClaudianWorkflowAdapter', () => {
	it('distinguishes missing, disabled, and capability-available states', async () => {
		expect(
			await new ClaudianWorkflowAdapter(port({ installedVersion: () => null })).availability(),
		).toMatchObject({ status: 'unavailable', reason: 'not-installed' });
		expect(
			await new ClaudianWorkflowAdapter(port({ loadedPlugin: () => null })).availability(),
		).toMatchObject({ status: 'unavailable', reason: 'disabled' });
		expect(
			await new ClaudianWorkflowAdapter(
				port({ loadedPlugin: () => ({}) }),
			).availability(),
		).toMatchObject({
			status: 'unavailable',
			reason: 'missing-handoff-capability',
		});
		expect(await new ClaudianWorkflowAdapter(port()).availability()).toEqual({
			status: 'available',
			pluginVersion: '2.1.3',
			compatibility: 'verified',
			capabilities: {
				openView: true,
				prefillPrompt: true,
				selectTarget: false,
				executionSignals: false,
			},
		});
	});

	it('opens Claudian, prefills the public composer, and never auto-submits', async () => {
		const activateView = vi.fn();
		const appendToActiveInput = vi.fn((text: string) => text.length > 0);
		const focusActiveInput = vi.fn();
		const adapter = new ClaudianWorkflowAdapter(
			port({
				loadedPlugin: () => ({
					activateView,
					getView: () => ({ appendToActiveInput, focusActiveInput }),
				}),
			}),
		);

		const result = await adapter.handoff({
			workflowId: 'summarize-current-note',
			target: 'opencode',
			currentNotePath: 'Course/Week 1.md',
		});

		expect(activateView).toHaveBeenCalledOnce();
		expect(appendToActiveInput).toHaveBeenCalledOnce();
		expect(appendToActiveInput.mock.calls[0]?.[0]).toContain(
			'Requested Claudian target: OpenCode.',
		);
		expect(focusActiveInput).toHaveBeenCalledOnce();
		expect(result).toMatchObject({
			status: 'ready-for-review',
			requiresTargetConfirmation: true,
		});
	});

	it('provides an open-only entry point through the same adapter', async () => {
		const activateView = vi.fn();
		const adapter = new ClaudianWorkflowAdapter(
			port({
				loadedPlugin: () => ({ activateView, getView: () => null }),
			}),
		);
		expect(await adapter.open()).toEqual({
			status: 'opened',
			message: 'Claudian opened.',
		});
		expect(activateView).toHaveBeenCalledOnce();
	});

	it('fails softly when the request or composer is unavailable', async () => {
		const adapter = new ClaudianWorkflowAdapter(port());
		expect(
			await adapter.handoff({
				workflowId: 'answer-from-vault',
				target: 'codex',
			}),
		).toMatchObject({ status: 'failed', errorCode: 'request-invalid' });

		const noComposer = new ClaudianWorkflowAdapter(
			port({
				loadedPlugin: () => ({
					activateView: () => undefined,
					getView: () => ({}),
				}),
			}),
		);
		expect(
			await noComposer.handoff({
				workflowId: 'answer-from-vault',
				target: 'codex',
				userInput: 'What is active recall?',
			}),
		).toMatchObject({ status: 'opened-without-prefill' });
	});
});
