import { PAPER_STATUSES, type MetadataSettings, type PaperStatus } from './metadata-settings';
import {
	adapterAvailable,
	adapterUnavailable,
	type Availability,
} from './data-adapter';

export interface BasesPaperEntry {
	readonly path: string;
	readonly basename: string;
	value(propertyId: `note.${string}`): string | null;
}

export interface BasesPaperRow {
	readonly path: string;
	readonly title: string;
	readonly authors: string;
	readonly status?: PaperStatus;
}

function normalizedValue(value: string | null): string | undefined {
	const normalized = value?.trim();
	return normalized || undefined;
}

export function selectAcademicPaperRows(
	entries: readonly BasesPaperEntry[],
	metadata: MetadataSettings,
): readonly BasesPaperRow[] {
	const rows: BasesPaperRow[] = [];
	for (const entry of entries) {
		if (
			normalizedValue(entry.value(`note.${metadata.fields.noteType}`)) !==
			metadata.values.paperType
		) {
			continue;
		}
		const statusValue = normalizedValue(entry.value(`note.${metadata.fields.status}`));
		const status =
			statusValue && (PAPER_STATUSES as readonly string[]).includes(statusValue)
				? (statusValue as PaperStatus)
				: undefined;
		rows.push(Object.freeze({
			path: entry.path,
			title:
				normalizedValue(entry.value(`note.${metadata.fields.title}`)) ??
				entry.basename,
			authors:
				normalizedValue(entry.value(`note.${metadata.fields.authors}`)) ?? '',
			...(status ? { status } : {}),
		}));
	}
	return Object.freeze(rows);
}

export function basesResearchAvailability(
	hasRuntimeCapability: boolean,
	registrationAccepted?: boolean,
): Availability {
	if (!hasRuntimeCapability) {
		return adapterUnavailable(
			'core-plugin',
			'Bases is unavailable in this Obsidian runtime.',
			'Enable Bases in a compatible Obsidian version to add the Academic Papers view.',
		);
	}
	return registrationAccepted
		? adapterAvailable('core-plugin')
		: adapterUnavailable(
				'core-plugin',
				'Bases is supported but not enabled in this Vault.',
				'Enable the Bases core plugin to add the Academic Papers view.',
			);
}
