import {
	App,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	normalizePath,
	type SettingDefinitionItem,
} from 'obsidian';
import type {
	AgentSettings,
} from '../core/agent-settings';
import {
	GITHUB_SECRET_STORAGE_KEY,
	type GithubSettings,
} from '../core/github-settings';
import type {
	LocalWidgetSettings,
	QuickLinkSetting,
} from '../core/local-widget-settings';
import type { LocalWriteSettings } from '../core/local-write-settings';
import {
	DEFAULT_METADATA_SETTINGS,
	type MetadataFieldId,
	type MetadataSettings,
} from '../core/metadata-settings';
import { PAGE_IDS, type PageId } from '../core/pages';
import type { DashboardSettings } from '../core/settings';
import {
	DEFAULT_TEMPLATE_SETTINGS,
	type AcademicTemplateSettings,
	type TemplateSourceKind,
} from '../core/template-settings';
import type { WidgetDefinition } from '../core/widgets';
import { parseQuickLinks, parseQuotes } from './setting-formats';
import {
	formatDate,
	formatNumber,
	localizeElementTree,
	t,
	translateEnglishSource,
} from '../core/localization';

export interface DashboardSettingsController {
	getSettings(): DashboardSettings;
	getWidgetDefinitions(): readonly WidgetDefinition[];
	setDefaultPage(pageId: PageId): boolean;
	setWidgetVisible(widgetId: string, visible: boolean): boolean;
	setLocalWidgetSettings(settings: LocalWidgetSettings): boolean;
	setMetadataSettings(settings: MetadataSettings): boolean;
	setLocalWriteSettings(settings: LocalWriteSettings): boolean;
	setTemplateSettings(settings: AcademicTemplateSettings): boolean;
	setAgentSettings(settings: AgentSettings): boolean;
	setGithubSettings(settings: GithubSettings): boolean;
	hasGithubPat(): boolean;
	saveGithubPat(value: string): boolean;
	resetPageLayout(pageId: PageId): void;
	resetAllLayouts(): void;
	refreshDashboardViews(): void;
	showDefaultPage(): void;
}

function pageLabel(pageId: PageId): string {
	return `${pageId.charAt(0).toUpperCase()}${pageId.slice(1)}`;
}

function serializeQuickLinks(links: readonly QuickLinkSetting[]): string {
	return links.map(({ label, path }) => `${label} | ${path}`).join('\n');
}

export class DashboardSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		plugin: Plugin,
		private readonly controller: DashboardSettingsController,
	) {
		super(app, plugin);
	}

	display(): void {
		this.renderSettings();
	}

	private renderSettings(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('academic-dashboard-settings');
		containerEl.setAttr('aria-label', t('settings.title'));
		new Setting(containerEl).setName(t('settings.title')).setHeading();
		containerEl.createEl('p', {
			text: t('settings.intro'),
			cls: 'setting-item-description academic-dashboard-settings__intro',
		});
		this.renderGeneral();
		this.renderAgentSettings();
		this.renderGithubSettings();
		this.renderVisibility();
		this.renderMetadata();
		this.renderPaperWrites();
		this.renderTemplates();
		this.renderQuickLinks();
		this.renderQuotes();
		this.renderLayoutReset();
		this.renderAgentBoundary();
		localizeElementTree(this.containerEl);
	}

	private renderGithubSettings(): void {
		new Setting(this.containerEl).setName('GitHub contributions').setHeading();
		const configured = this.controller.hasGithubPat();
		let patDraft = '';
		new Setting(this.containerEl)
			.setName('Personal access token')
			.setDesc(t(configured ? 'settings.githubConfigured' : 'settings.githubNotConfigured'))
			.addText((text) => {
				text.inputEl.type = 'password';
				text.inputEl.autocomplete = 'new-password';
				text.setPlaceholder('Paste access token to replace the stored secret');
				text.onChange((value) => { patDraft = value; });
			})
			.addButton((button) => button.setButtonText('Save securely').setCta().onClick(() => {
				if (!this.controller.saveGithubPat(patDraft)) {
					new Notice('Access token was not saved. Enter one non-empty value without whitespace.');
					return;
				}
				patDraft = '';
				this.renderSettings();
				new Notice('GitHub access token saved only to Obsidian secure storage. Previous contribution cache cleared.');
			}));

		new Setting(this.containerEl)
			.setName('Anonymous private contribution count')
			.setDesc('Explicit opt-in. Requires read:user. Dashboard never requests repository scope or private repository names.')
			.addToggle((toggle) => toggle
				.setValue(this.controller.getSettings().github.includePrivateContributions)
				.onChange((enabled) => {
					const github = this.controller.getSettings().github;
					const cache = !enabled && github.cache
						? Object.freeze({
							...github.cache,
							includesPrivate: false,
							credentialRevision: github.credentialRevision,
							privateContributionCount: undefined,
						})
						: github.cache;
					if (this.controller.setGithubSettings({
						...github,
						includePrivateContributions: enabled,
						cache,
					})) this.controller.refreshDashboardViews();
				}),
			);

		const github = this.controller.getSettings().github;
		new Setting(this.containerEl)
			.setName('Contribution cache')
			.setDesc(
				github.cache
					? t('settings.cacheSummary', {
						count: formatNumber(github.cache.days.length),
						date: formatDate(new Date(github.cache.updatedAt), { dateStyle: 'medium', timeStyle: 'short' }),
					})
					: t('settings.cacheEmpty', {
						reference: github.secretStorageKey || GITHUB_SECRET_STORAGE_KEY,
					}),
			);
	}

	private renderTemplates(): void {
		new Setting(this.containerEl).setName('Academic note templates').setHeading();
		const description = this.containerEl.createEl('p', {
			cls: 'setting-item-description',
		});
		description.appendText(
			'Use editable Dashboard templates or select existing Markdown templates in this Vault. Creation commands make one new note and never overwrite an existing path.',
		);
		this.renderTemplateSetting('courseNote', 'Course note');
		this.renderTemplateSetting('paperReading', 'Paper-reading note');
	}

	private renderTemplateSetting(
		kind: keyof AcademicTemplateSettings,
		label: string,
	): void {
		new Setting(this.containerEl).setName(label).setHeading();
		const current = this.controller.getSettings().templates[kind];
		const draft: {
			source: TemplateSourceKind;
			customTemplate: string;
			vaultTemplatePath: string;
			destinationFolder: string;
		} = { ...current };
		new Setting(this.containerEl)
			.setName('Template source')
			.setDesc('Choose editable dashboard text or an existing vault Markdown file.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('custom', 'Editable dashboard template')
					.addOption('vault', 'Vault Markdown template')
					.setValue(draft.source)
					.onChange((value) => {
						draft.source = value as TemplateSourceKind;
					}),
			);
		new Setting(this.containerEl)
			.setName('Editable template')
			.setDesc('Used when the source is editable dashboard template.')
			.addTextArea((text) => {
				text.setValue(draft.customTemplate).onChange((value) => {
					draft.customTemplate = value;
				});
				text.inputEl.rows = 9;
			});
		new Setting(this.containerEl)
			.setName('Vault template path')
			.setDesc('Required for vault source, for example templates/course-note.md.')
			.addText((text) =>
				text.setValue(draft.vaultTemplatePath).onChange((value) => {
					draft.vaultTemplatePath = value;
				}),
			);
		new Setting(this.containerEl)
			.setName('Destination folder')
			.setDesc('Vault-relative folder for newly created notes.')
			.addText((text) =>
				text.setValue(draft.destinationFolder).onChange((value) => {
					draft.destinationFolder = value;
				}),
			);
		new Setting(this.containerEl)
			.setName(t('settings.templateSettings', {
				label: translateEnglishSource(label),
			}))
			.setDesc('Save source, template, and destination together.')
			.addButton((button) =>
				button.setButtonText('Save').setCta().onClick(() => {
					const templates = this.controller.getSettings().templates;
					const candidate: AcademicTemplateSettings = {
						...templates,
						[kind]: draft,
					};
					if (this.controller.setTemplateSettings(candidate)) {
						new Notice(`${label} template settings saved.`);
					} else {
						new Notice(
							'Template settings were invalid. Check the template text and vault-relative paths.',
						);
					}
				}),
			)
			.addButton((button) =>
				button.setButtonText('Use default').onClick(() => {
					const templates = this.controller.getSettings().templates;
					if (
						this.controller.setTemplateSettings({
							...templates,
							[kind]: DEFAULT_TEMPLATE_SETTINGS[kind],
						})
					) {
						this.renderSettings();
						new Notice(`${label} default restored.`);
					}
				}),
			);
	}

	private renderMetadata(): void {
		new Setting(this.containerEl).setName('Academic metadata').setHeading();
		const description = this.containerEl.createEl('p', {
			cls: 'setting-item-description',
		});
		description.appendText(
			'Map Academic Dashboard concepts to your existing frontmatter properties. ' +
				'These recommendations only control how the dashboard reads notes; saving them does not edit or migrate any Vault note.',
		);

		const current = this.controller.getSettings().metadata;
		const fieldDraft: Record<MetadataFieldId, string> = { ...current.fields };
		const valueDraft = { ...current.values };
		const fields: readonly {
			readonly id: MetadataFieldId;
			readonly name: string;
			readonly description: string;
		}[] = [
			{ id: 'noteType', name: 'Note type field', description: 'Identifies the kind of note.' },
			{ id: 'course', name: 'Course field', description: 'Course name or code.' },
			{ id: 'term', name: 'Term field', description: 'Academic term or semester.' },
			{ id: 'date', name: 'Date field', description: 'Course-note date.' },
			{ id: 'title', name: 'Paper title field', description: 'Paper title.' },
			{ id: 'authors', name: 'Authors field', description: 'Paper authors.' },
			{ id: 'year', name: 'Publication year field', description: 'Paper publication year.' },
			{ id: 'status', name: 'Reading status field', description: 'Unread, reading, or reviewed.' },
			{ id: 'venue', name: 'Venue field', description: 'Journal, conference, or venue.' },
			{ id: 'doi', name: 'DOI field', description: 'Digital object identifier.' },
			{ id: 'tags', name: 'Tags field', description: 'Vault tags for the note.' },
		];
		for (const field of fields) {
			new Setting(this.containerEl)
				.setName(field.name)
				.setDesc(field.description)
				.addText((text) =>
					text.setValue(fieldDraft[field.id]).onChange((value) => {
						fieldDraft[field.id] = value;
					}),
				);
		}

		new Setting(this.containerEl)
			.setName('Course-note type value')
			.setDesc('Recommended default: course-note')
			.addText((text) =>
				text.setValue(valueDraft.courseNoteType).onChange((value) => {
					valueDraft.courseNoteType = value;
				}),
			);
		new Setting(this.containerEl)
			.setName('Paper type value')
			.setDesc('Recommended default: paper')
			.addText((text) =>
				text.setValue(valueDraft.paperType).onChange((value) => {
					valueDraft.paperType = value;
				}),
			);

		new Setting(this.containerEl)
			.setName('Metadata mapping')
			.setDesc('Save all field and type-value mappings together.')
			.addButton((button) =>
				button.setButtonText('Save').setCta().onClick(() => {
					if (
						this.controller.setMetadataSettings({
							fields: fieldDraft,
							values: valueDraft,
						})
					) {
						this.controller.refreshDashboardViews();
						new Notice('Metadata mapping saved. Vault notes were not changed.');
					} else {
						new Notice(
							'Metadata mapping was invalid. Use unique, non-empty field names and different note type values.',
						);
					}
				}),
			)
			.addButton((button) =>
				button.setButtonText('Use recommended').onClick(() => {
					if (this.controller.setMetadataSettings(DEFAULT_METADATA_SETTINGS)) {
						this.renderSettings();
						this.controller.refreshDashboardViews();
						new Notice('Recommended metadata mapping restored.');
					}
				}),
			);
	}

	private renderPaperWrites(): void {
		new Setting(this.containerEl).setName('Research paper actions').setHeading();
		const current = this.controller.getSettings().localWrites;
		const draft = { ...current.paper };
		new Setting(this.containerEl)
			.setName('Status write field')
			.setDesc(
				'One top-level scalar with only unread, reading, or reviewed. This must match the metadata reading status field.',
			)
			.addText((text) => text.setValue(draft.statusField).onChange((value) => {
				draft.statusField = value;
			}));
		new Setting(this.containerEl)
			.setName('Favorite write field')
			.setDesc(
				'One top-level YAML boolean true or false. Missing is treated as false and inserted only into otherwise safe existing frontmatter.',
			)
			.addText((text) => text.setValue(draft.favoriteField).onChange((value) => {
				draft.favoriteField = value;
			}));
		new Setting(this.containerEl)
			.setName('Paper write mapping')
			.setDesc(
				'Clicks update one existing paper and one mapped field. Complex, duplicated, malformed, or stale frontmatter stays unchanged.',
			)
			.addButton((button) => button.setButtonText('Save').setCta().onClick(() => {
				if (this.controller.setLocalWriteSettings({ ...current, paper: draft })) {
					this.controller.refreshDashboardViews();
					new Notice('Research paper write mapping saved. No vault note was changed.');
				} else {
					new Notice('Paper write mapping was invalid. Use two different simple field names.');
				}
			}));
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		// The editable multi-line collections still use the imperative fallback.
		return [];
	}

	private renderGeneral(): void {
		new Setting(this.containerEl)
			.setName('Default page')
			.setDesc('Page shown when a new dashboard view opens.')
			.addDropdown((dropdown) => {
				for (const pageId of PAGE_IDS) dropdown.addOption(pageId, pageLabel(pageId));
				dropdown
					.setValue(this.controller.getSettings().defaultPage)
					.onChange((value) => {
						if (this.controller.setDefaultPage(value as PageId)) {
							this.controller.showDefaultPage();
						}
					});
			});
	}

	private renderVisibility(): void {
		new Setting(this.containerEl).setName('Widget visibility').setHeading();
		const hidden = new Set(this.controller.getSettings().hiddenWidgetIds);
		for (const definition of this.controller.getWidgetDefinitions()) {
			new Setting(this.containerEl)
				.setName(definition.title)
				.setDesc(definition.id)
				.addToggle((toggle) =>
					toggle.setValue(!hidden.has(definition.id)).onChange((visible) => {
						if (this.controller.setWidgetVisible(definition.id, visible)) {
							this.controller.refreshDashboardViews();
						}
					}),
				);
		}
	}

	private renderQuickLinks(): void {
		new Setting(this.containerEl).setName('Quick links').setHeading();
		let draft = serializeQuickLinks(
			this.controller.getSettings().widgets.quickLinks,
		);
		new Setting(this.containerEl)
			.setName('Vault paths')
			.setDesc('One per line: Label | relative/vault/path')
			.addTextArea((text) => {
				text.setValue(draft).onChange((value) => {
					draft = value;
				});
				text.inputEl.rows = 5;
			})
			.addButton((button) =>
				button.setButtonText('Save').onClick(() => {
					const parsed = parseQuickLinks(draft);
					if (parsed.invalidLines.length > 0) {
						new Notice(
							`Quick links not saved. Check line(s): ${parsed.invalidLines.join(', ')}.`,
						);
						return;
					}
					const current = this.controller.getSettings().widgets;
					if (
						this.controller.setLocalWidgetSettings({
							...current,
							quickLinks: parsed.links,
						})
					) {
						this.controller.refreshDashboardViews();
						new Notice('Quick links saved.');
					} else {
						new Notice('Quick links were invalid and were not saved.');
					}
				}),
			);
	}

	private renderQuotes(): void {
		new Setting(this.containerEl).setName('Local quotes').setHeading();
		let pathDraft = this.controller.getSettings().widgets.quoteFilePath;
		new Setting(this.containerEl)
			.setName('Quote file')
			.setDesc('A vault-relative Markdown file. Each non-empty, non-heading line is one quote, up to 366 entries.')
			.addText((text) => text
				.setPlaceholder('Reading/每日引言.md')
				.setValue(pathDraft)
				.onChange((value) => { pathDraft = value; }))
			.addButton((button) => button.setButtonText('Save').setCta().onClick(() => {
				const current = this.controller.getSettings().widgets;
				if (this.controller.setLocalWidgetSettings({
					...current,
					quoteFilePath: pathDraft,
				})) {
					this.controller.refreshDashboardViews();
					new Notice('Quote file path saved.');
				} else {
					new Notice('Quote file path must be a visible vault-relative Markdown path.');
				}
			}))
			.addButton((button) => button.setButtonText('Open file').onClick(() => {
				const file = this.app.vault.getAbstractFileByPath(normalizePath(pathDraft.trim()));
				if (!(file instanceof TFile) || file.extension.toLocaleLowerCase() !== 'md') {
					new Notice('Quote file was not found. Save an existing vault Markdown path first.');
					return;
				}
				void this.app.workspace.getLeaf(false).openFile(file);
			}));

		let draft = this.controller.getSettings().widgets.quotes.join('\n');
		new Setting(this.containerEl)
			.setName('Fallback quote entries')
			.setDesc('Used only when no quote file path is configured. One local quote per line; no network service is used.')
			.addTextArea((text) => {
				text.setValue(draft).onChange((value) => {
					draft = value;
				});
				text.inputEl.rows = 5;
			})
			.addButton((button) =>
				button.setButtonText('Save').onClick(() => {
					const current = this.controller.getSettings().widgets;
					if (
						this.controller.setLocalWidgetSettings({
							...current,
							quotes: parseQuotes(draft),
						})
					) {
						this.controller.refreshDashboardViews();
						new Notice('Local quotes saved.');
					} else {
						new Notice('Quotes were invalid and were not saved.');
					}
				}),
			);
	}

	private renderLayoutReset(): void {
		new Setting(this.containerEl).setName('Layout reset').setHeading();
		for (const pageId of PAGE_IDS) {
			const label = translateEnglishSource(pageLabel(pageId));
			new Setting(this.containerEl)
				.setName(t('settings.layoutName', { page: label }))
				.setDesc(t('settings.layoutRestore', { page: label }))
				.addButton((button) =>
					button.setButtonText('Reset').onClick(() => {
						this.controller.resetPageLayout(pageId);
						this.controller.refreshDashboardViews();
						new Notice(`${pageLabel(pageId)} layout reset.`);
					}),
				);
		}
		new Setting(this.containerEl)
			.setName('All dashboard layouts')
			.setDesc('Restore defaults for home, study, research, and agent.')
			.addButton((button) => {
				button.buttonEl.addClass('mod-warning');
				button.setButtonText('Reset all').onClick(() => {
					this.controller.resetAllLayouts();
					this.controller.refreshDashboardViews();
					new Notice('All dashboard layouts reset.');
				});
			});
	}

	private renderAgentBoundary(): void {
		new Setting(this.containerEl).setName('Agent configuration').setHeading();
		const description = this.containerEl.createEl('p', {
			cls: 'setting-item-description',
		});
		description.appendText('Provider and model configuration remains in ');
		description.createEl('code', { text: ['Codex', 'OpenCode'].join(' / ') });
		description.appendText(
			'. Academic Dashboard does not store API keys or Agent credentials.',
		);
	}

	private renderAgentSettings(): void {
		new Setting(this.containerEl).setName('Agent handoff').setHeading();
		new Setting(this.containerEl)
			.setName('Selected agent')
			.setDesc('Dashboard remembers this target. Confirm it in the agent view before sending a prepared workflow.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('codex', 'Codex')
					.addOption('opencode', ['Open', 'Code'].join(''))
					.setValue(this.controller.getSettings().agent.selectedTarget)
					.onChange((value) => {
						const agent = this.controller.getSettings().agent;
						if (this.controller.setAgentSettings({
							...agent,
							selectedTarget: value as AgentSettings['selectedTarget'],
						})) {
							this.controller.refreshDashboardViews();
						}
					}),
			);
		new Setting(this.containerEl)
			.setName('Agent write-log retention')
			.setDesc('Days to retain minimal write-handoff metadata. Default: 30.')
			.addText((text) => {
				text.inputEl.type = 'number';
				text.inputEl.min = '1';
				text.inputEl.max = '3650';
				text.setValue(
					this.controller.getSettings().agent.writeLogRetentionDays.toString(),
				).onChange((value) => {
					const retention = Number(value);
					if (!Number.isInteger(retention)) return;
					this.controller.setAgentSettings({
						...this.controller.getSettings().agent,
						writeLogRetentionDays: retention,
					});
				});
			});
		new Setting(this.containerEl)
			.setName('Recorded write handoffs')
			.setDesc(t('settings.retainedLogs', {
				count: formatNumber(this.controller.getSettings().agentWriteLog.length),
			}));
	}
}
