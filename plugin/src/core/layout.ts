import { isPageId, PAGE_IDS, type PageId } from './pages';
import {
	isRecord,
	validationFailure,
	validationIssue,
	validationSuccess,
	type ValidationIssue,
	type ValidationResult,
} from './validation';
import {
	isWidgetId,
	isWidgetSize,
	type WidgetId,
	type WidgetSize,
} from './widgets';

export const LAYOUT_SCHEMA_VERSION = 3;

export interface PersistedWidgetLayout {
	readonly widgetId: WidgetId;
	readonly pageId: PageId;
	readonly x: number;
	readonly y: number;
	readonly size: WidgetSize;
}

export type PersistedPageLayouts = Readonly<
	Record<PageId, readonly PersistedWidgetLayout[]>
>;

export interface PersistedLayoutState {
	readonly schemaVersion: typeof LAYOUT_SCHEMA_VERSION;
	readonly pages: PersistedPageLayouts;
}

export interface LayoutRestoreOptions {
	readonly fallback?: PersistedLayoutState;
	readonly knownWidgetIds?: ReadonlySet<string>;
}

export interface LayoutRestoreResult {
	readonly value: PersistedLayoutState;
	readonly source: 'stored' | 'migrated' | 'fallback';
	readonly issues: readonly ValidationIssue[];
}

function freezePages(
	pages: Record<PageId, PersistedWidgetLayout[]>,
): PersistedPageLayouts {
	for (const pageId of PAGE_IDS) {
		pages[pageId] = Object.freeze([...pages[pageId]]) as PersistedWidgetLayout[];
	}
	return Object.freeze(pages);
}

function createEmptyPages(): Record<PageId, PersistedWidgetLayout[]> {
	return {
		home: [],
		study: [],
		research: [],
		agent: [],
	};
}

function cloneLayoutState(state: PersistedLayoutState): PersistedLayoutState {
	const pages = createEmptyPages();
	for (const pageId of PAGE_IDS) {
		pages[pageId] = state.pages[pageId].map((item) => Object.freeze({ ...item }));
	}
	return Object.freeze({
		schemaVersion: LAYOUT_SCHEMA_VERSION,
		pages: freezePages(pages),
	});
}

export const EMPTY_LAYOUT_STATE: PersistedLayoutState = cloneLayoutState({
	schemaVersion: LAYOUT_SCHEMA_VERSION,
	pages: {
		home: [],
		study: [],
		research: [],
		agent: [],
	},
});

function isCoordinate(value: unknown): value is number {
	return Number.isFinite(value) && Number.isInteger(value) && (value as number) >= 0;
}

function validatePages(
	input: unknown,
	legacyVersion: boolean,
	knownWidgetIds: ReadonlySet<string> | undefined,
): ValidationResult<PersistedPageLayouts> {
	if (!isRecord(input)) {
		return validationFailure([
			validationIssue(
				'invalid_pages',
				'layout.pages',
				'Expected page-specific layout arrays.',
			),
		]);
	}

	const issues: ValidationIssue[] = [];
	const parsedPages = createEmptyPages();

	for (const key of Object.keys(input)) {
		if (!isPageId(key)) {
			issues.push(
				validationIssue(
					'invalid_page_id',
					`layout.pages.${key}`,
					'Layout contains an unsupported page ID.',
				),
			);
		}
	}

	for (const pageId of PAGE_IDS) {
		const pageInput = input[pageId];
		if (!Array.isArray(pageInput)) {
			issues.push(
				validationIssue(
					'missing_page_layout',
					`layout.pages.${pageId}`,
					'Expected a layout array for every page.',
				),
			);
			continue;
		}

		const seenWidgetIds = new Set<string>();
		for (const [index, item] of pageInput.entries()) {
			const path = `layout.pages.${pageId}.${index}`;
			if (!isRecord(item)) {
				issues.push(
					validationIssue(
						'invalid_widget_layout',
						path,
						'Expected a widget layout object.',
					),
				);
				continue;
			}

			if (!isWidgetId(item.widgetId)) {
				issues.push(
					validationIssue(
						'invalid_widget_id',
						`${path}.widgetId`,
						'Expected a stable namespaced widget ID.',
					),
				);
			} else {
				if (seenWidgetIds.has(item.widgetId)) {
					issues.push(
						validationIssue(
							'duplicate_widget_id',
							`${path}.widgetId`,
							'Widget IDs must be unique within a page.',
						),
					);
				}
				seenWidgetIds.add(item.widgetId);

				if (knownWidgetIds && !knownWidgetIds.has(item.widgetId)) {
					issues.push(
						validationIssue(
							'unknown_widget_id',
							`${path}.widgetId`,
							'Layout references an unknown widget.',
						),
					);
				}
			}

			const itemPageId = legacyVersion ? pageId : item.pageId;
			if (!isPageId(itemPageId) || itemPageId !== pageId) {
				issues.push(
					validationIssue(
						'page_membership_mismatch',
						`${path}.pageId`,
						'Widget pageId must match its containing page.',
					),
				);
			}

			if (!isCoordinate(item.x)) {
				issues.push(
					validationIssue(
						'invalid_coordinate',
						`${path}.x`,
						'Coordinates must be finite non-negative integers.',
					),
				);
			}
			if (!isCoordinate(item.y)) {
				issues.push(
					validationIssue(
						'invalid_coordinate',
						`${path}.y`,
						'Coordinates must be finite non-negative integers.',
					),
				);
			}
			if (!isWidgetSize(item.size)) {
				issues.push(
					validationIssue(
						'invalid_size',
						`${path}.size`,
						'Expected a supported fixed widget size.',
					),
				);
			}

			if (
				isWidgetId(item.widgetId) &&
				isPageId(itemPageId) &&
				itemPageId === pageId &&
				isCoordinate(item.x) &&
				isCoordinate(item.y) &&
				isWidgetSize(item.size)
			) {
				parsedPages[pageId].push(
					Object.freeze({
						widgetId: item.widgetId,
						pageId,
						x: item.x,
						y: item.y,
						size: item.size,
					}),
				);
			}
		}
	}

	if (issues.length > 0) {
		return validationFailure(issues);
	}
	return validationSuccess(freezePages(parsedPages));
}

export function validatePersistedLayoutState(
	input: unknown,
	knownWidgetIds?: ReadonlySet<string>,
): ValidationResult<PersistedLayoutState> {
	if (!isRecord(input) || input.schemaVersion !== LAYOUT_SCHEMA_VERSION) {
		return validationFailure([
			validationIssue(
				'unsupported_layout_schema',
				'layout.schemaVersion',
				`Expected layout schema version ${LAYOUT_SCHEMA_VERSION}.`,
			),
		]);
	}

	const pages = validatePages(input.pages, false, knownWidgetIds);
	if (!pages.ok) {
		return validationFailure(pages.issues);
	}

	return validationSuccess(
		Object.freeze({
			schemaVersion: LAYOUT_SCHEMA_VERSION,
			pages: pages.value,
		}),
	);
}

export function migratePersistedLayoutState(
	input: unknown,
	knownWidgetIds?: ReadonlySet<string>,
): ValidationResult<PersistedLayoutState> {
	if (
		!isRecord(input) ||
		(input.schemaVersion !== 0 &&
			input.schemaVersion !== 1 &&
			input.schemaVersion !== 2)
	) {
		return validationFailure([
			validationIssue(
				'unsupported_layout_migration',
				'layout.schemaVersion',
				`Only layout schema versions 0, 1, and 2 can migrate to version ${LAYOUT_SCHEMA_VERSION}.`,
			),
		]);
	}

	const pages = validatePages(
		input.pages,
		input.schemaVersion === 0,
		knownWidgetIds,
	);
	if (!pages.ok) {
		return validationFailure(pages.issues);
	}

	return validationSuccess(
		Object.freeze({
			schemaVersion: LAYOUT_SCHEMA_VERSION,
			pages: pages.value,
		}),
	);
}

function trustedFallback(candidate: PersistedLayoutState | undefined): PersistedLayoutState {
	if (!candidate) {
		return cloneLayoutState(EMPTY_LAYOUT_STATE);
	}
	const validated = validatePersistedLayoutState(candidate);
	return validated.ok
		? cloneLayoutState(validated.value)
		: cloneLayoutState(EMPTY_LAYOUT_STATE);
}

export function restorePersistedLayoutState(
	input: unknown,
	options: LayoutRestoreOptions = {},
): LayoutRestoreResult {
	const fallback = trustedFallback(options.fallback);
	if (
		isRecord(input) &&
		(input.schemaVersion === 0 ||
			input.schemaVersion === 1 ||
			input.schemaVersion === 2)
	) {
		const migrated = migratePersistedLayoutState(input, options.knownWidgetIds);
		return migrated.ok
			? { value: migrated.value, source: 'migrated', issues: [] }
			: { value: fallback, source: 'fallback', issues: migrated.issues };
	}

	const validated = validatePersistedLayoutState(
		input,
		options.knownWidgetIds,
	);
	return validated.ok
		? { value: validated.value, source: 'stored', issues: [] }
		: { value: fallback, source: 'fallback', issues: validated.issues };
}
