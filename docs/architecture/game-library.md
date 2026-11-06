# 游戏库数据与缓存

## 数据形态与读取

| 形态 | 职责 |
| --- | --- |
| `FullGameData` | 后端完整聚合，保留来源记录与自定义覆盖；用于主缓存和编辑 |
| `GameData` | 合并来源与覆盖后的展示数据；用于卡片、详情和搜索 |
| `GameIndex` | 从完整聚合派生的查找、来源可用性和开发商分类索引 |

完整游戏库保存在 `gameKeys.all`。[`useGameIndex`](../../src/hooks/features/games/useGameListFacade.ts) 将其派生为 `gameKeys.index()`，展示读取 `displayById`，需要原始来源的编辑读取 `rawById`；页面不重复执行展示转换，也不维护独立的详情事实缓存。

列表入口为同文件中的 `useGameListFacade`：后端 `find_game_ids` 负责基础类型筛选和排序，只返回 ID；前端从索引组装展示数据，再应用作用域、游玩状态、标签、NSFW 和搜索过滤。切换排序不重新传输完整聚合。名称排序查询 key 包含语言与名称展示偏好，避免沿用另一种显示规则的顺序。

## 写入与一致性

新增和更新使用后端返回的完整聚合，删除按 ID 移除缓存。游戏 mutation 统一经过 [`gameCachePatch.ts`](../../src/hooks/queries/gameCachePatch.ts)，同时维护主缓存、Query 索引及按数组引用缓存的派生索引；索引算法入口为 [`gameIndex.ts`](../../src/utils/game/gameIndex.ts)。

必须遵守以下约束：

- 不绕过缓存 patch 直接替换主缓存；不使用展示数据代替需要 `sources` 的原始聚合。
- 索引有效性同时取决于原始数组与展示偏好；偏好改变后，读取和增量写入都不能复用旧规则的索引。
- 索引的 `rawList` 对应 Query **最终保存**的数组引用。结构共享可能改变传入引用，不能直接用写入前的数组作为派生缓存键。
- 单个游戏变更增量更新聚合和索引，避免全库 refetch；新增无法 patch 时才回退到完整聚合失效。
- `gameKeys.all` 也是全部游戏查询的前缀。只刷新完整聚合时使用 `exact: true`，避免连带刷新索引、排序 ID 和来源 ID 查询。

[`useGames.ts`](../../src/hooks/queries/useGames.ts) 集中管理失效范围。写入须维护受影响的列表、来源身份、收藏与统计缓存；局部更新优先 patch 聚合和索引。具体字段与失效查询的对应关系由 Query 层维护。

若单个更新触发全库展示转换，先检查是否绕过 patch、全量失效、索引引用失配，或在渲染路径重复转换。

## 收藏与手动排序

真实分类成员及其手动顺序由数据库维护，开发商分类由 `GameIndex` 派生。自定义分类使用独立的搜索、筛选与排序偏好；搜索和筛选只改变显示结果，不修改成员或已保存的手动顺序。

拖拽排序不能把显示子集保存为完整成员顺序；选择与正在保存的状态由分类视图持有，不能因网格切换丢失。具体交互条件见 [`CollectionGamesView.tsx`](../../src/pages/Collection/CollectionGamesView.tsx)。

排序与成员替换使用独立的写入路径：排序在后端事务内校验完整成员集合，只更新顺序。Query 乐观更新的回滚不能覆盖已被其他操作更新的缓存；入口为 [`useCollections.ts`](../../src/hooks/queries/useCollections.ts)。

## 导入身份边界

导入复用批量新增与缓存 patch，身份判断使用来源 ID 和 Steam 启动 ID。入口为 [`useGameMetadataFacade.ts`](../../src/hooks/features/games/useGameMetadataFacade.ts)。

- 匹配导入仅新增无身份冲突的候选；冲突按共享身份组表示，关联组不意味着所有成员两两重复。
- 自定义导入保留名称与启动信息，放弃匹配元数据和来源身份；候选变更不能清除其它行之间仍成立的冲突。
- 云端收藏导入不设置本地启动路径，并按来源身份避免导入已有游戏。

批量导入与云端收藏共用的新增流程，在网络请求与写入数据准备完成后重新读取游戏库，对最终身份核对后再提交，避免沿用准备开始时的缓存快照。批量列表中已完成的同批分组不能跳过这次库内复核；新发现的重复保留本地候选与启动信息，收藏导入则跳过重复项。

来源合并与写入 payload 的规则见 [`metadata.md`](metadata.md)。
