import type { QuickLinkSetting } from '../core/local-widget-settings';

export interface QuickLinkParseResult {
	readonly links: readonly QuickLinkSetting[];
	readonly invalidLines: readonly number[];
}

export function parseQuickLinks(value: string): QuickLinkParseResult {
	const links: QuickLinkSetting[] = [];
	const invalidLines: number[] = [];
	for (const [index, rawLine] of value.split(/\r?\n/u).entries()) {
		const line = rawLine.trim();
		if (!line) continue;
		const separator = line.indexOf('|');
		const label = line.slice(0, separator).trim();
		const path = line.slice(separator + 1).trim();
		if (separator < 1 || !label || !path) {
			invalidLines.push(index + 1);
			continue;
		}
		links.push({ label, path });
	}
	return {
		links: Object.freeze(links),
		invalidLines: Object.freeze(invalidLines),
	};
}

export function parseQuotes(value: string): readonly string[] {
	return Object.freeze(
		value
			.split(/\r?\n/u)
			.map((quote) => quote.trim())
			.filter(Boolean),
	);
}
