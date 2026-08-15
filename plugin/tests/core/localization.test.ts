import { describe, expect, it } from 'vitest';
import {
	configureLocalization,
	ENGLISH_RESOURCES,
	resolveLocale,
	SIMPLIFIED_CHINESE_RESOURCES,
	t,
	translate,
	translateEnglishSource,
} from '../../src/core/localization';

describe('locale resource foundation', () => {
	it('follows Obsidian locale in auto mode and defaults unsupported locales to English', () => {
		expect(resolveLocale('auto', 'zh-CN')).toBe('zh-CN');
		expect(resolveLocale('auto', 'en-GB')).toBe('en');
		expect(resolveLocale('auto', 'fr')).toBe('en');
		expect(resolveLocale('en', 'zh-CN')).toBe('en');
	});

	it('uses English as the final resource fallback', () => {
		expect(translate('zh-CN', 'write.undo')).toBe('撤销');
		expect(translate('zh-CN', 'write.undo', { 'write.undo': '撤回' })).toBe('撤回');
		expect(translate('en', 'write.conflict')).toContain('Nothing was overwritten');
	});

	it('keeps locale resources structurally complete and non-empty', () => {
		expect(Object.keys(SIMPLIFIED_CHINESE_RESOURCES)).toEqual(
			Object.keys(ENGLISH_RESOURCES),
		);
		expect(Object.values(ENGLISH_RESOURCES).every((value) => value.length > 0)).toBe(true);
	});

	it('uses semantic keys and leaves untranslatable product values intact', () => {
		configureLocalization('en-US');
		expect(t('agent.openClaudian')).toBe('Open Claudian');
		expect(translateEnglishSource('Codex')).toBe('Codex');
	});

	it('ships reviewed Simplified Chinese and falls back to English for unknown locales', () => {
		configureLocalization('zh-CN');
		expect(t('nav.research')).toBe('研究');
		expect(t('agent.reviewBoundary')).toContain('绝不会自动发送');
		configureLocalization('fr-FR');
		expect(t('nav.research')).toBe('Research');
	});
});
