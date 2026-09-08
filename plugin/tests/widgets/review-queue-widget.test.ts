import { describe, expect, it, vi } from 'vitest';
import { adapterFallback } from '../../src/core/data-adapter';
import { WidgetRegistry } from '../../src/core/widget-registry';
import type { WidgetMountContext, WidgetState } from '../../src/core/widgets';
import {
	ReviewQueueWidget,
	registerReviewQueueWidget,
	type ReviewQueueWidgetServices,
} from '../../src/widgets/review-queue-widget';

class FakeElement {
	className = '';
	textContent = '';
	type = '';
	title = '';
	value = '';
	placeholder = '';
	readonly children: FakeElement[] = [];
	readonly listeners = new Map<string, () => void>();
	readonly attributes = new Map<string, string>();

	constructor(readonly ownerDocument: FakeDocument) {}
	append(...children: FakeElement[]): void { this.children.push(...children); }
	replaceChildren(...children: FakeElement[]): void {
		this.children.length = 0;
		this.children.push(...children);
	}
	addEventListener(type: string, listener: () => void, options?: AddEventListenerOptions): void {
		this.listeners.set(type, listener);
		options?.signal?.addEventListener('abort', () => this.listeners.delete(type));
	}
	setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
	click(): void { this.listeners.get('click')?.(); }
	change(): void { this.listeners.get('change')?.(); }
}

class FakeDocument {
	readonly win = this;
	createEl(): FakeElement { return new FakeElement(this); }
}

function mounted() {
	const document = new FakeDocument();
	const content = new FakeElement(document);
	const states: WidgetState[] = [];
	return {
		content,
		states,
		context: {
			widgetId: 'study.review-queue',
			pageId: 'study',
			size: 'medium',
			contentEl: content as unknown as HTMLElement,
			setState: (state: WidgetState) => states.push(state),
		} satisfies WidgetMountContext,
	};
}

function services(
	overrides: Partial<ReviewQueueWidgetServices> = {},
): ReviewQueueWidgetServices {
	return {
		now: () => new Date(2026, 7, 11),
		reviews: {
			id: 'spaced-repetition.review-queue',
			availability: async () =>
				adapterFallback(
					'optional-plugin',
					'Spaced Repetition is not installed.',
					'native-vault.review-queue',
				),
			query: async () => [
				{ path: 'Cards/memory.md', title: 'memory', kind: 'flashcard', dueCount: 2, totalCount: 3 },
			],
		},
		openNote: vi.fn(async () => undefined),
		reviewDate: vi.fn(async () => ({ outcome: 'cancelled' as const })),
		undoReviewDate: vi.fn(async () => undefined),
		getReviewUndos: () => [],
		...overrides,
	};
}

describe('Review Queue Widget', () => {
	it('renders and navigates Native fallback review items', async () => {
		const openNote = vi.fn(async () => undefined);
		const target = mounted();
		await new ReviewQueueWidget(services({ openNote })).mount(target.context);

		expect(target.states.at(-1)).toEqual({ status: 'ready' });
		expect(target.content.children[1]?.textContent).toBe('Native Markdown fallback');
		const button = target.content.children[2]?.children[0]?.children[0];
		expect(button?.children[1]?.textContent).toBe('2 of 3 cards due');
		button?.click();
		expect(openNote).toHaveBeenCalledWith('Cards/memory.md');
	});

	it('reviews one exact Native marker and exposes session Undo', async () => {
		let undos: readonly { readonly token: string; readonly path: string }[] = [];
		const reviewDate = vi.fn(async () => {
			undos = [{ token: 'session-review-1', path: 'Course/notes.md' }];
			return {
				outcome: 'committed' as const,
				undoToken: 'session-review-1',
				path: 'Course/notes.md',
			};
		});
		const undoReviewDate = vi.fn(async () => { undos = []; });
		const target = mounted();
		const reviewItem = {
			path: 'Course/notes.md',
			title: 'notes',
			kind: 'note' as const,
			dueCount: 1,
			totalCount: 1,
			reviewTarget: {
				line: 3,
				currentDate: '2026-08-10',
				sourceFingerprint: 'v1-source',
				sourceLine: 'Question <!--SR:!2026-08-10-->',
			},
		};
		const reviewServices = services({
			reviews: { ...services().reviews, query: async () => [reviewItem] },
			reviewDate,
			undoReviewDate,
			getReviewUndos: () => undos,
		});
		await new ReviewQueueWidget(reviewServices).mount(target.context);
		const row = target.content.children[2]?.children[0];
		const controls = row?.children[1];
		const select = controls?.children[0];
		if (select) select.value = '2026-08-12';
		controls?.children[1]?.click();

		await vi.waitFor(() => expect(reviewDate).toHaveBeenCalledWith(reviewItem, '2026-08-12'));
		await vi.waitFor(() => expect(target.content.children[1]?.className).toBe('academic-dashboard-task-undo'));
		target.content.children[1]?.children[1]?.click();
		await vi.waitFor(() => expect(undoReviewDate).toHaveBeenCalledWith('session-review-1'));
	});

	it('does not expose review writes for optional-plugin results', async () => {
		const reviewDate = vi.fn(async () => ({ outcome: 'cancelled' as const }));
		const target = mounted();
		await new ReviewQueueWidget(services({
			reviewDate,
			reviews: {
				...services().reviews,
				availability: async () => ({ status: 'available', source: 'optional-plugin' }),
				query: async () => [{
					path: 'Plugin/card.md', title: 'card', kind: 'note', dueCount: 1, totalCount: 1,
					reviewTarget: {
						line: 1,
						currentDate: '2026-08-10',
						sourceFingerprint: 'v1-source',
						sourceLine: 'Question <!--SR:!2026-08-10-->',
					},
				}],
			},
		})).mount(target.context);

		expect(target.content.children[1]?.children[0]?.children).toHaveLength(1);
		expect(reviewDate).not.toHaveBeenCalled();
	});

	it('shows a specific empty fallback state', async () => {
		const target = mounted();
		await new ReviewQueueWidget(
			services({ reviews: { ...services().reviews, query: async () => [] } }),
		).mount(target.context);
		expect(target.states.at(-1)).toEqual({
			status: 'empty',
			message: 'No Native Markdown reviews or flashcards are due.',
		});
	});

	it('passes Study filters into the review adapter query', async () => {
		const query = vi.fn(async () => services().reviews.query({
			date: '2026-08-11',
			limit: 20,
		}));
		const target = mounted();
		await new ReviewQueueWidget(
			services({ reviews: { ...services().reviews, query } }),
		).mount(target.context);
		const kind = target.content.children[0]?.children[1];
		if (kind) {
			kind.value = 'note';
			kind.change();
		}
		await vi.waitFor(() => {
			expect(query).toHaveBeenLastCalledWith(
				expect.objectContaining({ kind: 'note', limit: 20 }),
			);
		});
	});

	it('registers the pre-allocated Study Widget ID', () => {
		const registry = new WidgetRegistry();
		registerReviewQueueWidget(registry, services());
		expect(registry.definitions().map(({ id }) => id)).toEqual(['study.review-queue']);
	});
});
