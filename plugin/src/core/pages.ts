export const PAGE_IDS = ['home', 'study', 'research', 'agent'] as const;

export type PageId = (typeof PAGE_IDS)[number];

export interface PageDefinition {
	readonly id: PageId;
	readonly title: string;
}

export const PAGE_DEFINITIONS: readonly PageDefinition[] = Object.freeze([
	Object.freeze({ id: 'home', title: 'Home' }),
	Object.freeze({ id: 'study', title: 'Study' }),
	Object.freeze({ id: 'research', title: 'Research' }),
	Object.freeze({ id: 'agent', title: 'Agent' }),
]);

const PAGE_ID_SET: ReadonlySet<string> = new Set(PAGE_IDS);

export function isPageId(value: unknown): value is PageId {
	return typeof value === 'string' && PAGE_ID_SET.has(value);
}
