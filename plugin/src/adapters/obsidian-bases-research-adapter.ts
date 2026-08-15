import * as Obsidian from 'obsidian';
import type {
	BasesView,
	BasesViewRegistration,
	Plugin,
	QueryController,
} from 'obsidian';
import type { Availability } from '../core/data-adapter';
import type { MetadataSettings } from '../core/metadata-settings';
import {
	selectAcademicPaperRows,
	basesResearchAvailability,
	type BasesPaperEntry,
} from '../core/bases-research';

export const ACADEMIC_RESEARCH_BASES_VIEW_ID = 'academic-dashboard-papers';

type BasesViewConstructor = new (controller: QueryController) => BasesView;

function basesViewConstructor(): BasesViewConstructor | null {
	const candidate = (Obsidian as unknown as { readonly BasesView?: unknown }).BasesView;
	return typeof candidate === 'function'
		? (candidate as BasesViewConstructor)
		: null;
}

interface RuntimeBasesEntry {
	readonly file: { readonly path: string; readonly basename: string };
	getValue(propertyId: `note.${string}`): { toString(): string } | null;
}

function entryPort(entry: RuntimeBasesEntry): BasesPaperEntry {
	return {
		path: entry.file.path,
		basename: entry.file.basename,
		value: (propertyId) => {
			try {
				const value = entry.getValue(propertyId);
				return value?.toString() ?? null;
			} catch {
				return null;
			}
		},
	};
}

function createViewRegistration(
	ViewConstructor: BasesViewConstructor,
	getMetadataSettings: () => MetadataSettings,
	openNote: (path: string) => Promise<void>,
): BasesViewRegistration {
	class AcademicPapersBasesView extends ViewConstructor {
		readonly type = ACADEMIC_RESEARCH_BASES_VIEW_ID;
		private readonly container: HTMLElement;

		constructor(controller: QueryController, container: HTMLElement) {
			super(controller);
			this.container = container;
		}

		onDataUpdated(): void {
			this.container.replaceChildren();
			const data = (this as unknown as {
				readonly data: { readonly data: readonly RuntimeBasesEntry[] };
			}).data;
			const rows = selectAcademicPaperRows(
				data.data.map(entryPort),
				getMetadataSettings(),
			);
			if (rows.length === 0) {
				const empty = this.container.createEl('p');
				empty.className = 'academic-dashboard-bases__empty';
				empty.textContent = 'No paper notes match the current metadata mapping.';
				return;
			}
			const list = this.container.createDiv();
			list.className = 'academic-dashboard-bases';
			for (const row of rows) {
				const button = list.createEl('button');
				button.type = 'button';
				button.className = 'academic-dashboard-note';
				button.title = row.path;
				const title = button.createSpan();
				title.className = 'academic-dashboard-note__title';
				title.textContent = row.title;
				const meta = button.createSpan();
				meta.className = 'academic-dashboard-note__meta';
				meta.textContent = [row.authors, row.status].filter(Boolean).join(' · ');
				this.registerDomEvent(button, 'click', () => {
					void openNote(row.path).catch(() => {
						button.setAttribute('aria-invalid', 'true');
						button.title = 'The selected paper note is no longer available.';
					});
				});
			}
		}
	}

	return {
		name: 'Academic Papers',
		icon: 'lucide-library-big',
		factory: (controller, containerEl) =>
			new AcademicPapersBasesView(controller, containerEl),
	};
}

/**
 * Registers a Bases view only through the supported Obsidian capability. The
 * runtime constructor is discovered structurally so Obsidian versions before
 * Bases do not fail while evaluating the Dashboard bundle.
 */
export function registerAcademicResearchBasesView(
	plugin: Plugin,
	getMetadataSettings: () => MetadataSettings,
	openNote: (path: string) => Promise<void>,
): Availability {
	const ViewConstructor = basesViewConstructor();
	const registrar = plugin as unknown as {
		registerBasesView?: (
			viewId: string,
			registration: BasesViewRegistration,
		) => boolean;
	};
	if (!ViewConstructor || typeof registrar.registerBasesView !== 'function') {
		return basesResearchAvailability(false);
	}
	const registered = registrar.registerBasesView(
		ACADEMIC_RESEARCH_BASES_VIEW_ID,
		createViewRegistration(ViewConstructor, getMetadataSettings, openNote),
	);
	return basesResearchAvailability(true, registered);
}
