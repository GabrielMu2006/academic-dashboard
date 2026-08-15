import { PAGE_IDS, type PageId } from '../core/pages';

export type PageIconResourceMap = Readonly<Record<PageId, string>>;

const DEFAULT_PAGE_ICONS: PageIconResourceMap = Object.freeze({
	home: 'house',
	study: 'graduation-cap',
	research: 'library',
	agent: 'bot',
});

export function createPageIconResources(
	overrides: Partial<Record<PageId, string>> = {},
): PageIconResourceMap {
	const resources = {} as Record<PageId, string>;
	for (const pageId of PAGE_IDS) {
		const override = overrides[pageId]?.trim();
		resources[pageId] = override || DEFAULT_PAGE_ICONS[pageId];
	}
	return Object.freeze(resources);
}

export const PAGE_ICON_RESOURCES = createPageIconResources();
