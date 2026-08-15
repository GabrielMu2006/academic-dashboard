import { describe, expect, it } from 'vitest';
import {
	isWidgetId,
	isWidgetSize,
	validateWidgetDefinition,
	type WidgetState,
} from '../../src/core/widgets';

const VALID_DEFINITION = {
	id: 'core.date-time',
	title: 'Date and time',
	allowedPages: ['home'],
	allowedSizes: ['small', 'medium'],
	defaultSize: 'small',
};

describe('widget identifiers and sizes', () => {
	it.each(['core.date-time', 'study.activity', 'agent.workflow-1']) (
		'accepts stable widget ID %s',
		(widgetId) => {
			expect(isWidgetId(widgetId)).toBe(true);
		},
	);

	it.each([
		'date-time',
		'Core.date-time',
		'core_date_time',
		'core.',
		'.date-time',
		'',
		42,
	])('rejects malformed widget ID %s', (widgetId) => {
		expect(isWidgetId(widgetId)).toBe(false);
	});

	it.each(['small', 'medium', 'large'])('accepts widget size %s', (size) => {
		expect(isWidgetSize(size)).toBe(true);
	});

	it.each(['tiny', '', null, 1])('rejects widget size %s', (size) => {
		expect(isWidgetSize(size)).toBe(false);
	});
});

describe('validateWidgetDefinition', () => {
	it('returns a normalized immutable definition without mutating its input', () => {
		const input = structuredClone(VALID_DEFINITION);
		const before = JSON.stringify(input);

		const result = validateWidgetDefinition(input);

		expect(result.ok).toBe(true);
		expect(JSON.stringify(input)).toBe(before);
		if (result.ok) {
			expect(result.value.title).toBe('Date and time');
			expect(Object.isFrozen(result.value)).toBe(true);
			expect(Object.isFrozen(result.value.allowedPages)).toBe(true);
			expect(Object.isFrozen(result.value.allowedSizes)).toBe(true);
		}
	});

	it.each([
		['invalid_widget_id', { ...VALID_DEFINITION, id: 'date-time' }],
		['invalid_title', { ...VALID_DEFINITION, title: '   ' }],
		['invalid_array', { ...VALID_DEFINITION, allowedPages: [] }],
		['invalid_value', { ...VALID_DEFINITION, allowedPages: ['home', 'tasks'] }],
		['duplicate_value', { ...VALID_DEFINITION, allowedPages: ['home', 'home'] }],
		['invalid_value', { ...VALID_DEFINITION, allowedSizes: ['small', 'tiny'] }],
		['duplicate_value', { ...VALID_DEFINITION, allowedSizes: ['small', 'small'] }],
		['invalid_size', { ...VALID_DEFINITION, defaultSize: 'tiny' }],
		[
			'default_size_not_allowed',
			{ ...VALID_DEFINITION, allowedSizes: ['medium'], defaultSize: 'small' },
		],
	] as const)('reports %s', (expectedCode, input) => {
		const result = validateWidgetDefinition(input);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues.map(({ code }) => code)).toContain(expectedCode);
		}
	});
});

describe('WidgetState', () => {
	it('represents every required state without Error objects', () => {
		const states: readonly WidgetState[] = [
			{ status: 'loading' },
			{ status: 'ready' },
			{ status: 'empty', message: 'No items' },
			{ status: 'unavailable', reason: 'Missing capability' },
			{ status: 'error', message: 'Could not load', code: 'load_failed' },
		];

		expect(states.map(({ status }) => status)).toEqual([
			'loading',
			'ready',
			'empty',
			'unavailable',
			'error',
		]);
		expect(
			states.some((state) =>
				Object.values(state).some((value: unknown) => value instanceof Error),
			),
		).toBe(false);
	});
});
