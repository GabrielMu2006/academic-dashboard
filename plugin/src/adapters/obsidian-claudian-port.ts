import type { App } from 'obsidian';
import type {
	ClaudianCompatibilityPort,
	ClaudianPluginCompatibility,
} from './claudian-adapter';

const CLAUDIAN_PLUGIN_ID = 'realclaudian';

interface ObsidianPluginRegistryCompatibility {
	readonly manifests?: Readonly<Record<string, { readonly version?: unknown }>>;
	getPlugin(pluginId: string): unknown;
}

function pluginRegistry(app: App): ObsidianPluginRegistryCompatibility | null {
	return (app as App & { readonly plugins?: ObsidianPluginRegistryCompatibility }).plugins ?? null;
}

function compatiblePlugin(value: unknown): ClaudianPluginCompatibility | null {
	if (!value || typeof value !== 'object') return null;
	return value;
}

export function createObsidianClaudianPort(app: App): ClaudianCompatibilityPort {
	return {
		installedVersion: () => {
			const version = pluginRegistry(app)?.manifests?.[CLAUDIAN_PLUGIN_ID]?.version;
			return typeof version === 'string' && version.trim() ? version.trim() : null;
		},
		loadedPlugin: () =>
			compatiblePlugin(pluginRegistry(app)?.getPlugin(CLAUDIAN_PLUGIN_ID)),
	};
}
