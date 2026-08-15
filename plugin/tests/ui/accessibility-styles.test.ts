import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { restoreStableFocus } from '../../src/ui/focus';

describe('product accessibility hardening', () => {
	it('restores focus to a stable successor and then to the initiator fallback', () => {
		const successorFocus = vi.fn();
		const fallbackFocus = vi.fn();
		const successor = { focus: successorFocus } as unknown as HTMLElement;
		const fallback = { focus: fallbackFocus } as unknown as HTMLElement;
		const root = {
			find: vi.fn(() => successor),
		} as unknown as HTMLElement;
		restoreStableFocus(root, '.successor', fallback);
		expect(successorFocus).toHaveBeenCalledOnce();

		(root as unknown as { find: () => null }).find = () => null;
		restoreStableFocus(root, '.missing', fallback);
		expect(fallbackFocus).toHaveBeenCalledOnce();
	});

	it('ships reduced-motion, increased-contrast, forced-colors, and focus rules', () => {
		const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
		expect(css).toContain('@media (prefers-reduced-motion: reduce)');
		expect(css).toContain('@media (prefers-contrast: more)');
		expect(css).toContain('@media (forced-colors: active)');
		expect(css).toContain(':focus-visible');
		expect(css).toContain('animation: none !important');
		expect(css).toContain('outline: 3px solid Highlight');
	});

	it('keeps Agent selects compact inside their column flex fields', () => {
		const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
		expect(css).toContain('.academic-dashboard-agent-form select.academic-dashboard-filter');
		expect(css).toContain('flex: 0 0 30px;');
	});
});
