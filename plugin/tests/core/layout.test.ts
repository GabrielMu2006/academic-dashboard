import { describe, expect, it } from 'vitest';
import {
	EMPTY_LAYOUT_STATE,
	migratePersistedLayoutState,
	restorePersistedLayoutState,
	validatePersistedLayoutState,
} from '../../src/core/layout';

function emptyPages(): Record<string, unknown[]> {
	return { home: [], study: [], research: [], agent: [] };
}

function validLayout(): Record<string, unknown> {
	return {
		schemaVersion: 3,
		pages: {
			...emptyPages(),
			home: [
				{
					widgetId: 'core.date-time',
					pageId: 'home',
					x: 0,
					y: 1,
					size: 'small',
				},
			],
		},
	};
}

describe('validatePersistedLayoutState', () => {
	it('accepts, clones, and freezes valid page-specific state', () => {
		const input = validLayout();
		const before = JSON.stringify(input);

		const result = validatePersistedLayoutState(input);

		expect(result.ok).toBe(true);
		expect(JSON.stringify(input)).toBe(before);
		if (result.ok) {
			expect(result.value.pages.home[0]).toEqual({
				widgetId: 'core.date-time',
				pageId: 'home',
				x: 0,
				y: 1,
				size: 'small',
			});
			expect(Object.isFrozen(result.value)).toBe(true);
			expect(Object.isFrozen(result.value.pages.home)).toBe(true);
		}
	});

	it.each([
		['unsupported_layout_schema', null],
		['unsupported_layout_schema', { schemaVersion: 4, pages: emptyPages() }],
		['invalid_pages', { schemaVersion: 3, pages: [] }],
		[
			'missing_page_layout',
			{ schemaVersion: 3, pages: { home: [], study: [], research: [] } },
		],
		[
			'invalid_page_id',
			{ schemaVersion: 3, pages: { ...emptyPages(), tasks: [] } },
		],
	] as const)('reports %s for malformed roots', (expectedCode, input) => {
		const result = validatePersistedLayoutState(input);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues.map(({ code }) => code)).toContain(expectedCode);
		}
	});

	it.each([
		['invalid_widget_id', { widgetId: 'clock' }],
		['page_membership_mismatch', { pageId: 'study' }],
		['invalid_coordinate', { x: -1 }],
		['invalid_coordinate', { y: 1.5 }],
		['invalid_coordinate', { x: Number.POSITIVE_INFINITY }],
		['invalid_size', { size: 'tiny' }],
	] as const)('reports %s for malformed widget layouts', (expectedCode, patch) => {
		const input = validLayout();
		const first = (input.pages as Record<string, Record<string, unknown>[]>).home?.[0];
		expect(first).toBeDefined();
		if (!first) return;
		Object.assign(first, patch);
		const result = validatePersistedLayoutState(input);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues.map(({ code }) => code)).toContain(expectedCode);
		}
	});

	it('rejects duplicate widget IDs within one page', () => {
		const input = validLayout();
		const home = (input.pages as Record<string, Record<string, unknown>[]>).home;
		expect(home?.[0]).toBeDefined();
		if (!home?.[0]) return;
		home.push({ ...home[0] });

		const result = validatePersistedLayoutState(input);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues.map(({ code }) => code)).toContain('duplicate_widget_id');
		}
	});

	it('optionally rejects widgets outside the known registry', () => {
		const result = validatePersistedLayoutState(
			validLayout(),
			new Set(['core.quote']),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues.map(({ code }) => code)).toContain('unknown_widget_id');
		}
	});
});

describe('layout migrations and recovery', () => {
	it('migrates version 0 by deriving page membership without mutating input', () => {
		const input = {
			schemaVersion: 0,
			pages: {
				...emptyPages(),
				home: [
					{ widgetId: 'core.date-time', x: 2, y: 3, size: 'medium' },
				],
			},
		};
		const before = JSON.stringify(input);

		const result = migratePersistedLayoutState(input);

		expect(result.ok).toBe(true);
		expect(JSON.stringify(input)).toBe(before);
		if (result.ok) {
			expect(result.value.schemaVersion).toBe(3);
			expect(result.value.pages.home[0]?.pageId).toBe('home');
		}
	});

	it('migrates version 1 while preserving explicit page membership and positions', () => {
		const input = { ...validLayout(), schemaVersion: 1 };
		const result = migratePersistedLayoutState(input);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.schemaVersion).toBe(3);
			expect(result.value.pages.home[0]).toEqual(
				expect.objectContaining({ pageId: 'home', x: 0, y: 1, size: 'small' }),
			);
		}
	});

	it('migrates the intermediate version 2 layout without mutating it', () => {
		const input = { ...validLayout(), schemaVersion: 2 };
		const before = JSON.stringify(input);
		const result = migratePersistedLayoutState(input);

		expect(result.ok).toBe(true);
		expect(JSON.stringify(input)).toBe(before);
		if (result.ok) expect(result.value.schemaVersion).toBe(3);
	});

	it('returns a custom fallback and diagnostics for invalid stored state', () => {
		const fallbackResult = validatePersistedLayoutState(validLayout());
		expect(fallbackResult.ok).toBe(true);
		if (!fallbackResult.ok) return;

		const restored = restorePersistedLayoutState(
			{ schemaVersion: 9, pages: emptyPages() },
			{ fallback: fallbackResult.value },
		);

		expect(restored.source).toBe('fallback');
		expect(restored.value).toEqual(fallbackResult.value);
		expect(restored.value).not.toBe(fallbackResult.value);
		expect(restored.issues).not.toHaveLength(0);
	});

	it('uses the safe empty default when no fallback is supplied', () => {
		const restored = restorePersistedLayoutState('invalid');
		expect(restored.source).toBe('fallback');
		expect(restored.value).toEqual(EMPTY_LAYOUT_STATE);
	});
});
