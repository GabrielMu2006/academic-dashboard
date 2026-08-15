export const ADAPTER_SOURCE_KINDS = [
	'native-vault',
	'optional-plugin',
	'core-plugin',
	'local',
	'remote',
] as const;

export type AdapterSourceKind = (typeof ADAPTER_SOURCE_KINDS)[number];
export type AdapterId = string;

export type Availability =
	| {
			readonly status: 'available';
			readonly source: AdapterSourceKind;
	  }
	| {
			readonly status: 'fallback';
			readonly source: AdapterSourceKind;
			readonly reason: string;
			readonly fallbackAdapterId: AdapterId;
	  }
	| {
			readonly status: 'unavailable';
			readonly source: AdapterSourceKind;
			readonly reason: string;
			readonly recovery?: string;
	  };

/**
 * Project-owned data boundary. Widgets and application services consume this
 * interface and never import Obsidian Community Plugin APIs directly.
 */
export interface DataAdapter<TQuery, TResult> {
	readonly id: AdapterId;
	availability(): Promise<Availability>;
	query(input: TQuery): Promise<TResult>;
}

const ADAPTER_ID_PATTERN =
	/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+$/;
const MAX_ADAPTER_ID_LENGTH = 100;

export function isAdapterId(value: unknown): value is AdapterId {
	return (
		typeof value === 'string' &&
		value.length <= MAX_ADAPTER_ID_LENGTH &&
		ADAPTER_ID_PATTERN.test(value)
	);
}

export function adapterAvailable(source: AdapterSourceKind): Availability {
	return Object.freeze({ status: 'available', source });
}

export function adapterFallback(
	source: AdapterSourceKind,
	reason: string,
	fallbackAdapterId: AdapterId,
): Availability {
	if (!reason.trim() || !isAdapterId(fallbackAdapterId)) {
		throw new Error('Fallback availability requires a reason and valid Adapter ID.');
	}
	return Object.freeze({
		status: 'fallback',
		source,
		reason: reason.trim(),
		fallbackAdapterId,
	});
}

export function adapterUnavailable(
	source: AdapterSourceKind,
	reason: string,
	recovery?: string,
): Availability {
	if (!reason.trim()) {
		throw new Error('Unavailable availability requires a reason.');
	}
	const normalizedRecovery = recovery?.trim();
	return Object.freeze({
		status: 'unavailable',
		source,
		reason: reason.trim(),
		...(normalizedRecovery ? { recovery: normalizedRecovery } : {}),
	});
}
