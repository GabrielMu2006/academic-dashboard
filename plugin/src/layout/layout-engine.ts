import type { PersistedWidgetLayout } from '../core/layout';
import type { WidgetSize } from '../core/widgets';

export interface LayoutEngineItem {
	readonly layout: PersistedWidgetLayout;
	readonly element: HTMLElement;
	readonly allowedSizes: readonly WidgetSize[];
}

export type LayoutChangeListener = (
	layouts: readonly PersistedWidgetLayout[],
) => void;

/**
 * Project-owned boundary for draggable layout implementations. Concrete
 * libraries must not leak types through this interface.
 */
export interface LayoutEngine {
	mount(container: HTMLElement): void;
	setItems(items: readonly LayoutEngineItem[]): void;
	canEditCanonical(): boolean;
	enableEditing(enabled: boolean): void;
	subscribeToChange(listener: LayoutChangeListener): () => void;
	destroy(): void;
}
