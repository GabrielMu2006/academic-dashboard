export function restoreStableFocus(
	root: HTMLElement,
	selector: string,
	fallback?: HTMLElement,
): void {
	const searchable = root as HTMLElement & {
		find?: (value: string) => HTMLElement | null;
	};
	const target = typeof searchable.find === 'function'
		? searchable.find(selector)
		: null;
	focusElement(target ?? fallback);
}

export function focusElement(element?: HTMLElement | null): void {
	if (element && typeof element.focus === 'function') element.focus();
}
