import { describe, expect, it, vi } from 'vitest';
import { adapterAvailable } from '../../src/core/data-adapter';
import type { ReviewQueueItem } from '../../src/core/review-queue';
import { WidgetRegistry } from '../../src/core/widget-registry';
import type { WidgetMountContext, WidgetState } from '../../src/core/widgets';
import { registerReviewSessionWidget, ReviewSessionWidget, type ReviewSessionWidgetServices } from '../../src/widgets/review-session-widget';

class FakeElement {
	className = ''; textContent = ''; type = ''; title = ''; value = '';
	readonly children: FakeElement[] = []; readonly listeners = new Map<string, () => void>(); readonly attributes = new Map<string, string>();
	constructor(readonly tagName: string, readonly ownerDocument: FakeDocument) {}
	append(...children: FakeElement[]): void { this.children.push(...children); }
	replaceChildren(...children: FakeElement[]): void { this.children.length = 0; this.children.push(...children); }
	setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
	addEventListener(type: string, listener: () => void, options?: AddEventListenerOptions): void { this.listeners.set(type, listener); options?.signal?.addEventListener('abort', () => this.listeners.delete(type)); }
	click(): void { this.listeners.get('click')?.(); }
}
class FakeDocument { readonly win = this; createEl(tag: string): FakeElement { return new FakeElement(tag, this); } }
const review = (index: number): ReviewQueueItem => ({ path: `Course/${index}.md`, title: `Review ${index}`, kind: index % 2 ? 'note' : 'flashcard', dueCount: 1, totalCount: 1, course: index < 6 ? 'Math' : 'Biology', ...(index === 0 ? { reviewTarget: { line: 2, currentDate: '2026-09-01', sourceFingerprint: 'hash', sourceLine: '<!--SR:!2026-09-01-->' } } : {}) });
function services(overrides: Partial<ReviewSessionWidgetServices> = {}): ReviewSessionWidgetServices {
	return { now: () => new Date(2026, 8, 8), reviews: { id: 'reviews', availability: async () => adapterAvailable('native-vault'), query: async () => Array.from({ length: 12 }, (_, index) => review(index)) }, openNote: vi.fn(async () => undefined), reviewDate: vi.fn(async () => ({ outcome: 'committed', undoToken: 'u', path: 'Course/0.md' } as const)), ...overrides };
}
function mounted() { const document = new FakeDocument(); const content = new FakeElement('div', document); const states: WidgetState[] = []; return { content, states, context: { widgetId: 'study.review-session', pageId: 'study', size: 'large', contentEl: content as unknown as HTMLElement, setState: (state: WidgetState) => states.push(state) } satisfies WidgetMountContext }; }
const all = (root: FakeElement): FakeElement[] => root.children.flatMap((child) => [child, ...all(child)]);
const flush = async (): Promise<void> => { await Promise.resolve(); await Promise.resolve(); };

describe('ReviewSessionWidget', () => {
	it('starts at ten items and keeps viewed and skipped actions distinct', async () => {
		const widget = new ReviewSessionWidget(services()); const view = mounted(); widget.mount(view.context); await flush();
		all(view.content).find(({ textContent }) => textContent === 'Start session')?.click(); await flush();
		expect(all(view.content).filter(({ className }) => className === 'academic-dashboard-review-session__item')).toHaveLength(10);
		all(view.content).find(({ textContent }) => textContent === 'Mark viewed')?.click();
		all(view.content).filter(({ textContent }) => textContent === 'Skip')[1]?.click();
		const labels = all(view.content).map(({ textContent }) => textContent);
		expect(labels).toContain('Viewed this session'); expect(labels).toContain('Skipped');
	});

	it('opens source and updates a date only for an exact native target', async () => {
		const openNote = vi.fn(async () => undefined); const reviewDate = vi.fn(async () => ({ outcome: 'committed', undoToken: 'u', path: 'Course/0.md' } as const));
		const widget = new ReviewSessionWidget(services({ openNote, reviewDate })); const view = mounted(); widget.mount(view.context); await flush(); all(view.content).find(({ textContent }) => textContent === 'Start session')?.click(); await flush();
		all(view.content).find(({ textContent }) => textContent === 'Review 0')?.click(); expect(openNote).toHaveBeenCalledWith('Course/0.md');
		all(view.content).find(({ textContent }) => textContent === 'Review date')?.click(); await flush(); expect(reviewDate).toHaveBeenCalledWith(review(0), '2026-09-09');
	});

	it('registers the stable Study session ID', () => { const registry = new WidgetRegistry(); registerReviewSessionWidget(registry, services()); expect(registry.get('study.review-session')?.definition).toEqual(expect.objectContaining({ allowedPages: ['study'], defaultSize: 'large' })); });
});
