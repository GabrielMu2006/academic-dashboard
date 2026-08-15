import { isPageId, type PageId } from './pages';
import {
	isRecord,
	validationFailure,
	validationIssue,
	validationSuccess,
	type ValidationIssue,
	type ValidationResult,
} from './validation';

export const WIDGET_SIZES = ['small', 'medium', 'large'] as const;

export type WidgetSize = (typeof WIDGET_SIZES)[number];
export type WidgetId = string;

export interface WidgetDefinition {
	readonly id: WidgetId;
	readonly title: string;
	readonly allowedPages: readonly PageId[];
	readonly allowedSizes: readonly WidgetSize[];
	readonly defaultSize: WidgetSize;
}

export interface WidgetContext {
	readonly widgetId: WidgetId;
	readonly pageId: PageId;
	readonly size: WidgetSize;
}

export interface WidgetMountContext extends WidgetContext {
	readonly contentEl: HTMLElement;
	setState(state: WidgetState): void;
}

export interface WidgetLifecycle {
	mount(context: WidgetMountContext): void | Promise<void>;
	update(context: WidgetMountContext): void | Promise<void>;
	destroy(): void | Promise<void>;
}

export interface WidgetRegistration {
	readonly definition: WidgetDefinition;
	create(): WidgetLifecycle;
}

export type WidgetState =
	| { readonly status: 'loading'; readonly message?: string }
	| { readonly status: 'ready' }
	| { readonly status: 'empty'; readonly message: string }
	| {
			readonly status: 'unavailable';
			readonly reason: string;
			readonly recovery?: string;
	  }
	| {
			readonly status: 'error';
			readonly message: string;
			readonly code?: string;
	  };

const WIDGET_SIZE_SET: ReadonlySet<string> = new Set(WIDGET_SIZES);
const WIDGET_ID_PATTERN =
	/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+$/;
const MAX_WIDGET_ID_LENGTH = 80;

export function isWidgetSize(value: unknown): value is WidgetSize {
	return typeof value === 'string' && WIDGET_SIZE_SET.has(value);
}

/**
 * Widget IDs are stable, lowercase, namespaced identifiers such as
 * `core.date-time`. A namespace separator is required to discourage generic
 * IDs that are likely to collide.
 */
export function isWidgetId(value: unknown): value is WidgetId {
	return (
		typeof value === 'string' &&
		value.length <= MAX_WIDGET_ID_LENGTH &&
		WIDGET_ID_PATTERN.test(value)
	);
}

function readUniqueArray<T extends string>(
	value: unknown,
	path: string,
	isValid: (candidate: unknown) => candidate is T,
	issues: ValidationIssue[],
): readonly T[] | null {
	if (!Array.isArray(value) || value.length === 0) {
		issues.push(
			validationIssue(
				'invalid_array',
				path,
				'Expected a non-empty array.',
			),
		);
		return null;
	}

	const parsed: T[] = [];
	const seen = new Set<T>();
	for (const [index, candidate] of value.entries()) {
		if (!isValid(candidate)) {
			issues.push(
				validationIssue(
					'invalid_value',
					`${path}.${index}`,
					'Array contains an unsupported value.',
				),
			);
			continue;
		}

		if (seen.has(candidate)) {
			issues.push(
				validationIssue(
					'duplicate_value',
					`${path}.${index}`,
					'Array values must be unique.',
				),
			);
			continue;
		}

		seen.add(candidate);
		parsed.push(candidate);
	}

	return Object.freeze(parsed);
}

export function validateWidgetDefinition(
	input: unknown,
): ValidationResult<WidgetDefinition> {
	if (!isRecord(input)) {
		return validationFailure([
			validationIssue(
				'invalid_type',
				'widget',
				'Expected a widget definition object.',
			),
		]);
	}

	const issues: ValidationIssue[] = [];
	if (!isWidgetId(input.id)) {
		issues.push(
			validationIssue(
				'invalid_widget_id',
				'widget.id',
				'Expected a lowercase namespaced widget ID.',
			),
		);
	}

	if (typeof input.title !== 'string' || input.title.trim().length === 0) {
		issues.push(
			validationIssue(
				'invalid_title',
				'widget.title',
				'Expected a non-empty widget title.',
			),
		);
	}

	const allowedPages = readUniqueArray(
		input.allowedPages,
		'widget.allowedPages',
		isPageId,
		issues,
	);
	const allowedSizes = readUniqueArray(
		input.allowedSizes,
		'widget.allowedSizes',
		isWidgetSize,
		issues,
	);

	if (!isWidgetSize(input.defaultSize)) {
		issues.push(
			validationIssue(
				'invalid_size',
				'widget.defaultSize',
				'Expected a supported default widget size.',
			),
		);
	} else if (allowedSizes && !allowedSizes.includes(input.defaultSize)) {
		issues.push(
			validationIssue(
				'default_size_not_allowed',
				'widget.defaultSize',
				'Default size must appear in allowedSizes.',
			),
		);
	}

	if (issues.length > 0 || !allowedPages || !allowedSizes) {
		return validationFailure(issues);
	}

	return validationSuccess(
		Object.freeze({
			id: input.id as WidgetId,
			title: (input.title as string).trim(),
			allowedPages,
			allowedSizes,
			defaultSize: input.defaultSize as WidgetSize,
		}),
	);
}
