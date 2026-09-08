import type { VaultMarkdownFile } from '../adapters/native-vault-academic-adapters';
import type { AgentWriteLogEntry } from './agent-write-log';
import type { LocalWriteLogEvent } from './conservative-writes';

export interface WeeklyReviewRange {
	readonly start: Date;
	readonly endExclusive: Date;
	readonly startDate: string;
	readonly endDate: string;
}

export interface WeeklyReviewEvidence {
	readonly now: Date;
	readonly files: readonly VaultMarkdownFile[];
	readonly localWrites: readonly LocalWriteLogEvent[];
	readonly agentWrites: readonly AgentWriteLogEntry[];
}

export interface WeeklyReviewDraft {
	readonly path: string;
	readonly content: string;
	readonly range: WeeklyReviewRange;
	readonly modifiedNoteCount: number;
	readonly localWriteCount: number;
	readonly agentWriteCount: number;
}

const MAX_ITEMS_PER_SOURCE = 50;

function dateText(date: Date): string {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, '0');
	const day = `${date.getDate()}`.padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function localWeekRange(now: Date): WeeklyReviewRange {
	const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const mondayOffset = (start.getDay() + 6) % 7;
	start.setDate(start.getDate() - mondayOffset);
	const endExclusive = new Date(start);
	endExclusive.setDate(endExclusive.getDate() + 7);
	const end = new Date(endExclusive);
	end.setDate(end.getDate() - 1);
	return Object.freeze({ start, endExclusive, startDate: dateText(start), endDate: dateText(end) });
}

function inRange(timestamp: number, range: WeeklyReviewRange): boolean {
	return Number.isFinite(timestamp) && timestamp >= range.start.getTime() && timestamp < range.endExclusive.getTime();
}

function markdownLink(path: string): string {
	const label = (path.split('/').pop() ?? path).replace(/\.md$/iu, '').replace(/[\\[\]]/gu, '');
	const href = path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
	return `[${label || 'note'}](<${href}>)`;
}

function newestFirst<T>(items: readonly T[], timestamp: (item: T) => number): T[] {
	return [...items].sort((left, right) => timestamp(right) - timestamp(left));
}

function linesOrNone(lines: readonly string[]): readonly string[] {
	return lines.length > 0 ? lines : ['- None recorded in the retained evidence.'];
}

export function buildWeeklyReviewDraft(evidence: WeeklyReviewEvidence): WeeklyReviewDraft {
	const range = localWeekRange(evidence.now);
	const modifiedAll = newestFirst(
		evidence.files.filter((file) => inRange(file.modifiedAt, range)),
		(file) => file.modifiedAt,
	);
	const localAll = newestFirst(
		evidence.localWrites.filter((entry) => inRange(Date.parse(entry.timestamp), range)),
		(entry) => Date.parse(entry.timestamp),
	);
	const agentAll = newestFirst(
		evidence.agentWrites.filter((entry) => inRange(Date.parse(entry.timestamp), range)),
		(entry) => Date.parse(entry.timestamp),
	);
	const modified = modifiedAll.slice(0, MAX_ITEMS_PER_SOURCE);
	const localWrites = localAll.slice(0, MAX_ITEMS_PER_SOURCE);
	const truncation = {
		modifiedTruncated: modifiedAll.length > modified.length,
		localTruncated: localAll.length > localWrites.length,
		agentTruncated: agentAll.length > MAX_ITEMS_PER_SOURCE,
	};
	const agentWrites = agentAll.slice(0, MAX_ITEMS_PER_SOURCE);
	const localLines = localWrites.map((entry) =>
		`- ${entry.timestamp} · \`${entry.operation}\` · ${entry.outcome} · ${markdownLink(entry.path)}${entry.errorCode ? ` · error: \`${entry.errorCode}\`` : ''}`,
	);
	const agentLines = agentWrites.map((entry) => {
		const paths = entry.affectedPaths.length > 0
			? entry.affectedPaths.map(markdownLink).join(', ')
			: 'no affected path recorded';
		return `- ${entry.timestamp} · \`${entry.workflowId}\` · ${entry.target} · ${entry.outcome} · ${paths}${entry.errorCode ? ` · error: \`${entry.errorCode}\`` : ''}`;
	});
	const modifiedLines = modified.map((file) =>
		`- ${new Date(file.modifiedAt).toISOString()} · ${markdownLink(file.path)}`,
	);
	const missing = [
		'- File modification time only shows that a note changed in this week. It does not show study duration, completion, or the full edit history.',
		'- Local write and Agent handoff sections only include events retained by Academic Dashboard. Actions outside those logs are unavailable.',
		'- Review-session viewed/skipped state is session-only and is not included as historical evidence.',
		'- Reading-queue progress has no event timestamp, so it is not presented as activity from this week.',
	];
	if (truncation.modifiedTruncated || truncation.localTruncated || truncation.agentTruncated) {
		missing.push(`- At most ${MAX_ITEMS_PER_SOURCE} items are shown per source; at least one source was truncated.`);
	}
	const content = [
		'---',
		'type: weekly-review',
		`week-start: ${range.startDate}`,
		`week-end: ${range.endDate}`,
		'generated-by: academic-dashboard',
		'---',
		'',
		`# Weekly review · ${range.startDate} to ${range.endDate}`,
		'',
		'## Evidence window',
		'',
		`- Local calendar range: ${range.startDate} 00:00 through ${range.endDate} 23:59:59`,
		`- Sources: Vault file modification times (${modifiedAll.length}), retained local write log (${localAll.length}), retained Agent handoff log (${agentAll.length})`,
		'- The lists below are evidence, not an automatic judgment of progress or mastery.',
		'',
		'## Recorded local write events',
		'',
		...linesOrNone(localLines),
		'',
		'## Recorded Agent handoffs',
		'',
		...linesOrNone(agentLines),
		'',
		'## Notes modified this week',
		'',
		...linesOrNone(modifiedLines),
		'',
		'## What I learned',
		'',
		'<!-- Write your own gains, decisions, or open questions here. -->',
		'',
		'## Next week',
		'',
		'<!-- Write your own priorities and concrete next steps here. -->',
		'',
		'## Missing evidence and limits',
		'',
		...missing,
		'',
	].join('\n');
	return Object.freeze({
		path: `Weekly Reviews/${range.startDate} Weekly Review.md`,
		content,
		range,
		modifiedNoteCount: modifiedAll.length,
		localWriteCount: localAll.length,
		agentWriteCount: agentAll.length,
	});
}
