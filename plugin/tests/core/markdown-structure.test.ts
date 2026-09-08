import { describe, expect, it } from 'vitest';
import {
	joinMarkdownLines,
	scanMarkdownLines,
} from '../../src/core/markdown-structure';

describe('Markdown structure scanner', () => {
	it('preserves mixed line separators and the terminal-line state', () => {
		const source = 'one\r\ntwo\nthree\rfour';
		const lines = scanMarkdownLines(source);

		expect(lines.map(({ text, ending }) => ({ text, ending }))).toEqual([
			{ text: 'one', ending: '\r\n' },
			{ text: 'two', ending: '\n' },
			{ text: 'three', ending: '\r' },
			{ text: 'four', ending: '' },
		]);
		expect(joinMarkdownLines(lines)).toBe(source);
	});

	it('requires a same-kind closing fence at least as long as its opener', () => {
		const lines = scanMarkdownLines([
			'````markdown',
			'```',
			'~~~',
			'example',
			'````',
			'visible',
		].join('\n'));

		expect(lines.map(({ inCode }) => inCode)).toEqual([
			true, true, true, true, true, false,
		]);
	});

	it('keeps unclosed and indented code targets read-only', () => {
		const fenced = scanMarkdownLines('~~~markdown\n- [ ] example');
		const indented = scanMarkdownLines('    - [ ] example\n- [ ] visible');

		expect(fenced.every(({ inCode }) => inCode)).toBe(true);
		expect(indented.map(({ inCode }) => inCode)).toEqual([true, false]);
	});
});
