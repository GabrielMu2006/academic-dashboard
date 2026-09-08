import { describe, expect, it, vi } from 'vitest';
import { adapterAvailable } from '../../src/core/data-adapter';
import { WidgetRegistry } from '../../src/core/widget-registry';
import type { WidgetMountContext, WidgetState } from '../../src/core/widgets';
import { ReadingQueueWidget, registerReadingQueueWidget, type ReadingQueueWidgetServices } from '../../src/widgets/reading-queue-widget';

class FakeElement {
	className = ''; textContent = ''; type = ''; title = ''; value = ''; placeholder = '';
	readonly children: FakeElement[] = []; readonly listeners = new Map<string, () => void>();
	constructor(readonly tagName: string, readonly ownerDocument: FakeDocument) {}
	append(...children: FakeElement[]): void { this.children.push(...children); }
	replaceChildren(...children: FakeElement[]): void { this.children.length = 0; this.children.push(...children); }
	setAttribute(_name: string, _value: string): void {}
	addEventListener(type: string, listener: () => void, options?: AddEventListenerOptions): void { this.listeners.set(type, listener); options?.signal?.addEventListener('abort', () => this.listeners.delete(type)); }
	click(): void { this.listeners.get('click')?.(); }
}
class FakeDocument { readonly win = this; createEl(tag: string): FakeElement { return new FakeElement(tag, this); } }
const material = { path: 'Paper/One.md', kind: 'paper' as const, title: 'One', authors: ['A'], signature: '[paper]', status: 'reading' as const, order: 0, nextStep: 'Check proof', position: 'methods', positionUnit: 'stage' as const, association: 'path' as const };
function services(overrides: Partial<ReadingQueueWidgetServices> = {}): ReadingQueueWidgetServices {
	return { queue: { id: 'queue', availability: async () => adapterAvailable('native-vault'), query: async () => [material] }, getRecords: () => [], updateRecord: vi.fn(() => true), moveRecord: vi.fn(() => false), openNote: vi.fn(async () => undefined), subscribeToVaultChanges: () => () => undefined, ...overrides };
}
function mounted() {
	const document = new FakeDocument(); const content = new FakeElement('div', document); const states: WidgetState[] = [];
	return { content, states, context: { widgetId: 'research.reading-queue', pageId: 'research', size: 'large', contentEl: content as unknown as HTMLElement, setState: (state: WidgetState) => states.push(state) } satisfies WidgetMountContext };
}
const all = (root: FakeElement): FakeElement[] => root.children.flatMap((child) => [child, ...all(child)]);

describe('ReadingQueueWidget', () => {
	it('renders reading controls, opens the note, and saves plugin-side progress', async () => {
		const updateRecord = vi.fn(() => true); const openNote = vi.fn(async () => undefined);
		const widget = new ReadingQueueWidget(services({ updateRecord, openNote })); const view = mounted(); widget.mount(view.context); await Promise.resolve(); await Promise.resolve();
		const nodes = all(view.content); nodes.find(({ textContent }) => textContent === 'One')?.click(); expect(openNote).toHaveBeenCalledWith('Paper/One.md');
		nodes.find(({ textContent }) => textContent === 'Save')?.click(); expect(updateRecord).toHaveBeenCalledWith(material, expect.objectContaining({ nextStep: 'Check proof', position: 'methods', positionUnit: 'stage' }));
	});
	it('registers a large Research reading queue', () => { const registry = new WidgetRegistry(); registerReadingQueueWidget(registry, services()); expect(registry.get('research.reading-queue')?.definition).toEqual(expect.objectContaining({ allowedPages: ['research'], defaultSize: 'large' })); });
	it('passes the visible queue when manually moving an item', async () => {
		const second = { ...material, path: 'Paper/Two.md', title: 'Two', signature: '[paper-two]', order: 1 };
		const moveRecord = vi.fn(() => false);
		const widget = new ReadingQueueWidget(services({ queue: { id: 'queue', availability: async () => adapterAvailable('native-vault'), query: async () => [material, second] }, moveRecord }));
		const view = mounted(); widget.mount(view.context); await Promise.resolve(); await Promise.resolve();
		all(view.content).find(({ title }) => title === 'Move down')?.click();
		expect(moveRecord).toHaveBeenCalledWith(material, 1, [material, second]);
	});
});
