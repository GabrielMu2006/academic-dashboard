export interface ValidationIssue {
	readonly code: string;
	readonly path: string;
	readonly message: string;
}

export type ValidationResult<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly issues: readonly ValidationIssue[] };

export function validationIssue(
	code: string,
	path: string,
	message: string,
): ValidationIssue {
	return Object.freeze({ code, path, message });
}

export function validationSuccess<T>(value: T): ValidationResult<T> {
	return { ok: true, value };
}

export function validationFailure<T>(
	issues: readonly ValidationIssue[],
): ValidationResult<T> {
	return { ok: false, issues: Object.freeze([...issues]) };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
