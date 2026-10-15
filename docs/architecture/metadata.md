# 元数据适配与合并

本页描述外部元数据的获取、来源身份、展示合并、更新保护和云端同步。持久化与缓存见 [`game-library.md`](game-library.md)，原生安装与 OAuth 见 [`backend.md`](backend.md)。

## 职责边界

- `metadata/adapters`：封装单源的 ID 校验、外链、搜索、详情补全、展示投影和最终清洗。
- `GameMetadataSession`：绑定请求上下文，编排单源、Mixed 和关联增强，返回草稿及失败来源。
- `metadata/data/metadata.ts`：将候选转为新增或更新参数；更新时读取已有原始 `sources`，决定写入与保留。
- `displayMergeRules.ts`：按显示源、字段优先级和自定义覆盖生成展示字段。
- `services/requestContext.ts` 与 `metadataAuth.ts`：组装设置、取消信号及认证入口；认证只处理实际请求的来源。

Adapter 不负责跨源合并、数据库写入或 UI。Session 不读取已有游戏，也不决定旧来源的删除策略；失败来源属于执行结果，不写入来源 JSON。

来源类型定义在 `src/types`，可搜索集合由 `constants.ts` 派生，Adapter 在 `sourceRegistry.ts` 注册。注册、在线可用性与历史展示分别处理：废弃来源停止新请求，已有数据仍可展示。有效外部 ID 用于请求、去重和外链；保存的完整数据可在缺少 ID 时参与展示。

Kungal 的来源键为 `kun`，网络提供者是 NextMoe，API 实现在 `api/nextmoe.ts`；`nextmoe` 不是独立元数据来源。

## 数据与身份

| 形态 | 用途 |
| --- | --- |
| `SourceCandidate` | 搜索候选，含来源私有数据、统一预览和关联身份 |
| `GameMetadataDraft` | 本次采用的来源记录与自定义数据 |
| `MetadataFetchResult` | 草稿及失败来源 |
| `GameSourceRecord` | 持久化到 `game_sources` 的来源、外部 ID 和 JSON 数据 |

来源响应可提供其它站点的作品身份。身份按真实来源键存储；只有 ID 的记录使用 `data=null`，可用于去重、外链、同步和后续获取，不能计为完整元数据。Mixed 表示同时采用多个来源的完整元数据。

同源多个关联 ID 有歧义时舍弃关联；明确采用的完整候选优先于关联身份。关联字段可能受服务端能力和权限限制而缺失，缺失不能作为删除旧身份的依据；各源 ID 校验由 Adapter 负责。

各源数据由 Adapter 清洗，Session 在最终采用的来源身份确定后完成组合清洗。去除上游转译标签时须依据实际采用的完整来源，身份冲突时保留；清洗期间的标签归属信息不入库。源特有字段规则见 `metadata/api`。

## 获取路径

```text
UI / 批量匹配 → GameMetadataSession → 已绑定 Adapter
→ 搜索候选 / 按 ID 获取 → 选中后补详情
→ 来源组合与最终清洗 → MetadataFetchResult
```

### 单源与关联增强

单源结果只保留 Mixed 设置中启用来源的关联身份，不依赖增强开关；主源自身不受该选择限制。增强按关联 ID 获取这些来源的元数据，直接调用目标 Adapter，避免递归增强。

主源始终保留完整数据，增强失败不影响成功结果。请求数量限制不裁剪已保存数据；默认来源与数量限制见 [`constants.ts`](../../src/metadata/constants.ts)。整个结果交由用户采用，获取层不会因本地旧 ID 不同而过滤它。

本地批量匹配复用 `searchBestMatchResult` 和上述增强规则；身份冲突及导入策略由游戏库流程处理。

### Mixed

- 名称搜索并行获取各源候选，确认时只补全勾选候选。未勾选来源不能通过另一候选的关联身份补回。
- 按 ID 获取只请求填写且启用的来源，不按名称补搜，也不请求未填写来源。失败来源的关联身份不能替代用户填写的不同 ID。
- 普通单源失败保留其它结果并记录失败来源；全部已尝试来源失败时抛整体错误。需要中止或交由认证流程处理的错误向上抛出，分类规则见 [`api/mixed.ts`](../../src/metadata/api/mixed.ts)。

安装元数据匹配复用按 ID 获取，请求范围由协议中的来源身份、启用来源与鉴权能力确定。没有可请求来源时，按安装标题创建自定义游戏。

### 云端收藏导入

`services/cloudCollectionImport.ts` 将云端收藏转为候选并补全详情。Kungal 与 Hikarinagi 复用 Session 的单源增强偏好和 Mixed 来源设置；主源详情与关联身份先参与本地库和本批次去重，未重复条目才执行增强。增强失败仍保留有效关联身份，增强后的间接关联与最终入库也参与去重；重复条目跳过，不合并到已有游戏。

详情失败的条目不以预览数据入库。个人收藏状态与评价随完整游戏写入，复用批量新增路径，本地启动路径留空。认证、取消和限速沿用公共请求边界。

### 云端状态与评价

[`services/cloudPlayStatus`](../../src/services/cloudPlayStatus) 按来源身份、同步开关和账号权限读写游玩状态。本地状态写入成功后推送云端，云端失败返回来源列表并提示，不回滚本地结果。批量读取复用一次请求上下文中的状态映射。

[`services/cloudUserReview.ts`](../../src/services/cloudUserReview.ts) 按用户选择推送评分和评论，各来源独立返回结果；本地评价保存与云端推送是独立操作。

## 更新保护

`buildMetadataUpdatePayload` 依据本次获取结果和已有原始 `sources` 生成写入计划：

- 完整结果写入 `upsert_sources`，可以替换旧作品 ID。
- 关联身份仅补本地缺失来源，不覆盖已有身份或完整数据。
- 未出现在采用结果中的旧完整来源写入 `remove_sources`；失败或废弃来源保留。
- 旧 ID-only 记录不因关联缺失或歧义而删除。
- 日期由后端按实际写入、删除和保留的来源重算。

Mixed 的取消勾选或清空 ID 会排除该来源；单源增强则将整份结果的关联身份交给上述保护规则。写入计划须读取 `FullGameData.sources`，不能从展平后的 `GameData` 反推。

## 展示与网络

```text
FullGameData.sources → sourceRecord → Adapter.toDisplayFields
→ displayMergeRules → custom_data 覆盖 / 补充 → GameData
```

字段优先级集中在 `displayMergeRules.ts`；涉及基础字段优先级时，前后端 `MIXED_BASIC_SOURCE_PRIORITY` 必须一致。

`metadata/api/http.ts` 统一处理 Tauri HTTP、代理与局域网绕过、取消、按源限流、退避及错误分类。源特有请求参数和限速策略见 [`metadata/api`](../../src/metadata/api)。

各源 API 在现有请求构造器中声明限流策略与响应识别，随请求传入通用调度器；HTTP 层不反向依赖元数据 Adapter 注册表。响应解析与限流状态提交必须在释放当前来源队列位置前完成，成功状态也须在业务限流识别后提交。服务端等待时间优先于本地估算，恢复头按来源及限流原因解释；估算冷却不能描述为服务端承诺。

来源共享请求节奏，额度阻断按实际额度主体隔离；认证上下文传递 NextMoe 用户身份，使同一用户刷新 Token 后保留冷却，切换账号或匿名请求则使用独立状态。凭据仅以摘要作为缺少用户身份时的兜底标识，不写入限流日志。终止重试会使旧排队请求失效，冷却到期不会自动恢复旧任务；恢复时间未知时，待旧请求全部结束后，重新发起的操作允许一次探测。短期状态仅驻留内存，不作为跨客户端额度统计。

认证流程位于 `services/oauth` 与 Rust `oauth`，凭据持久化在 SQLite。刷新与凭据轮换须协调并发；取消登录或退出后，迟到的授权结果不能重新写回。NextMoe 用户数据请求必须保持登录身份，不能退回匿名。各源鉴权和匿名回退策略由 `metadataAuth.ts` 与对应 API 实现维护。

## 修改入口

| 修改内容 | 入口 |
| --- | --- |
| 来源能力与注册 | `src/types`、`metadata/adapters`、`sourceRegistry.ts`、`constants.ts` |
| API 与源数据清洗 | `metadata/api`；新域名同步 Tauri capabilities |
| 搜索、增强与最终清洗 | `gameMetadataService.ts`、`sourceCandidate.ts` |
| 更新写入策略 | `metadata/data/metadata.ts` |
| 展示与封面来源 | `displayMergeRules.ts`；封面来源同步 Rust `CustomData` 类型 |
| 请求与认证 | `services/requestContext.ts`、`metadataAuth.ts`、`services/oauth`、Rust `oauth` |

新增来源时沿用 Adapter 和 registry 的通用流程，跨层类型、权限、展示规则及设置需保持一致。
