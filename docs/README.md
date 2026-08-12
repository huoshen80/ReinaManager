# 项目文档

本目录同时面向开发者和 AI Agent。文档按任务拆分，阅读时应逐层进入，不要一次加载全部文件。

## 阅读方式

1. 先读本页，判断任务属于哪个主题。
2. 需要全局上下文时，再读 [`architecture/README.md`](architecture/README.md)。
3. 只打开与当前改动相关的专题文档。
4. 文档只解释稳定的边界和约束；函数签名、字段和实现细节以代码为准。

## 任务导航

| 任务 | 阅读文档 |
| --- | --- |
| 了解整体架构、目录或跨层通信 | [`architecture/README.md`](architecture/README.md) |
| 修改 React 页面、组件、Hook、Query 或 Store | [`architecture/frontend.md`](architecture/frontend.md) |
| 修改 Tauri command、Rust 模块、数据库或原生能力 | [`architecture/backend.md`](architecture/backend.md) |
| 修改游戏列表、`GameIndex` 或 Query 缓存 | [`architecture/game-library.md`](architecture/game-library.md) |
| 修改外部元数据源、搜索或展示合并 | [`architecture/metadata.md`](architecture/metadata.md) |
| 新增或修改国际化字符串 | [i18n Skill](../.agents/skills/i18n/SKILL.md) |

## 维护原则

- 一份文档只回答一个主题。
- 通用规则放 `AGENTS.md`，专题知识放 `docs`，可执行流程放 Skill。
- 不复制大段代码。优先记录职责、边界、数据流和修改入口。
- 改动架构边界时，同步更新导航和对应专题文档。
