import { describe, expect, it, vi } from 'vitest';
import { buildWeeklyReviewDraft } from '../../src/core/weekly-review';
import { WidgetRegistry } from '../../src/core/widget-registry';
import type { WidgetMountContext, WidgetState } from '../../src/core/widgets';
import { registerWeeklyReviewWidget, WeeklyReviewWidget, type WeeklyReviewWidgetServices } from '../../src/widgets/weekly-review-widget';

class FakeElement {
	className = ''; textContent = ''; type = ''; value = ''; disabled = false; spellcheck = false;
	readonly children: FakeElement[] = []; readonly listeners = new Map<string, () => void>();
	constructor(readonly tagName: string, readonly ownerDocument: FakeDocument) {}
	append(...children: FakeElement[]): void { this.children.push(...children); }
	replaceChildren(...children: FakeElement[]): void { this.children.length = 0; this.children.push(...children); }
	setAttribute(_name: string, _value: string): void {}
	addEventListener(type: string, listener: () => void, options?: AddEventListenerOptions): void { this.listeners.set(type, listener); options?.signal?.addEventListener('abort', () => this.listeners.delete(type)); }
	click(): void { this.listeners.get('click')?.(); }
}
class FakeDocument { readonly win = this; createEl(tag: string): FakeElement { return new FakeElement(tag, this); } }
const draft = buildWeeklyReviewDraft({ now: new Date(2026, 8, 8), files: [], localWrites: [], agentWrites: [] });
function services(overrides: Partial<WeeklyReviewWidgetServices> = {}): WeeklyReviewWidgetServices { return { loadDraft: vi.fn(async () => draft), reviewAndCreate: vi.fn(async () => 'cancelled' as const), ...overrides }; }
function mounted() { const document = new FakeDocument(); const content = new FakeElement('div', document); const states: WidgetState[] = []; return { content, states, context: { widgetId: 'home.weekly-review', pageId: 'home', size: 'large', contentEl: content as unknown as HTMLElement, setState: (state: WidgetState) => states.push(state) } satisfies WidgetMountContext }; }
const all = (root: FakeElement): FakeElement[] => root.children.flatMap((child) => [child, ...all(child)]);
const flush = async (): Promise<void> => { await Promise.resolve(); await Promise.resolve(); };

describe('WeeklyReviewWidget', () => {
	it('keeps the full draft editable and sends the edited text for review', async () => {
		const reviewAndCreate = vi.fn(async () => 'cancelled' as const); const widget = new WeeklyReviewWidget(services({ reviewAndCreate })); const view = mounted();
		widget.mount(view.context); await flush(); const editor = all(view.content).find(({ tagName }) => tagName === 'textarea')!;
		editor.value = '# My edited review'; all(view.content).find(({ textContent }) => textContent === 'Review creation')?.click(); await flush();
		expect(reviewAndCreate).toHaveBeenCalledWith(draft, '# My edited review');
	});

	it('registers a stable large Home widget', () => {
		const registry = new WidgetRegistry(); registerWeeklyReviewWidget(registry, services());
		expect(registry.get('home.weekly-review')?.definition).toEqual(expect.objectContaining({ allowedPages: ['home'], defaultSize: 'large' }));
	});
});
