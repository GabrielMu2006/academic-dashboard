import { describe, expect, it } from 'vitest';
import { parseQuickLinks, parseTodayFocus } from '../../src/settings/setting-formats';

describe('Dashboard setting formats', () => {
	it('parses note and exact-line Today Focus references', () => {
		const parsed = parseTodayFocus('Course | Course/Math.md\nExam | Daily/Today.md | 7');
		expect(parsed.invalidLines).toEqual([]);
		expect(parsed.links).toEqual([
			{ label: 'Course', path: 'Course/Math.md' },
			{ label: 'Exam', path: 'Daily/Today.md', line: 7 },
		]);
	});
	it('parses labelled Vault-relative quick links', () => {
		const parsed = parseQuickLinks(
			'Course | Course\nPaper | Reading/Papers/example.md\n',
		);
		expect(parsed.invalidLines).toEqual([]);
		expect(parsed.links).toEqual([
			{ label: 'Course', path: 'Course' },
			{ label: 'Paper', path: 'Reading/Papers/example.md' },
		]);
	});

	it('reports malformed non-empty lines without partially saving them', () => {
		const parsed = parseQuickLinks('Course | Course\nmissing separator\n | path');
		expect(parsed.links).toEqual([{ label: 'Course', path: 'Course' }]);
		expect(parsed.invalidLines).toEqual([2, 3]);
	});
});
