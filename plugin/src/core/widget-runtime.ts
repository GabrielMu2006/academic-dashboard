import type { PersistedWidgetLayout } from './layout';
import type { PageId } from './pages';
import type { WidgetRegistry } from './widget-registry';
import type {
	WidgetDefinition,
	WidgetId,
	WidgetLifecycle,
	WidgetMountContext,
	WidgetState,
} from './widgets';

export interface WidgetSlot {
	readonly contentEl: HTMLElement;
	setState(state: WidgetState): void;
	remove(): void;
}

export interface WidgetPageHost {
	createSlot(
		layout: PersistedWidgetLayout,
		definition: WidgetDefinition | undefined,
	): WidgetSlot;
	clear(): void;
}

interface MountedWidget {
	readonly layout: PersistedWidgetLayout;
	readonly slot: WidgetSlot;
	readonly instance?: WidgetLifecycle;
}

function errorState(operation: 'create' | 'mount' | 'update'): WidgetState {
	return {
		status: 'error',
		message: `Widget could not ${operation}.`,
		code: `widget_${operation}_failed`,
	};
}

function createContext(
	widget: MountedWidget,
	pageId: PageId,
	canSetState: () => boolean = () => true,
): WidgetMountContext {
	return {
		widgetId: widget.layout.widgetId,
		pageId,
		size: widget.layout.size,
		contentEl: widget.slot.contentEl,
		setState: (state) => {
			if (canSetState()) widget.slot.setState(state);
		},
	};
}

export interface WidgetPageMountOptions {
	readonly signal?: AbortSignal;
}

export class WidgetPageSession {
	private destroyed = false;
	private readonly widgets = new Map<WidgetId, MountedWidget>();

	constructor(
		private readonly pageId: PageId,
		private readonly host: WidgetPageHost,
	) {}

	add(widget: MountedWidget): void {
		this.widgets.set(widget.layout.widgetId, widget);
	}

	async update(widgetId: WidgetId): Promise<boolean> {
		if (this.destroyed) return false;
		const widget = this.widgets.get(widgetId);
		if (!widget?.instance) return false;

		try {
			await widget.instance.update(createContext(widget, this.pageId));
			return true;
		} catch {
			widget.slot.setState(errorState('update'));
			return false;
		}
	}

	async destroy(): Promise<void> {
		if (this.destroyed) return;
		this.destroyed = true;

		for (const widget of this.widgets.values()) {
			try {
				await widget.instance?.destroy();
			} catch {
				// Cleanup continues so one broken widget cannot retain sibling ownership.
			}
			widget.slot.remove();
		}
		this.widgets.clear();
		this.host.clear();
	}

	isDestroyed(): boolean {
		return this.destroyed;
	}
}

export class WidgetRuntime {
	constructor(private readonly registry: WidgetRegistry) {}

	async mountPage(
		host: WidgetPageHost,
		pageId: PageId,
		layouts: readonly PersistedWidgetLayout[],
		options: WidgetPageMountOptions = {},
	): Promise<WidgetPageSession> {
		const session = new WidgetPageSession(pageId, host);
		const mountTasks: Promise<void>[] = [];
		const canSetState = (): boolean =>
			!session.isDestroyed() && options.signal?.aborted !== true;

		for (const layout of layouts) {
			if (layout.pageId !== pageId) continue;
			const registration = this.registry.get(layout.widgetId);
			const slot = host.createSlot(layout, registration?.definition);

			if (!registration) {
				session.add({ layout, slot });
				slot.setState({
					status: 'unavailable',
					reason: 'This widget is not currently registered.',
					recovery: 'Enable its adapter or remove it from this layout.',
				});
				continue;
			}

			if (!registration.definition.allowedPages.includes(pageId)) {
				session.add({ layout, slot });
				slot.setState({
					status: 'unavailable',
					reason: 'This widget is not available on this page.',
				});
				continue;
			}
			if (!registration.definition.allowedSizes.includes(layout.size)) {
				session.add({ layout, slot });
				slot.setState({
					status: 'unavailable',
					reason: 'This widget does not support the stored size.',
					recovery: 'Reset this widget to one of its supported fixed sizes.',
				});
				continue;
			}

			let instance: WidgetLifecycle;
			try {
				instance = registration.create();
			} catch {
				session.add({ layout, slot });
				slot.setState(errorState('create'));
				continue;
			}
			const widget: MountedWidget = { layout, slot, instance };
			session.add(widget);

			if (!canSetState()) continue;
			slot.setState({ status: 'loading' });
			mountTasks.push(
				Promise.resolve()
					.then(() => instance.mount(createContext(widget, pageId, canSetState)))
					.catch(() => {
						if (canSetState()) slot.setState(errorState('mount'));
					}),
			);
		}
		await Promise.all(mountTasks);

		return session;
	}
}
