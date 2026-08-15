import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

const REQUIRED_PUBLIC_ROLES = [
	'--academic-dashboard-shell',
	'--academic-dashboard-toolbar',
	'--academic-dashboard-panel',
	'--academic-dashboard-panel-elevated',
	'--academic-dashboard-surface-hover',
	'--academic-dashboard-surface-active',
	'--academic-dashboard-surface-inset',
	'--academic-dashboard-reading-surface',
	'--academic-dashboard-text',
	'--academic-dashboard-text-muted',
	'--academic-dashboard-text-faint',
	'--academic-dashboard-border',
	'--academic-dashboard-border-strong',
	'--academic-dashboard-divider',
	'--academic-dashboard-accent',
	'--academic-dashboard-accent-hover',
	'--academic-dashboard-accent-soft',
	'--academic-dashboard-accent-strong',
	'--academic-dashboard-focus',
	'--academic-dashboard-info',
	'--academic-dashboard-success',
	'--academic-dashboard-warning',
	'--academic-dashboard-error',
	'--academic-dashboard-favorite',
	'--academic-dashboard-shadow-panel',
	'--academic-dashboard-shadow-toolbar',
	'--academic-dashboard-shadow-edit',
	'--academic-dashboard-radius-xs',
	'--academic-dashboard-radius-sm',
	'--academic-dashboard-radius-md',
	'--academic-dashboard-radius-lg',
	'--academic-dashboard-radius-toolbar',
	'--academic-dashboard-space-page',
	'--academic-dashboard-space-panel',
] as const;

describe('theme-aware visual system', () => {
	it('publishes every required Dashboard role on the view root', () => {
		const rootRule = css.slice(0, css.indexOf('\n}'));
		for (const role of REQUIRED_PUBLIC_ROLES) {
			expect(rootRule, role).toContain(`${role}:`);
		}
	});

	it('contains no component-owned raw color literals or legacy brand endpoints', () => {
		expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
		expect(css).not.toMatch(/\b(?:rgb|hsl)a?\(/u);
		expect(css).not.toContain('--academic-dashboard-accent-start');
		expect(css).not.toContain('--academic-dashboard-accent-end');
	});

	it('routes host color variables through the public Dashboard contract', () => {
		const directHostColor =
			/var\(--(?:background|text|interactive|color)-[a-z0-9-]+/iu;
		const declarations = css
			.split(';')
			.filter((declaration) => directHostColor.test(declaration));

		for (const declaration of declarations) {
			expect(declaration).toMatch(/--academic-dashboard-[a-z0-9-]+\s*:/iu);
		}
	});

	it('covers material fallbacks and non-default accessibility modes', () => {
		expect(css).toContain('@supports not ((-webkit-backdrop-filter: blur(1px))');
		expect(css).toContain('@media (prefers-reduced-transparency: reduce)');
		expect(css).toContain("[data-widget-state='loading']");
		expect(css).toContain("[data-widget-state='empty']");
		expect(css).toContain("[data-widget-state='unavailable']");
		expect(css).toContain("[data-widget-state='error']");
		expect(css).toContain('@media (forced-colors: active)');
	});
});
