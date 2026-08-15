import { PAGE_DEFINITIONS, type PageDefinition, type PageId } from '../core/pages';
import { t, type LocaleResourceKey } from '../core/localization';

const PAGE_INDEX = new Map<PageId, number>(
	PAGE_DEFINITIONS.map(({ id }, index) => [id, index]),
);

export type DashboardNavigationKey =
	| 'ArrowLeft'
	| 'ArrowRight'
	| 'Home'
	| 'End';

export function pageForNavigationKey(
	current: PageId,
	key: string,
): PageId | null {
	if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return null;
	if (key === 'Home') return PAGE_DEFINITIONS[0]?.id ?? null;
	if (key === 'End') return PAGE_DEFINITIONS.at(-1)?.id ?? null;
	const currentIndex = PAGE_INDEX.get(current);
	if (currentIndex === undefined) return null;
	const offset = key === 'ArrowRight' ? 1 : -1;
	const nextIndex =
		(currentIndex + offset + PAGE_DEFINITIONS.length) % PAGE_DEFINITIONS.length;
	return PAGE_DEFINITIONS[nextIndex]?.id ?? null;
}

export interface DashboardPagePresentation extends PageDefinition {
	readonly description: string;
	readonly placeholder: string;
}

const PAGE_COPY: Readonly<Record<PageId, {
	readonly description: LocaleResourceKey;
	readonly placeholder: string;
}>> = Object.freeze({
	home: Object.freeze({
		description: 'page.home.description',
		placeholder: 'Home widgets will appear here as they are registered.',
	}),
	study: Object.freeze({
		description: 'page.study.description',
		placeholder: 'Study widgets will appear here as they are registered.',
	}),
	research: Object.freeze({
		description: 'page.research.description',
		placeholder: 'Research widgets will appear here as they are registered.',
	}),
	agent: Object.freeze({
		description: 'page.agent.description',
		placeholder: 'Agent controls are unavailable. Check Claudian compatibility and Widget visibility.',
	}),
});

export const DASHBOARD_PAGES: readonly DashboardPagePresentation[] = Object.freeze(
	PAGE_DEFINITIONS.map((page) =>
		Object.freeze({
			...page,
			...PAGE_COPY[page.id],
		}),
	),
);

export function getDashboardPage(pageId: PageId): DashboardPagePresentation {
	const source = DASHBOARD_PAGES.find(({ id }) => id === pageId);
	const page = source ? { ...source, description: t(PAGE_COPY[pageId].description) } : null;
	if (!page) {
		throw new Error(`Missing presentation for Dashboard page: ${pageId}`);
	}
	return page;
}
