/**
 * @file TAG翻译工具
 * @description 提供VNDB TAG的中文翻译功能
 * @module src/utils/tagTranslation
 * @author Pysio<qq593277393@outlook.com>
 * @copyright AGPL-3.0
 */

import vndbTagTranslationsRaw from '@/locales/VndbTag_zh_CN.json';

// 过滤掉元数据字段，只保留翻译内容
const vndbTagTranslations = Object.fromEntries(
    Object.entries(vndbTagTranslationsRaw).filter(([key]) => !key.startsWith('_'))
) as Record<string, string>;

/**
 * 翻译单个TAG
 * @param tag 原始英文TAG
 * @returns 翻译后的中文TAG，如果没有找到翻译则返回原TAG
 */
export function translateTag(tag: string): string {
    // 直接从翻译对象中查找翻译
    const translation = vndbTagTranslations[tag];
    return translation || tag;
}

/**
 * 翻译TAG数组
 * @param tags 原始英文TAG数组
 * @param enableTranslation 是否启用翻译，默认为true
 * @returns 翻译后的TAG数组
 */
export function translateTags(tags: string[], enableTranslation: boolean = true): string[] {
    if (!enableTranslation || !tags) {
        return tags || [];
    }

    return tags.map(tag => translateTag(tag));
}

/**
 * 获取TAG翻译对象（用于调试或其他用途）
 * @returns VNDB TAG翻译对象
 */
export function getTagTranslations(): Record<string, string> {
    return vndbTagTranslations;
}
