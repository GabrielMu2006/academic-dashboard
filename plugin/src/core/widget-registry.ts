import {
	validateWidgetDefinition,
	type WidgetDefinition,
	type WidgetId,
	type WidgetRegistration,
} from './widgets';

export class DuplicateWidgetIdError extends Error {
	constructor(widgetId: WidgetId) {
		super(`Widget is already registered: ${widgetId}`);
		this.name = 'DuplicateWidgetIdError';
	}
}

export class InvalidWidgetDefinitionError extends Error {
	readonly issues: readonly string[];

	constructor(issues: readonly string[]) {
		super(`Invalid widget definition: ${issues.join(', ')}`);
		this.name = 'InvalidWidgetDefinitionError';
		this.issues = Object.freeze([...issues]);
	}
}

export class WidgetRegistry {
	private readonly registrations = new Map<WidgetId, WidgetRegistration>();

	register(registration: WidgetRegistration): void {
		const validation = validateWidgetDefinition(registration.definition);
		if (!validation.ok) {
			throw new InvalidWidgetDefinitionError(
				validation.issues.map(({ code }) => code),
			);
		}

		const definition = validation.value;
		if (this.registrations.has(definition.id)) {
			throw new DuplicateWidgetIdError(definition.id);
		}

		this.registrations.set(
			definition.id,
			Object.freeze({
				definition,
				create: () => registration.create(),
			}),
		);
	}

	get(widgetId: WidgetId): WidgetRegistration | undefined {
		return this.registrations.get(widgetId);
	}

	has(widgetId: WidgetId): boolean {
		return this.registrations.has(widgetId);
	}

	definitions(): readonly WidgetDefinition[] {
		return Object.freeze(
			[...this.registrations.values()].map(({ definition }) => definition),
		);
	}

	knownWidgetIds(): ReadonlySet<WidgetId> {
		return new Set(this.registrations.keys());
	}
}
