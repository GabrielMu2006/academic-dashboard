import {
	isRecord,
	validationFailure,
	validationIssue,
	validationSuccess,
	type ValidationIssue,
	type ValidationResult,
} from './validation';
import {
	MAX_GITHUB_CONTRIBUTION_DAYS,
	type GithubContributionDay,
	type GithubSecretPort,
} from './github-contributions';
import { isIsoDate } from './calendar-tasks';

export const GITHUB_SECRET_STORAGE_KEY = 'academic-dashboard-github-pat';

export interface GithubContributionCache {
	readonly from: string;
	readonly to: string;
	readonly updatedAt: string;
	readonly includesPrivate: boolean;
	readonly credentialRevision: number;
	readonly days: readonly GithubContributionDay[];
	readonly privateContributionCount?: number;
}

export interface GithubSettings {
	/** Name/reference only. The PAT value belongs exclusively to SecretStorage. */
	readonly secretStorageKey: string;
	readonly cacheTtlHours: number;
	readonly lastSuccessfulUpdate: string | null;
	readonly includePrivateContributions: boolean;
	readonly credentialRevision: number;
	readonly cache: GithubContributionCache | null;
}

export const DEFAULT_GITHUB_SETTINGS: GithubSettings = Object.freeze({
	secretStorageKey: '',
	cacheTtlHours: 6,
	lastSuccessfulUpdate: null,
	includePrivateContributions: false,
	credentialRevision: 0,
	cache: null,
});

const SECRET_REFERENCE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function validateCache(input: unknown): ValidationResult<GithubContributionCache | null> {
	if (input === undefined || input === null) return validationSuccess(null);
	if (!isRecord(input) ||
		typeof input.from !== 'string' || !isIsoDate(input.from) ||
		typeof input.to !== 'string' || !isIsoDate(input.to) ||
		typeof input.updatedAt !== 'string' || !Number.isFinite(Date.parse(input.updatedAt)) ||
		typeof input.includesPrivate !== 'boolean' ||
		typeof input.credentialRevision !== 'number' ||
		!Number.isSafeInteger(input.credentialRevision) || input.credentialRevision < 0 ||
		!Array.isArray(input.days) || input.days.length > MAX_GITHUB_CONTRIBUTION_DAYS
	) {
		return validationFailure([validationIssue(
			'invalid_github_cache',
			'settings.github.cache',
			'Expected a bounded normalized GitHub contribution cache.',
		)]);
	}
	const rangeDays = Math.floor((
		Date.parse(`${input.to}T00:00:00.000Z`) -
		Date.parse(`${input.from}T00:00:00.000Z`)
	) / 86_400_000) + 1;
	if (rangeDays < 1 || rangeDays > MAX_GITHUB_CONTRIBUTION_DAYS) {
		return validationFailure([validationIssue(
			'invalid_github_cache_range',
			'settings.github.cache',
			'Expected a GitHub contribution cache spanning at most one year.',
		)]);
	}
	const seen = new Set<string>();
	const days: GithubContributionDay[] = [];
	for (const candidate of input.days) {
		if (!isRecord(candidate) || typeof candidate.date !== 'string' ||
			!isIsoDate(candidate.date) || seen.has(candidate.date) ||
			typeof candidate.count !== 'number' || !Number.isSafeInteger(candidate.count) ||
			candidate.count < 0 || candidate.date < input.from || candidate.date > input.to
		) {
			return validationFailure([validationIssue(
				'invalid_github_cache_day',
				'settings.github.cache.days',
				'Expected unique bounded date/count entries.',
			)]);
		}
		seen.add(candidate.date);
		days.push(Object.freeze({ date: candidate.date, count: candidate.count }));
	}
	if (
		input.privateContributionCount !== undefined &&
		(typeof input.privateContributionCount !== 'number' ||
			!Number.isSafeInteger(input.privateContributionCount) ||
			input.privateContributionCount < 0 || !input.includesPrivate)
	) {
		return validationFailure([validationIssue(
			'invalid_github_private_count',
			'settings.github.cache.privateContributionCount',
			'Expected an anonymous non-negative private contribution count.',
		)]);
	}
	return validationSuccess(Object.freeze({
		from: input.from,
		to: input.to,
		updatedAt: new Date(input.updatedAt).toISOString(),
		includesPrivate: input.includesPrivate,
		credentialRevision: input.credentialRevision,
		days: Object.freeze(days.sort((left, right) => left.date.localeCompare(right.date))),
		...(input.privateContributionCount === undefined
			? {}
			: { privateContributionCount: input.privateContributionCount }),
	}));
}

export function validateGithubSettings(
	input: unknown,
): ValidationResult<GithubSettings> {
	if (!isRecord(input)) {
		return validationFailure([
			validationIssue('invalid_github_settings', 'settings.github', 'Expected GitHub settings.'),
		]);
	}
	const issues: ValidationIssue[] = [];
	if (
		typeof input.secretStorageKey !== 'string' ||
		(input.secretStorageKey !== '' &&
			(input.secretStorageKey.length > 120 || !SECRET_REFERENCE_PATTERN.test(input.secretStorageKey)))
	) {
		issues.push(validationIssue(
			'invalid_github_secret_reference',
			'settings.github.secretStorageKey',
			'Expected a bounded SecretStorage name/reference, never a token value.',
		));
	}
	if (
		typeof input.cacheTtlHours !== 'number' ||
		!Number.isInteger(input.cacheTtlHours) ||
		input.cacheTtlHours !== 6
	) {
		issues.push(validationIssue(
			'invalid_github_cache_ttl',
			'settings.github.cacheTtlHours',
			'Expected the fixed six-hour GitHub cache duration.',
		));
	}
	if (
		input.lastSuccessfulUpdate !== null &&
		(typeof input.lastSuccessfulUpdate !== 'string' ||
			!Number.isFinite(Date.parse(input.lastSuccessfulUpdate)))
	) {
		issues.push(validationIssue(
			'invalid_github_last_success',
			'settings.github.lastSuccessfulUpdate',
			'Expected an ISO timestamp or null.',
		));
	}
	if (issues.length > 0) return validationFailure(issues);
	const includePrivateContributions = input.includePrivateContributions === undefined
		? false
		: input.includePrivateContributions;
	const credentialRevision = input.credentialRevision === undefined
		? 0
		: typeof input.credentialRevision === 'number'
			? input.credentialRevision
			: Number.NaN;
	if (typeof includePrivateContributions !== 'boolean') {
		issues.push(validationIssue(
			'invalid_github_private_preference',
			'settings.github.includePrivateContributions',
			'Expected an explicit private contribution count preference.',
		));
	}
	if (!Number.isSafeInteger(credentialRevision) || credentialRevision < 0) {
		issues.push(validationIssue(
			'invalid_github_credential_revision',
			'settings.github.credentialRevision',
			'Expected non-sensitive GitHub credential revision metadata.',
		));
	}
	const cache = validateCache(input.cache);
	if (!cache.ok) issues.push(...cache.issues);
	if (issues.length > 0 || !cache.ok || typeof includePrivateContributions !== 'boolean' ||
		!Number.isSafeInteger(credentialRevision) || credentialRevision < 0) {
		return validationFailure(issues);
	}
	return validationSuccess(Object.freeze({
		secretStorageKey: input.secretStorageKey as string,
		cacheTtlHours: input.cacheTtlHours as number,
		lastSuccessfulUpdate: input.lastSuccessfulUpdate as string | null,
		includePrivateContributions,
		credentialRevision,
		cache: cache.value,
	}));
}

export function saveGithubPatToSecretStorage(
	secrets: GithubSecretPort,
	current: GithubSettings,
	value: string,
): GithubSettings | null {
	if (!value || value.length > 1_000 || /\s/u.test(value)) return null;
	try {
		secrets.setSecret(GITHUB_SECRET_STORAGE_KEY, value);
	} catch {
		return null;
	}
	return Object.freeze({
		...current,
		secretStorageKey: GITHUB_SECRET_STORAGE_KEY,
		lastSuccessfulUpdate: null,
		credentialRevision: current.credentialRevision === Number.MAX_SAFE_INTEGER
			? 0
			: current.credentialRevision + 1,
		cache: null,
	});
}
