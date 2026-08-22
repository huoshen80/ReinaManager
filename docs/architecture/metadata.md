# 元数据适配架构

本文档描述外部游戏元数据的注册、请求、标准化和展示合并边界。

## 模块地图

```text
src/metadata/
├── sourceAdapter.ts       Adapter 接口、请求上下文与绑定器
├── sourceRegistry.ts      Adapter 注册表和查询入口
├── constants.ts           注册、搜索和混合源常量
├── sourceCandidate.ts     搜索候选的统一中间形态
├── sourceRecord.ts        聚合 `sources` 记录的读取工具
├── sourceAutoResolve.ts   单源自动匹配
├── adapters/              各数据源差异
├── api/                   HTTP 客户端、限流与各源 API
└── data/                  搜索编排、数据转换和展示合并
```

当前注册源由 `SOURCE_ADAPTERS` 决定，包括 BGM、VNDB、YMGal、Kungal、DLsite、ErogameScape 和 Hikarinagi。不在文档中复制派生源列表；以 `sourceRegistry.ts` 和 `constants.ts` 为准。

## Adapter 边界

`MetadataSourceAdapter<TData>` 将每个数据源统一为以下能力：

- 描述源标识、显示名和图标。
- 校验外部 ID，生成外部页面 URL。
- 按 ID 获取 `GameMetadataDraft`。
- 按名称搜索 `SourceCandidate<TData>[]`。
- 必要时在用户选中后继续补全。
- 将源私有数据投影为统一展示字段。

Adapter 只处理本数据源的差异。混合搜索、优先级合并、写入本地数据库和 UI 不属于 Adapter。

## 请求上下文

`MetadataRequestContext` 携带一次元数据会话共享的信息：代理、取消信号、剧透等级和认证 token。`bindSourceAdapters` 将该上下文绑定到 adapters，业务流只需传入 `limit` 或 `enrichCrossSource` 等单次选项。

请求上下文由 `src/services/requestContext.ts` 与认证 service 组装，不要在页面或 Adapter 中重复读取全局设置。

## 数据形态

| 形态 | 职责 |
| --- | --- |
| 源 API 原始类型 | Adapter 内部解析和源特有字段 |
| `SourceCandidate<TData>` | 统一搜索候选，同时保留原始源数据和标准展示字段 |
| `GameMetadataDraft` | 可供新增/更新流程使用的标准化草稿 |
| `GameSourceRecord` | 存入 `game_sources` 聚合的外部 ID 和 JSON 数据 |
| `GameData` | 按当前源、混合规则和自定义覆盖展平的 UI 数据 |

## 主要数据流

### 单源搜索

```text
UI → GameMetadataSession
→ bound adapter.searchByName 或 fetchById
→ SourceCandidate
→ adapter.enrichOnSelect（可选）
→ GameMetadataDraft
```

### 混合搜索

```text
UI → GameMetadataSession
→ 从 MIXED_SOURCE_KEYS 选取启用 adapters
→ 并行搜索，保留每个源的成功/失败结果
→ 用户选择或自动解析
→ 必要时补全所选候选
→ 组合 GameMetadataDraft
```

单个源失败不应立即使混合搜索失败；只有所有已尝试源都失败时才向上抛出整体错误。

### 展示合并

```text
FullGameData.sources
→ sourceRecord 建立源映射
→ 各 Adapter.toDisplayFields
→ displayMergeRules 按字段优先级合并
→ custom_data 覆盖/补充
→ GameData
```

### 云端收藏导入

```text
BGM / VNDB / Hikarinagi 用户收藏
→ 统一收藏候选（来源 ID、状态、评分、评论、预览）
→ 按同源 ID 排除本地已有游戏
→ 获取完整 GameMetadataDraft
→ 批量写入 localpath 为空的云端游戏
```

- BGM 收藏列表只用于预览和个人数据，选中后逐项读取完整条目详情。
- VNDB 在 `ulist` 中显式选择个人字段及嵌套 `vn` 详情，同一次分页请求完成转换。
- Hikarinagi 状态列表用于预览和个人数据，选中后逐项读取完整 Galgame 详情。
- 收藏状态写入 `games.clear`，有效评分和非空评论写入 `custom_data`。详情失败的项目不使用预览数据降级入库。
- 导入任务复用批量新增、身份去重和游戏缓存 patch；外部 API 请求统一沿用请求上下文、取消信号与限速队列。

字段优先级属于 `displayMergeRules.ts`，不应复制到 Adapter 或 UI。

## HTTP 边界

`src/metadata/api/http.ts` 统一使用 Tauri HTTP，并处理：

- query 参数、JSON/文本响应与 HTTP 错误。
- 代理和局域网绕过。
- `AbortSignal` 取消。
- 按数据源限流、429 退避和稳定错误分类。

新 API 实现应复用该边界，不在 Adapter 里自建重复 HTTP 客户端。

## 新增数据源

1. 在 `src/types` 定义源数据类型，并扩展 `SourceType` / `SOURCE_TYPES`。
2. 在 `metadata/api` 实现该源请求和响应转换。
3. 在 `metadata/adapters` 实现 `MetadataSourceAdapter<TData>`。
4. 在 `sourceRegistry.ts` 注册 Adapter 并扩展 `SourceAdapterMap`。
5. 根据产品行为调整 `constants.ts` 中的搜索/混合源集合和默认值。
6. 若新源对字段合并有意义，更新 `displayMergeRules.ts`。
7. 更新跨层类型、国际化文案和相关设置 UI，再按 i18n Skill 验证。

新源应尽可能通过 registry 自动进入通用流程。仅在有真实产品差异时，才在上层增加源特有分支。
