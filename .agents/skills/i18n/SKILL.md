---
name: i18n
description: 使用 i18next-cli 检查、同步和整理本项目的国际化资源。涉及新增、修改、删除翻译键或国际化字符串，以及修复缺失翻译时使用。
---

# 国际化检查

在项目根目录执行以下流程。若检查失败，修复问题后从第 1 步重新开始，直到全部通过。

## 检查流程

1. 查看所有语言的翻译状态：

   ```bash
   pnpm i18n:status
   ```

2. 若目标语言未达到 100%，按需查看缺失项并补全翻译：

   ```bash
   pnpm i18n:status en-US --hide-translated
   pnpm i18n:status ja-JP --hide-translated
   pnpm i18n:status zh-TW --hide-translated
   ```

3. 翻译完整后，依次同步资源、提取键并格式化项目：

   ```bash
   pnpm i18n:sync
   pnpm i18n:extract
   pnpm format
   ```

4. `status` 可能漏报占位值，必须额外检查：

   ```bash
   rg "__MISSING__" src/locales
   ```

5. 若发现缺失翻译或 `__MISSING__`，修复后重复完整流程。

## 完成标准

- `pnpm i18n:status` 显示所有目标语言达到 100%。
- `rg "__MISSING__" src/locales` 无匹配结果。
