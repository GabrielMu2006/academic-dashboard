import { describe, expect, it } from 'vitest';
import {
	cleanExpiredLocalWriteLog,
	validateLocalWriteLog,
} from '../../src/core/local-write-log';

describe('minimal local write log', () => {
	it('drops all unapproved fields while retaining bounded attribution', () => {
		const result = validateLocalWriteLog([{
			timestamp: '2026-08-12T00:00:00.000Z',
			operation: 'paper-status',
			path: 'Papers/One.md',
			outcome: 'committed',
			oldValue: 'private',
			prompt: 'secret prompt',
			pat: 'secret token',
		}]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).toEqual([{
				timestamp: '2026-08-12T00:00:00.000Z',
				operation: 'paper-status',
				path: 'Papers/One.md',
				outcome: 'committed',
			}]);
			expect(JSON.stringify(result.value)).not.toContain('private');
		}
	});

	it('rejects absolute paths and free-form error codes', () => {
		const result = validateLocalWriteLog([{
			timestamp: '2026-08-12T00:00:00.000Z',
			operation: 'task-toggle',
			path: '/Users/person/private.md',
			outcome: 'rejected',
			errorCode: 'raw stack trace',
		}]);
		expect(result.ok).toBe(false);
	});

	it('cleans entries older than the configured retention', () => {
		const entries = [
			{ timestamp: '2026-07-01T00:00:00.000Z', operation: 'task-toggle' as const, path: 'Old.md', outcome: 'committed' as const },
			{ timestamp: '2026-08-11T00:00:00.000Z', operation: 'task-toggle' as const, path: 'New.md', outcome: 'committed' as const },
		];
		expect(cleanExpiredLocalWriteLog(entries, new Date('2026-08-12T00:00:00.000Z'), 30)).toEqual([entries[1]]);
	});
});
