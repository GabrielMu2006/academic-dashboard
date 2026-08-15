import { describe, expect, it } from 'vitest';
import {
	DuplicateWidgetIdError,
	InvalidWidgetDefinitionError,
	WidgetRegistry,
} from '../../src/core/widget-registry';
import type { WidgetRegistration } from '../../src/core/widgets';

function registration(id = 'test.clock'): WidgetRegistration {
	return {
		definition: {
			id,
			title: 'Clock',
			allowedPages: ['home'],
			allowedSizes: ['small'],
			defaultSize: 'small',
		},
		create: () => ({
			mount: () => undefined,
			update: () => undefined,
			destroy: () => undefined,
		}),
	};
}

describe('WidgetRegistry', () => {
	it('registers normalized definitions and exposes known IDs', () => {
		const registry = new WidgetRegistry();
		registry.register(registration());

		expect(registry.has('test.clock')).toBe(true);
		expect(registry.get('test.clock')?.definition.title).toBe('Clock');
		expect([...registry.knownWidgetIds()]).toEqual(['test.clock']);
		expect(Object.isFrozen(registry.definitions())).toBe(true);
	});

	it('rejects duplicate widget IDs without replacing the first registration', () => {
		const registry = new WidgetRegistry();
		const firstInstance = registration().create();
		const first: WidgetRegistration = {
			...registration(),
			create: () => firstInstance,
		};
		registry.register(first);

		expect(() => registry.register(registration())).toThrow(
			DuplicateWidgetIdError,
		);
		expect(registry.get('test.clock')?.create()).toBe(firstInstance);
	});

	it('rejects malformed definitions at the registry boundary', () => {
		const registry = new WidgetRegistry();
		expect(() => registry.register(registration('clock'))).toThrow(
			InvalidWidgetDefinitionError,
		);
		expect(registry.definitions()).toHaveLength(0);
	});
});
