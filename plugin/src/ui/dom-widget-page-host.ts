import type { PersistedWidgetLayout } from '../core/layout';
import type {
	WidgetPageHost,
	WidgetSlot,
} from '../core/widget-runtime';
import type { WidgetDefinition, WidgetState } from '../core/widgets';
import type { LayoutEngineItem } from '../layout/layout-engine';
import { localizeElementTree, t, translateEnglishSource } from '../core/localization';

function fallbackTitle(widgetId: string): string {
	return (
		widgetId
			.split('.')
			.at(-1)
			?.split('-')
			.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
			.join(' ') ?? widgetId
	);
}

export class DomWidgetPageHost implements WidgetPageHost {
	private readonly items: LayoutEngineItem[] = [];

	constructor(private readonly container: HTMLElement) {}

	createSlot(
		layout: PersistedWidgetLayout,
		definition: WidgetDefinition | undefined,
	): WidgetSlot {
		const document = this.container.ownerDocument;
		const item = document.createElement('article');
		const card = document.createElement('div');
		card.className = 'academic-dashboard-widget-card';
		const title = document.createElement('h3');
		title.className = 'academic-dashboard-widget-card__title';
		title.textContent = translateEnglishSource(
			definition?.title ?? fallbackTitle(layout.widgetId),
		);
		item.dataset.widgetTitle = title.textContent;
		const status = document.createElement('div');
		status.className = 'academic-dashboard-widget-card__status';
		status.setAttribute('aria-live', 'polite');
		const content = document.createElement('div');
		content.className = 'academic-dashboard-widget-card__content';
		card.append(title, status, content);
		item.append(card);
		this.container.append(item);
		this.items.push({
			layout,
			element: item,
			allowedSizes: definition?.allowedSizes ?? [layout.size],
		});

		return {
			contentEl: content,
			setState: (state) => this.renderState(item, status, state),
			remove: () => item.remove(),
		};
	}

	getLayoutItems(): readonly LayoutEngineItem[] {
		return Object.freeze([...this.items]);
	}

	clear(): void {
		this.items.length = 0;
		this.container.replaceChildren();
	}

	private renderState(
		item: HTMLElement,
		status: HTMLElement,
		state: WidgetState,
	): void {
		item.setAttribute('data-widget-state', state.status);
		localizeElementTree(item);
		status.replaceChildren();
		if (state.status === 'ready') {
			status.hidden = true;
			return;
		}
		status.hidden = false;
		const message = item.ownerDocument.createElement('p');
		message.className = 'academic-dashboard-widget-card__message';
		if (state.status === 'loading') {
			message.textContent = state.message ?? t('widget.loading');
		} else if (state.status === 'empty') {
			message.textContent = translateEnglishSource(state.message);
		} else if (state.status === 'unavailable') {
			const reason = translateEnglishSource(state.reason);
			const recovery = state.recovery
				? translateEnglishSource(state.recovery)
				: undefined;
			message.textContent = recovery ? `${reason} ${recovery}` : reason;
		} else {
			message.textContent = translateEnglishSource(state.message);
		}
		status.append(message);
	}
}
