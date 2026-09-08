interface FileExplorerView<TFolder> {
	revealInFolder(folder: TFolder): Promise<void>;
	readonly fileItems?: Readonly<Record<string, unknown>>;
}

interface ExplorerLeaf {
	readonly view: unknown;
}

interface CollapsibleFolderItem {
	setCollapsed(collapsed: boolean): void;
}

function isFileExplorerView<TFolder>(
	value: unknown,
): value is FileExplorerView<TFolder> {
	return (
		typeof value === 'object' &&
		value !== null &&
		'revealInFolder' in value &&
		typeof value.revealInFolder === 'function'
	);
}

function isCollapsibleFolderItem(
	value: unknown,
): value is CollapsibleFolderItem {
	return (
		typeof value === 'object' &&
		value !== null &&
		'setCollapsed' in value &&
		typeof value.setCollapsed === 'function'
	);
}

function expandFolder(view: FileExplorerView<unknown>, path: string): void {
	const item = view.fileItems?.[path];
	if (!isCollapsibleFolderItem(item)) return;
	item.setCollapsed(false);
}

export async function revealFolderInExplorer<TLeaf extends ExplorerLeaf, TFolder>(
	leaf: TLeaf,
	revealLeaf: (leaf: TLeaf) => Promise<void>,
	folder: TFolder,
	folderPath: string,
): Promise<boolean> {
	await revealLeaf(leaf);
	const explorer = leaf.view;
	if (!isFileExplorerView<TFolder>(explorer)) return false;
	await explorer.revealInFolder(folder);
	expandFolder(explorer, folderPath);
	return true;
}
