import type { QuickLinkSetting, TodayFocusSetting } from '../core/local-widget-settings';

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

export function parseTodayFocus(value: string): QuickLinkParseResult & {
	readonly links: readonly TodayFocusSetting[];
} {
	const links: TodayFocusSetting[] = [];
	const invalidLines: number[] = [];
	for (const [index, rawLine] of value.split(/\r?\n/u).entries()) {
		const parts = rawLine.split('|').map((part) => part.trim());
		if (parts.length < 2 || parts.length > 3 || !parts[0] || !parts[1]) {
			if (rawLine.trim()) invalidLines.push(index + 1);
			continue;
		}
		const line = parts[2] ? Number(parts[2]) : undefined;
		if (line !== undefined && (!Number.isInteger(line) || line < 1)) {
			invalidLines.push(index + 1);
			continue;
		}
		links.push({ label: parts[0], path: parts[1], ...(line ? { line } : {}) });
	}
	return { links: Object.freeze(links), invalidLines: Object.freeze(invalidLines) };
}
