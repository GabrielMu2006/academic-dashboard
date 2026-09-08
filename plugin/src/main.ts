import { moment, Notice, Plugin } from 'obsidian';
import {
	NativeRecentNotesAdapter,
	NativeRecentPapersAdapter,
	isNativeVaultNotePath,
} from './adapters/native-vault-academic-adapters';
import {
	NativeCalendarAdapter,
	NativeTaskWindowAdapter,
} from './adapters/native-calendar-task-adapters';
import {
	NativeObsidianActivityAdapter,
} from './adapters/local-activity-adapters';
import { GithubActivityAdapter } from './adapters/github-activity-adapter';
import {
	createObsidianGithubGraphqlPort,
	createObsidianGithubSecretPort,
} from './adapters/obsidian-github-port';
import {
	createObsidianMarkdownTaskPort,
	createObsidianAcademicMaterialDiagnosticPort,
	createObsidianCourseOverviewPort,
	createObsidianReviewVaultPort,
	createObsidianSpacedRepetitionPort,
	createObsidianVaultPort,
	openObsidianVaultNote,
	openObsidianVaultFile,
} from './adapters/obsidian-vault-port';
import {
	NativeReviewQueueAdapter,
	OptionalSpacedRepetitionAdapter,
} from './adapters/review-queue-adapters';
import { registerAcademicResearchBasesView } from './adapters/obsidian-bases-research-adapter';
import { ClaudianWorkflowAdapter } from './adapters/claudian-adapter';
import { NativeReadingQueueAdapter } from './adapters/native-reading-queue-adapter';
import { createObsidianClaudianPort } from './adapters/obsidian-claudian-port';
import { createObsidianConservativeWritePort } from './adapters/obsidian-conservative-write-port';
import {
	DASHBOARD_VIEW_ICON,
	DASHBOARD_VIEW_TITLE,
	DASHBOARD_VIEW_TYPE,
	CREATE_BOOK_READING_NOTE_COMMAND,
	CREATE_COURSE_NOTE_COMMAND,
	CREATE_PAPER_READING_NOTE_COMMAND,
	OPEN_DASHBOARD_COMMAND,
	DIAGNOSE_ACADEMIC_MATERIALS_COMMAND,
} from './constants';
import { DashboardView } from './dashboard-view';
import { buildDashboardViewState, decideRevealStrategy } from './lifecycle';
import {
	PageLayoutStore,
	restoreLayoutStoreData,
	type LayoutStoreDiagnostic,
} from './layout/page-layout-store';
import { DEFAULT_LOCAL_WIDGET_SETTINGS } from './core/local-widget-settings';
import { agentWriteLogEntryForHandoff } from './core/agent-write-log';
import { DashboardSettingTab } from './settings/dashboard-setting-tab';
import {
	registerAcademicWidgets,
	type PaperActionCommit,
	type PaperUndoState,
} from './widgets/academic-widgets';
import { registerActivityWidgets } from './widgets/activity-widgets';
import { createLocalWidgetRegistry } from './widgets/local-widgets';
import { createObsidianLocalWidgetServices } from './widgets/obsidian-local-widget-services';
import { registerPlanningWidgets } from './widgets/planning-widgets';
import { registerReviewQueueWidget, type ReviewQueueWidgetServices } from './widgets/review-queue-widget';
import { registerReviewSessionWidget } from './widgets/review-session-widget';
import { registerReadingQueueWidget } from './widgets/reading-queue-widget';
import { registerWeeklyReviewWidget } from './widgets/weekly-review-widget';
import { registerAgentWidgets } from './widgets/agent-widgets';
import { NoteCreationModal } from './templates/note-creation-modal';
import { AcademicMaterialDiagnosticModal } from './templates/academic-material-diagnostic-modal';
import { NoteTemplateService, type NoteCreationKind } from './templates/note-template-service';
import { createObsidianNoteTemplatePort } from './templates/obsidian-note-template-port';
import {
	DailyNoteService,
	dailyNotePathForDate,
} from './templates/daily-note-service';
import { requestLocalWriteConfirmation } from './templates/local-write-review-modal';
import {
	ConservativeWriteService,
	type ConservativeWriteServiceOptions,
} from './core/conservative-writes';
import { GithubContributionClient } from './core/github-contributions';
import {
	GITHUB_SECRET_STORAGE_KEY,
	saveGithubPatToSecretStorage,
} from './core/github-settings';
import type { RecentPaperItem } from './core/academic-notes';
import type { ReadingProgressRecord, ReadingQueueItem } from './core/reading-queue';
import type { PaperStatus } from './core/metadata-settings';
import { configureLocalization } from './core/localization';
import { NativeCourseOverviewAdapter } from './adapters/native-course-overview-adapter';
import { registerCourseOverviewWidget } from './widgets/course-overview-widget';
import { buildWeeklyReviewDraft } from './core/weekly-review';
import { WeeklyReviewService } from './templates/weekly-review-service';

export default class AcademicDashboardPlugin extends Plugin {
	private layoutStore: PageLayoutStore | null = null;
	private localWrites: ConservativeWriteService | null = null;
	private readonly taskUndos: Array<{ readonly token: string; readonly path: string }> = [];
	private readonly reviewUndos: Array<{ readonly token: string; readonly path: string }> = [];
	private readonly paperUndos: PaperUndoState[] = [];

	async onload(): Promise<void> {
		configureLocalization(moment.locale());
		const data: unknown = await this.loadData();
		const restored = restoreLayoutStoreData(data);
		this.layoutStore = new PageLayoutStore({
			initial: restored.settings,
			save: (settings) => this.saveData(settings),
			persistence: restored.persistence,
			onDiagnostic: (diagnostic) => this.reportLayoutDiagnostic(diagnostic),
		});
		if (data != null && restored.source !== 'stored') {
			this.reportLayoutRestore(restored.source, restored.issues);
		}
		if (restored.persistence === 'blocked-future-schema') {
			new Notice(
				'Academic dashboard settings were created by a newer version. Settings and layout changes are disabled to protect the saved data.',
				0,
			);
		}
		if (restored.source === 'migrated') {
			this.layoutStore.persistCurrent();
		}
		this.layoutStore.cleanAgentWriteLog(new Date());
		this.layoutStore.cleanLocalWriteLog(new Date());
		this.registerInterval(
			window.setInterval(() => {
				this.layoutStore?.cleanAgentWriteLog(new Date());
				this.layoutStore?.cleanLocalWriteLog(new Date());
			}, 6 * 60 * 60 * 1_000),
		);
		const widgetRegistry = createLocalWidgetRegistry(
			createObsidianLocalWidgetServices(
				this.app,
				() =>
					this.layoutStore?.getWidgetSettings() ??
					DEFAULT_LOCAL_WIDGET_SETTINGS,
				() =>
					this.layoutStore?.getTemplateSettings().courseNote.destinationFolder ??
					restored.settings.templates.courseNote.destinationFolder,
			),
		);
		const vaultPort = createObsidianVaultPort(this.app);
		const conservativePort = createObsidianConservativeWritePort(this.app);
		const githubSecrets = createObsidianGithubSecretPort(this.app);
		const githubActivity = new GithubActivityAdapter({
			client: new GithubContributionClient(
				githubSecrets,
				createObsidianGithubGraphqlPort(),
			),
			getSettings: () => this.layoutStore?.getGithubSettings() ?? restored.settings.github,
			updateSettings: (settings) => this.layoutStore?.updateGithubSettings(settings) ?? false,
			hasSecret: (id) => {
				try {
					return githubSecrets.listSecretIds().includes(id);
				} catch {
					return false;
				}
			},
		});
		const writeOptions: ConservativeWriteServiceOptions = {
			log: (entry) => this.layoutStore?.appendLocalWriteLog(entry),
		};
		this.localWrites = new ConservativeWriteService(conservativePort, writeOptions);
		const noteTemplates = new NoteTemplateService(
			createObsidianNoteTemplatePort(this.app, conservativePort),
			() => this.layoutStore?.getTemplateSettings() ?? restored.settings.templates,
			() => this.layoutStore?.getMetadataSettings() ?? restored.settings.metadata,
			() => new Date(),
			writeOptions,
		);
		const dailyNotes = new DailyNoteService(
			conservativePort,
			() => this.layoutStore?.getSnapshot().localWrites ?? restored.settings.localWrites,
			writeOptions,
		);
		const weeklyReviews = new WeeklyReviewService(conservativePort, writeOptions);
		registerWeeklyReviewWidget(widgetRegistry, {
			loadDraft: async () => buildWeeklyReviewDraft({
				now: new Date(),
				files: vaultPort.listMarkdownFiles().filter((file) => isNativeVaultNotePath(file.path)),
				localWrites: this.layoutStore?.getLocalWriteLog() ?? restored.settings.localWriteLog,
				agentWrites: this.layoutStore?.getAgentWriteLog() ?? restored.settings.agentWriteLog,
			}),
			reviewAndCreate: async (draft, editedContent) => {
				const preview = await weeklyReviews.prepare(draft, editedContent);
				const confirmed = await requestLocalWriteConfirmation(this.app, {
					title: `Review Weekly Review for ${draft.range.startDate}`,
					summary: 'Confirm creation of this edited draft. Existing files are never overwritten.',
					path: preview.path,
					afterLabel: 'Edited weekly review (bounded to 2,000 characters when needed)',
					after: preview.preview.after,
					confirmLabel: 'Create this Weekly Review',
				});
				if (!confirmed) return 'cancelled';
				const result = await weeklyReviews.confirm(preview);
				new Notice(`Created ${result.path}.`);
				await openObsidianVaultNote(this.app, result.path);
				return 'created';
			},
		});
		registerAcademicWidgets(widgetRegistry, {
			recentNotes: new NativeRecentNotesAdapter(vaultPort),
			recentPapers: new NativeRecentPapersAdapter(
				vaultPort,
				() => this.layoutStore?.getMetadataSettings() ?? restored.settings.metadata,
				() => this.layoutStore?.getLocalWriteSettings() ?? restored.settings.localWrites,
			),
			openNote: (path) => openObsidianVaultNote(this.app, path),
			setPaperStatus: (item, status) => this.commitPaperStatus(item, status),
			setPaperFavorite: (item, favorite) => this.commitPaperFavorite(item, favorite),
			undoPaperAction: (token) => this.undoPaperAction(token),
			getPaperUndos: () => Object.freeze(
				this.paperUndos.map((undo) => Object.freeze({ ...undo })),
			),
			getSavedResearchViews: () => this.layoutStore?.getWidgetSettings().savedResearchViews ?? restored.settings.widgets.savedResearchViews,
			setSavedResearchViews: (views) => {
				const widgets = this.layoutStore?.getWidgetSettings() ?? restored.settings.widgets;
				return this.layoutStore?.updateWidgetSettings({ ...widgets, savedResearchViews: views }) ?? false;
			},
		});
		const readingQueue = new NativeReadingQueueAdapter(
			vaultPort,
			() => this.layoutStore?.getMetadataSettings() ?? restored.settings.metadata,
		);
		const findReadingRecord = (records: readonly ReadingProgressRecord[], item: ReadingQueueItem): number =>
			records.findIndex((record) => record.kind === item.kind && (
				record.path === item.path ||
				(item.stableId !== undefined && record.stableId === item.stableId) ||
				record.signature === item.signature
			));
		const readingRecord = (item: ReadingQueueItem, order: number, patch: Partial<ReadingProgressRecord> = {}): ReadingProgressRecord => ({
			path: item.path, kind: item.kind, status: item.status, order,
			nextStep: item.nextStep, position: item.position, positionUnit: item.positionUnit,
			...(item.stableId ? { stableId: item.stableId } : {}), signature: item.signature, ...patch,
		});
		registerReadingQueueWidget(widgetRegistry, {
			queue: readingQueue,
			getRecords: () => this.layoutStore?.getWidgetSettings().readingQueue ?? restored.settings.widgets.readingQueue,
			updateRecord: (item, patch) => {
				const widgets = this.layoutStore?.getWidgetSettings() ?? restored.settings.widgets;
				const records = [...widgets.readingQueue];
				const index = findReadingRecord(records, item);
				const next = readingRecord(item, index >= 0 ? records[index]!.order : records.length, patch);
				if (index >= 0) records[index] = next; else records.push(next);
				return this.layoutStore?.updateWidgetSettings({ ...widgets, readingQueue: records }) ?? false;
			},
			moveRecord: (item, direction, visible) => {
				const widgets = this.layoutStore?.getWidgetSettings() ?? restored.settings.widgets;
				const records = [...widgets.readingQueue];
				for (const [order, visibleItem] of visible.entries()) {
					if (findReadingRecord(records, visibleItem) < 0) records.push(readingRecord(visibleItem, order));
				}
				const index = findReadingRecord(records, item);
				const sameKind = records.map((record, recordIndex) => ({ record, recordIndex })).filter(({ record }) => record.kind === item.kind).sort((left, right) => left.record.order - right.record.order);
				const position = sameKind.findIndex(({ recordIndex }) => recordIndex === index);
				const target = sameKind[position + direction];
				if (!target) return false;
				const currentOrder = records[index]!.order;
				records[index] = { ...records[index]!, order: target.record.order };
				records[target.recordIndex] = { ...target.record, order: currentOrder };
				return this.layoutStore?.updateWidgetSettings({ ...widgets, readingQueue: records }) ?? false;
			},
			openNote: (path) => openObsidianVaultNote(this.app, path),
			subscribeToVaultChanges: (callback) => {
				const refs = [
					this.app.vault.on('create', callback),
					this.app.vault.on('delete', callback),
					this.app.vault.on('rename', callback),
					this.app.vault.on('modify', callback),
				];
				return () => refs.forEach((ref) => this.app.vault.offref(ref));
			},
		});
		const markdownTaskPort = createObsidianMarkdownTaskPort(this.app);
		const taskWindow = new NativeTaskWindowAdapter(markdownTaskPort);
		registerPlanningWidgets(widgetRegistry, {
			now: () => new Date(),
			calendar: new NativeCalendarAdapter(vaultPort),
			taskWindow,
			dailyNotePath: (date) => dailyNotePathForDate(
				this.layoutStore?.getLocalWriteSettings().dailyNote ?? restored.settings.localWrites.dailyNote,
				date,
			) ?? '',
			getTodayFocus: () => this.layoutStore?.getWidgetSettings().todayFocus ?? restored.settings.widgets.todayFocus,
			toggleTaskFocus: (task) => {
				const widgets = this.layoutStore?.getWidgetSettings() ?? restored.settings.widgets;
				const index = widgets.todayFocus.findIndex((item) => item.path === task.path && item.line === task.line);
				const todayFocus = index >= 0
					? widgets.todayFocus.filter((_, itemIndex) => itemIndex !== index)
					: widgets.todayFocus.length >= 3
						? null
						: [...widgets.todayFocus, { label: task.text.slice(0, 80), path: task.path, line: task.line }];
				if (!todayFocus) return 'limit';
				return this.layoutStore?.updateWidgetSettings({ ...widgets, todayFocus })
					? index >= 0 ? 'removed' : 'added'
					: 'unavailable';
			},
			focusPathExists: async (focus) => {
				if (focus.line === undefined) return this.app.vault.getAbstractFileByPath(focus.path) !== null;
				try {
					const content = await markdownTaskPort.readMarkdown(focus.path);
					const line = content.split(/\r\n|\n|\r/u)[focus.line - 1];
					return typeof line === 'string' && /^\s*[-*+]\s+\[\s\]\s+/u.test(line);
				} catch {
					return false;
				}
			},
			scheduleRefresh: (callback, delay) => {
				const timer = window.setTimeout(callback, delay);
				return () => window.clearTimeout(timer);
			},
			openNote: (path) => openObsidianVaultNote(this.app, path),
				reviewTaskToggle: async (task) => {
					const writes = this.localWrites;
					if (!writes || !task.sourceFingerprint || task.sourceLine === undefined) {
						throw new Error('A safe Native task target is unavailable.');
					}
					const preview = await writes.prepareEdit({
					operation: 'task-toggle',
					path: task.path,
						line: task.line,
						completed: true,
						expectedFingerprint: task.sourceFingerprint,
						expectedLine: task.sourceLine,
				});
				const confirmed = await requestLocalWriteConfirmation(this.app, {
					title: 'Review task completion',
					summary: 'Confirm this one exact Native Markdown checkbox change.',
					path: preview.path,
					beforeLabel: 'Before',
					before: preview.preview.before,
					afterLabel: 'After',
					after: preview.preview.after,
					confirmLabel: 'Complete this task',
				});
				if (!confirmed) return { outcome: 'cancelled' };
				const result = await writes.commit(preview);
				if (!result.undoToken) throw new Error('Undo token was not created.');
				this.taskUndos.push({ token: result.undoToken, path: result.path });
				new Notice(`Updated one task in ${result.path}.`);
				return {
					outcome: 'committed',
					undoToken: result.undoToken,
					path: result.path,
				};
			},
			undoTaskToggle: async (token) => {
				const writes = this.localWrites;
				if (!writes) throw new Error('The local write session is unavailable.');
				const result = await writes.undo(token);
				const index = this.taskUndos.findIndex((undo) => undo.token === token);
				if (index >= 0) this.taskUndos.splice(index, 1);
				new Notice(`Restored one task in ${result.path}.`);
			},
			getTaskUndos: () =>
				Object.freeze(this.taskUndos.map((undo) => Object.freeze({ ...undo }))),
			createDailyNote: async (date) => {
				const preview = await dailyNotes.preview(date);
				const confirmed = await requestLocalWriteConfirmation(this.app, {
					title: `Review Daily Note for ${date}`,
					summary: 'Confirm creation of this one new note. Existing files are never overwritten.',
					path: preview.path,
					afterLabel: 'Content preview (bounded to 2,000 characters when needed)',
					after: preview.prepared.preview.after,
					confirmLabel: 'Create this Daily Note',
				});
				if (!confirmed) return 'cancelled';
				const result = await dailyNotes.confirm(preview);
				new Notice(`Created ${result.path}.`);
				await openObsidianVaultNote(this.app, result.path);
				return 'created';
			},
			createAcademicNote: async (kind) => {
				this.openNoteCreationModal(kind, noteTemplates);
			},
		});
		registerActivityWidgets(widgetRegistry, {
			now: () => new Date(),
			obsidian: new NativeObsidianActivityAdapter(vaultPort),
			github: githubActivity,
		});
		const nativeReviews = new NativeReviewQueueAdapter(
			createObsidianReviewVaultPort(this.app),
			() => this.layoutStore?.getMetadataSettings() ?? restored.settings.metadata,
		);
		registerCourseOverviewWidget(widgetRegistry, {
			now: () => new Date(),
			overview: new NativeCourseOverviewAdapter({
				vault: createObsidianCourseOverviewPort(this.app),
				tasks: taskWindow,
				reviews: nativeReviews,
				getMetadata: () => this.layoutStore?.getMetadataSettings() ?? restored.settings.metadata,
				getDailyNotePath: (date) => dailyNotePathForDate(
					this.layoutStore?.getLocalWriteSettings().dailyNote ?? restored.settings.localWrites.dailyNote,
					date,
				) ?? '',
			}),
			getRootFolder: () => this.layoutStore?.getTemplateSettings().courseNote.destinationFolder ??
				restored.settings.templates.courseNote.destinationFolder,
			getCurrentTerm: () => this.layoutStore?.getWidgetSettings().currentTerm ?? restored.settings.widgets.currentTerm,
			openFile: (path) => openObsidianVaultFile(this.app, path),
			subscribeToVaultChanges: (callback) => {
				const refs = [
					this.app.vault.on('create', callback),
					this.app.vault.on('delete', callback),
					this.app.vault.on('rename', callback),
					this.app.vault.on('modify', callback),
				];
				return () => refs.forEach((ref) => this.app.vault.offref(ref));
			},
		});
		const reviewServices: ReviewQueueWidgetServices = {
			now: () => new Date(),
			reviews: new OptionalSpacedRepetitionAdapter(
				createObsidianSpacedRepetitionPort(this.app),
				nativeReviews,
			),
			openNote: (path) => openObsidianVaultNote(this.app, path),
			reviewDate: async (item, nextReviewDate) => {
				const writes = this.localWrites;
				if (!writes || !item.reviewTarget) {
					throw new Error('A safe Native review marker is unavailable.');
				}
				const preview = await writes.prepareEdit({
					operation: 'review-date',
					path: item.path,
						line: item.reviewTarget.line,
						nextReviewDate,
						expectedFingerprint: item.reviewTarget.sourceFingerprint,
						expectedLine: item.reviewTarget.sourceLine,
				});
				const confirmed = await requestLocalWriteConfirmation(this.app, {
					title: 'Review next review date',
					summary: 'Confirm this one exact Native Markdown review marker change.',
					path: preview.path,
					beforeLabel: 'Before',
					before: preview.preview.before,
					afterLabel: 'After',
					after: preview.preview.after,
					confirmLabel: 'Update review date',
				});
				if (!confirmed) return { outcome: 'cancelled' };
				const result = await writes.commit(preview);
				if (!result.undoToken) throw new Error('Undo token was not created.');
				this.reviewUndos.push({ token: result.undoToken, path: result.path });
				new Notice(`Updated one review marker in ${result.path}.`);
				return {
					outcome: 'committed',
					undoToken: result.undoToken,
					path: result.path,
				};
			},
			undoReviewDate: async (token) => {
				const writes = this.localWrites;
				if (!writes) throw new Error('The local write session is unavailable.');
				const result = await writes.undo(token);
				const index = this.reviewUndos.findIndex((undo) => undo.token === token);
				if (index >= 0) this.reviewUndos.splice(index, 1);
				new Notice(`Restored one review marker in ${result.path}.`);
			},
			getReviewUndos: () =>
				Object.freeze(this.reviewUndos.map((undo) => Object.freeze({ ...undo }))),
		};
		registerReviewQueueWidget(widgetRegistry, reviewServices);
		registerReviewSessionWidget(widgetRegistry, reviewServices);
		registerAcademicResearchBasesView(
			this,
			() => this.layoutStore?.getMetadataSettings() ?? restored.settings.metadata,
			(path) => openObsidianVaultNote(this.app, path),
		);
		const claudian = new ClaudianWorkflowAdapter(
			createObsidianClaudianPort(this.app),
		);
		registerAgentWidgets(widgetRegistry, {
			claudian,
			getAgentSettings: () =>
				this.layoutStore?.getAgentSettings() ?? restored.settings.agent,
			setAgentSettings: (settings) => {
				const updated = this.layoutStore?.updateAgentSettings(settings) ?? false;
				if (updated) this.refreshDashboardViews();
				return updated;
			},
			activeNotePath: () => this.app.workspace.getActiveFile()?.path ?? null,
			dailyNotePath: () => {
				const localWrites =
					this.layoutStore?.getLocalWriteSettings() ?? restored.settings.localWrites;
				const path = dailyNotePathForDate(
					localWrites.dailyNote,
					moment().format('YYYY-MM-DD'),
				);
				return path && this.app.vault.getMarkdownFiles().some((file) => file.path === path)
					? path
					: null;
			},
			academicMetadata: () =>
				this.layoutStore?.getMetadataSettings() ?? restored.settings.metadata,
			getRequestLog: () =>
				this.layoutStore?.getAgentWriteLog() ?? restored.settings.agentWriteLog,
			markRequestComplete: (entry) =>
				this.layoutStore?.markAgentRequestComplete(entry) ?? false,
			openNote: (path) => openObsidianVaultNote(this.app, path),
			creationContext: async (workflowId, title) => {
				const kind = workflowId === 'create-course-note'
					? 'course-note'
					: workflowId === 'create-paper-reading-note'
						? 'paper-reading'
						: 'book-reading';
				const preparation = await noteTemplates.prepareAgentCreation({
					kind,
					title,
				});
				return {
					destination: preparation.destination,
					resolvedPath: preparation.path,
					...(preparation.templatePath
						? { templatePath: preparation.templatePath }
						: {}),
					...(preparation.templateContent
						? { templateContent: preparation.templateContent }
						: {}),
				};
			},
			onHandoff: (request, result) => {
				const entry = agentWriteLogEntryForHandoff(request, result, new Date());
				if (entry) this.layoutStore?.appendAgentWriteLog(entry);
			},
		});

		this.registerView(
			DASHBOARD_VIEW_TYPE,
			(leaf) =>
				new DashboardView(leaf, {
					widgetRegistry,
					initialPageId: this.layoutStore?.getDefaultPage() ?? 'home',
					getPageLayout: (pageId) =>
						this.layoutStore?.getVisiblePage(pageId) ?? [],
					onPageLayoutChange: (pageId, layouts) => {
						this.layoutStore?.updatePage(pageId, layouts);
					},
					onResetPageLayout: (pageId) => {
						this.layoutStore?.resetPage(pageId);
					},
				}),
		);

		this.addSettingTab(
			new DashboardSettingTab(this.app, this, {
				getSettings: () => this.layoutStore?.getSnapshot() ?? restored.settings,
				getWidgetDefinitions: () => widgetRegistry.definitions(),
				setDefaultPage: (pageId) =>
					this.layoutStore?.updateDefaultPage(pageId) ?? false,
				setWidgetVisible: (widgetId, visible) =>
					this.layoutStore?.setWidgetVisible(widgetId, visible) ?? false,
				setLocalWidgetSettings: (settings) =>
					this.layoutStore?.updateWidgetSettings(settings) ?? false,
				setMetadataSettings: (settings) =>
					this.layoutStore?.updateMetadataSettings(settings) ?? false,
				setLocalWriteSettings: (settings) =>
					this.layoutStore?.updateLocalWriteSettings(settings) ?? false,
				setTemplateSettings: (settings) =>
					this.layoutStore?.updateTemplateSettings(settings) ?? false,
				setAgentSettings: (settings) =>
					this.layoutStore?.updateAgentSettings(settings) ?? false,
				setGithubSettings: (settings) =>
					this.layoutStore?.updateGithubSettings(settings) ?? false,
				hasGithubPat: () => {
					try {
						const key = this.layoutStore?.getGithubSettings().secretStorageKey ||
							GITHUB_SECRET_STORAGE_KEY;
						return githubSecrets.listSecretIds().includes(key);
					} catch {
						return false;
					}
				},
				saveGithubPat: (value) => {
					const github = this.layoutStore?.getGithubSettings() ?? restored.settings.github;
					const updated = saveGithubPatToSecretStorage(githubSecrets, github, value);
					return updated
						? this.layoutStore?.updateGithubSettings(updated) ?? false
						: false;
				},
				resetPageLayout: (pageId) => this.layoutStore?.resetPage(pageId),
				resetAllLayouts: () => this.layoutStore?.resetAllPages(),
				refreshDashboardViews: () => this.refreshDashboardViews(),
				showDefaultPage: () => this.showDefaultPage(),
			}),
		);

		this.addCommand({
			id: OPEN_DASHBOARD_COMMAND,
			name: 'Open dashboard',
			callback: () => {
				void this.revealDashboard();
			},
		});

		this.addCommand({
			id: DIAGNOSE_ACADEMIC_MATERIALS_COMMAND,
			name: 'Diagnose academic materials',
			callback: () => {
				new AcademicMaterialDiagnosticModal(this.app, {
					vault: createObsidianAcademicMaterialDiagnosticPort(this.app),
					getMetadata: () => this.layoutStore?.getMetadataSettings() ?? restored.settings.metadata,
					getRootFolder: () => this.layoutStore?.getTemplateSettings().courseNote.destinationFolder ??
						restored.settings.templates.courseNote.destinationFolder,
					getPaperRootFolder: () => this.layoutStore?.getTemplateSettings().paperReading.destinationFolder ??
						restored.settings.templates.paperReading.destinationFolder,
				}).open();
			},
		});

		this.addNoteCreationCommand(
			CREATE_COURSE_NOTE_COMMAND,
			'Create course note',
			'course-note',
			noteTemplates,
		);
		this.addNoteCreationCommand(
			CREATE_PAPER_READING_NOTE_COMMAND,
			'Create paper-reading note',
			'paper-reading',
			noteTemplates,
		);
		this.addNoteCreationCommand(
			CREATE_BOOK_READING_NOTE_COMMAND,
			'Create book-reading note',
			'book-reading',
			noteTemplates,
		);

		this.addRibbonIcon(DASHBOARD_VIEW_ICON, DASHBOARD_VIEW_TITLE, () => {
			void this.revealDashboard();
		});
	}

	private addNoteCreationCommand(
		id: string,
		name: string,
		kind: NoteCreationKind,
		service: NoteTemplateService,
	): void {
		this.addCommand({
			id,
			name,
			callback: () => {
				this.openNoteCreationModal(kind, service);
			},
		});
	}

	private async commitPaperStatus(
		item: RecentPaperItem,
		status: PaperStatus,
	): Promise<PaperActionCommit> {
		const field = item.actions.status.field;
		if (item.actions.status.state !== 'available') {
			throw new Error('Paper status writing is unavailable.');
		}
		return this.commitPaperAction(
			item,
			field,
			'Reading status',
			() => this.localWrites!.prepareEdit({
				operation: 'paper-status',
				path: item.path,
				field,
				value: status,
				expectedValue: item.actions.status.current!,
				paper: item.actions.identity,
			}),
		);
	}

	private async commitPaperFavorite(
		item: RecentPaperItem,
		favorite: boolean,
	): Promise<PaperActionCommit> {
		const field = item.actions.favorite.field;
		if (item.actions.favorite.state !== 'available') {
			throw new Error('Paper favorite writing is unavailable.');
		}
		return this.commitPaperAction(
			item,
			field,
			'Favorite',
			() => this.localWrites!.prepareEdit({
				operation: 'paper-favorite',
				path: item.path,
				field,
				value: favorite,
				expectedValue: item.actions.favorite.present
					? item.actions.favorite.current
					: null,
				paper: item.actions.identity,
			}),
		);
	}

	private async commitPaperAction(
		item: RecentPaperItem,
		field: string,
		label: string,
		prepare: () => ReturnType<ConservativeWriteService['prepareEdit']>,
	): Promise<PaperActionCommit> {
		const writes = this.localWrites;
		if (!writes) throw new Error('The local write session is unavailable.');
		const result = await writes.commit(await prepare());
		if (!result.undoToken) throw new Error('Undo token was not created.');
		const existing = this.paperUndos.findIndex(
			(undo) => undo.path === item.path && undo.field === field,
		);
		const undo = Object.freeze({
			token: result.undoToken,
			path: result.path,
			field,
			label,
		});
		if (existing >= 0) this.paperUndos.splice(existing, 1, undo);
		else this.paperUndos.push(undo);
		new Notice(`Updated ${label.toLocaleLowerCase()} in ${result.path}.`);
		return Object.freeze({
			outcome: 'committed',
			undoToken: result.undoToken,
			path: result.path,
			field,
		});
	}

	private async undoPaperAction(token: string): Promise<void> {
		const writes = this.localWrites;
		if (!writes) throw new Error('The local write session is unavailable.');
		const result = await writes.undo(token);
		const index = this.paperUndos.findIndex((undo) => undo.token === token);
		if (index >= 0) this.paperUndos.splice(index, 1);
		new Notice(`Restored one paper field in ${result.path}.`);
	}

	private openNoteCreationModal(
		kind: NoteCreationKind,
		service: NoteTemplateService,
	): void {
		const templates = this.layoutStore?.getTemplateSettings();
		const setting = kind === 'course-note'
			? templates?.courseNote
			: kind === 'paper-reading'
				? templates?.paperReading
				: templates?.bookReading;
		if (!setting) return;
		new NoteCreationModal(this.app, {
			kind,
			destinationFolder: setting.destinationFolder,
			preview: (title) => service.preview({ kind, title }),
			confirm: (preview) => service.confirm(preview),
			openCreatedNote: (path) => openObsidianVaultNote(this.app, path),
		}).open();
	}

	onunload(): void {
		this.localWrites?.clearUndoHistory();
		this.localWrites = null;
		this.taskUndos.length = 0;
		this.reviewUndos.length = 0;
		this.paperUndos.length = 0;
		void this.layoutStore?.flush();
		this.layoutStore = null;
	}

	private reportLayoutRestore(
		source: 'migrated' | 'fallback',
		issues: readonly { readonly code: string; readonly path: string }[],
	): void {
		const issueSummary = issues.map(({ code, path }) => `${code}:${path}`).join(', ');
		console.warn(
			`[Academic Dashboard] Layout ${source}.` +
				(issueSummary ? ` Diagnostics: ${issueSummary}` : ''),
		);
	}

	private reportLayoutDiagnostic(diagnostic: LayoutStoreDiagnostic): void {
		if (diagnostic.code === 'layout_save_failed') {
			console.warn('[Academic Dashboard] Layout save failed.', diagnostic.error);
			return;
		}
		const issueSummary = diagnostic.issues
			.map(({ code, path }) => `${code}:${path}`)
			.join(', ');
		console.warn(
			`[Academic Dashboard] ${diagnostic.code}. Diagnostics: ${issueSummary}`,
		);
	}

	private refreshDashboardViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)) {
			if (leaf.view instanceof DashboardView) leaf.view.refresh();
		}
	}

	private showDefaultPage(): void {
		const pageId = this.layoutStore?.getDefaultPage() ?? 'home';
		for (const leaf of this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)) {
			if (leaf.view instanceof DashboardView) leaf.view.showPage(pageId);
		}
	}

	private async revealDashboard(): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);
		if (decideRevealStrategy(leaves.length) === 'reveal') {
			const leaf = leaves[0];
			if (leaf) {
				await this.app.workspace.revealLeaf(leaf);
				return;
			}
		}

		const leaf = this.app.workspace.getLeaf(true);
		await leaf.setViewState(buildDashboardViewState());
		await this.app.workspace.revealLeaf(leaf);
	}
}
