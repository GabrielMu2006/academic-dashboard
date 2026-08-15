import { isIsoDate } from './calendar-tasks';

export const GITHUB_GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';
export const MAX_GITHUB_CONTRIBUTION_DAYS = 366;

export const GITHUB_VIEWER_CONTRIBUTIONS_QUERY = `
query AcademicDashboardViewerContributions(
  $from: DateTime!
  $to: DateTime!
  $includePrivate: Boolean!
) {
  viewer {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
      restrictedContributionsCount @include(if: $includePrivate)
    }
  }
}`;

export const GITHUB_CONTRIBUTION_ERROR_CODES = [
	'secret-unavailable',
	'unauthorized',
	'forbidden',
	'rate-limited',
	'network-failed',
	'graphql-failed',
	'malformed-response',
	'configuration-changed',
] as const;

export type GithubContributionErrorCode =
	(typeof GITHUB_CONTRIBUTION_ERROR_CODES)[number];

export class GithubContributionError extends Error {
	constructor(readonly code: GithubContributionErrorCode) {
		super(`GitHub contributions unavailable (${code}).`);
		this.name = 'GithubContributionError';
	}
}

export interface GithubContributionDay {
	readonly date: string;
	readonly count: number;
}

export interface GithubContributionSnapshot {
	readonly from: string;
	readonly to: string;
	readonly days: readonly GithubContributionDay[];
	readonly privateContributionCount?: number;
}

export interface GithubContributionRequest {
	readonly secretStorageKey: string;
	readonly from: string;
	readonly to: string;
	readonly includePrivate: boolean;
}

export interface GithubSecretPort {
	readonly getSecret: (id: string) => string | null;
	readonly setSecret: (id: string, value: string) => void;
	readonly listSecretIds: () => readonly string[];
}

export interface GithubGraphqlResponse {
	readonly status: number;
	readonly json: unknown;
}

export interface GithubGraphqlPort {
	/** The implementation owns the fixed GitHub endpoint; callers cannot supply a URL. */
	readonly postViewerContributions: (
		token: string,
		body: Readonly<{
			readonly query: string;
			readonly variables: Readonly<{
				readonly from: string;
				readonly to: string;
				readonly includePrivate: boolean;
			}>;
		}>,
	) => Promise<GithubGraphqlResponse>;
}

function dateRange(from: string, to: string): Readonly<{ start: number; end: number }> {
	if (!isIsoDate(from) || !isIsoDate(to)) {
		throw new GithubContributionError('malformed-response');
	}
	const start = Date.parse(`${from}T00:00:00.000Z`);
	const end = Date.parse(`${to}T00:00:00.000Z`);
	const days = Math.floor((end - start) / 86_400_000) + 1;
	if (days < 1 || days > MAX_GITHUB_CONTRIBUTION_DAYS) {
		throw new GithubContributionError('malformed-response');
	}
	return Object.freeze({ start, end });
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? value as Readonly<Record<string, unknown>>
		: null;
}

function nonNegativeInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function normalizeResponse(
	input: unknown,
	request: GithubContributionRequest,
): GithubContributionSnapshot {
	const root = record(input);
	if (!root || (Array.isArray(root.errors) && root.errors.length > 0)) {
		throw new GithubContributionError(root?.errors ? 'graphql-failed' : 'malformed-response');
	}
	const data = record(root.data);
	const viewer = record(data?.viewer);
	const collection = record(viewer?.contributionsCollection);
	const calendar = record(collection?.contributionCalendar);
	if (!collection || !calendar || !Array.isArray(calendar.weeks)) {
		throw new GithubContributionError('malformed-response');
	}
	const range = dateRange(request.from, request.to);
	const seen = new Set<string>();
	const days: GithubContributionDay[] = [];
	for (const weekValue of calendar.weeks) {
		const week = record(weekValue);
		if (!week || !Array.isArray(week.contributionDays)) {
			throw new GithubContributionError('malformed-response');
		}
		for (const dayValue of week.contributionDays) {
			const day = record(dayValue);
			if (!day || !isIsoDate(day.date) || !nonNegativeInteger(day.contributionCount)) {
				throw new GithubContributionError('malformed-response');
			}
			const timestamp = Date.parse(`${day.date}T00:00:00.000Z`);
			if (timestamp < range.start || timestamp > range.end || seen.has(day.date)) {
				throw new GithubContributionError('malformed-response');
			}
			seen.add(day.date);
			days.push(Object.freeze({ date: day.date, count: day.contributionCount }));
		}
	}
	days.sort((left, right) => left.date.localeCompare(right.date));
	if (days.length > MAX_GITHUB_CONTRIBUTION_DAYS) {
		throw new GithubContributionError('malformed-response');
	}
	let privateContributionCount: number | undefined;
	if (request.includePrivate) {
		if (!nonNegativeInteger(collection.restrictedContributionsCount)) {
			throw new GithubContributionError('malformed-response');
		}
		privateContributionCount = collection.restrictedContributionsCount;
	}
	return Object.freeze({
		from: request.from,
		to: request.to,
		days: Object.freeze(days),
		...(privateContributionCount === undefined ? {} : { privateContributionCount }),
	});
}

function statusError(status: number): GithubContributionError {
	if (status === 401) return new GithubContributionError('unauthorized');
	if (status === 403) return new GithubContributionError('forbidden');
	if (status === 429) return new GithubContributionError('rate-limited');
	return new GithubContributionError('network-failed');
}

export class GithubContributionClient {
	constructor(
		private readonly secrets: GithubSecretPort,
		private readonly graphql: GithubGraphqlPort,
	) {}

	async fetch(request: GithubContributionRequest): Promise<GithubContributionSnapshot> {
		dateRange(request.from, request.to);
		let token: string | null;
		try {
			token = this.secrets.getSecret(request.secretStorageKey);
		} catch {
			throw new GithubContributionError('secret-unavailable');
		}
		if (!token) throw new GithubContributionError('secret-unavailable');
		let response: GithubGraphqlResponse;
		try {
			response = await this.graphql.postViewerContributions(token, Object.freeze({
				query: GITHUB_VIEWER_CONTRIBUTIONS_QUERY,
				variables: Object.freeze({
					from: `${request.from}T00:00:00.000Z`,
					to: `${request.to}T23:59:59.999Z`,
					includePrivate: request.includePrivate,
				}),
			}));
		} catch {
			throw new GithubContributionError('network-failed');
		}
		if (response.status < 200 || response.status >= 300) {
			throw statusError(response.status);
		}
		return normalizeResponse(response.json, request);
	}
}
