export type MarkdownLineEnding = '' | '\n' | '\r\n' | '\r';

export interface ScannedMarkdownLine {
	readonly number: number;
	readonly text: string;
	readonly ending: MarkdownLineEnding;
	readonly inCode: boolean;
	readonly fenceDelimiter: boolean;
}

interface OpenFence {
	readonly marker: '`' | '~';
	readonly length: number;
}

function splitPreservingEndings(content: string): Array<{
	text: string;
	ending: MarkdownLineEnding;
}> {
	const lines: Array<{ text: string; ending: MarkdownLineEnding }> = [];
	let start = 0;
	for (let cursor = 0; cursor < content.length; cursor += 1) {
		const character = content[cursor];
		if (character !== '\n' && character !== '\r') continue;
		const ending = character === '\r' && content[cursor + 1] === '\n'
			? '\r\n'
			: character;
		lines.push({ text: content.slice(start, cursor), ending });
		if (ending === '\r\n') cursor += 1;
		start = cursor + 1;
	}
	if (start < content.length || lines.length === 0) {
		lines.push({ text: content.slice(start), ending: '' });
	}
	return lines;
}

function openingFence(line: string): OpenFence | null {
	const match = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
	const sequence = match?.[1];
	if (!sequence) return null;
	if (sequence[0] === '`' && (match?.[2] ?? '').includes('`')) return null;
	return {
		marker: sequence[0] === '~' ? '~' : '`',
		length: sequence.length,
	};
}

function closesFence(line: string, fence: OpenFence): boolean {
	const match = /^ {0,3}(`+|~+)[ \t]*$/u.exec(line);
	const sequence = match?.[1];
	return Boolean(
		sequence &&
		sequence[0] === fence.marker &&
		sequence.length >= fence.length,
	);
}

/**
 * Scans the conservative Markdown subset used by Native task and review
 * adapters. Fence delimiters and their contents are marked as code while line
 * text and original separators remain byte-preserving for exact edits.
 */
export function scanMarkdownLines(content: string): readonly ScannedMarkdownLine[] {
	let fence: OpenFence | null = null;
	return Object.freeze(
		splitPreservingEndings(content).map((line, index) => {
			if (fence) {
				const closes = closesFence(line.text, fence);
				const scanned = Object.freeze({
					number: index + 1,
					...line,
					inCode: true,
					fenceDelimiter: closes,
				});
				if (closes) fence = null;
				return scanned;
			}
			const opens = openingFence(line.text);
			if (opens) fence = opens;
			const indentedCode = /^(?: {4}|\t)/u.test(line.text);
			return Object.freeze({
				number: index + 1,
				...line,
				inCode: Boolean(opens) || indentedCode,
				fenceDelimiter: Boolean(opens),
			});
		}),
	);
}

export function joinMarkdownLines(lines: readonly ScannedMarkdownLine[]): string {
	return lines.map(({ text, ending }) => `${text}${ending}`).join('');
}
