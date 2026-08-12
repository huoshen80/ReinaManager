# 前端架构

## 启动与路由

`src/main.tsx` 先初始化持久化状态、游戏计时、启动页、托盘和路径缓存，再挂载 Provider 与 React。`src/App.tsx` 组合 i18n、Snackbar、Toolpad 导航、OAuth token 刷新和 Tauri 环境处理器。

路由集中在 `src/providers/router.tsx`，页面使用 `React.lazy` 按路由分割。同一份 `appRoutes` 同时驱动 Router 和 Toolpad 导航。

| 路径 | 页面职责 |
| --- | --- |
| `/` | 首页统计、运行中游戏、近期动态 |
| `/libraries` | 游戏库搜索、筛选、排序和虚拟列表 |
| `/libraries/:id` | 详情、编辑、统计、存档和评价 |
| `/collection` | 分组、分类、开发商虚拟分类 |
| `/settings` | 账号、数据源、界面、系统和备份设置 |

## 分层职责

| 位置 | 放置内容 |
| --- | --- |
| `pages/` | 路由页面、页面私有组件和就近派生逻辑 |
| `components/` | 跨页面 UI 和交互组件 |
| `hooks/common/` | 不含业务语义的通用 React 能力 |
| `hooks/queries/` | Query key、query、mutation、缓存 patch 与失效策略 |
| `hooks/features/` | 组合 Query、Zustand、service 和业务规则的用例门面 |
| `services/invoke/` | Tauri command 的类型化封装 |
| `services/` | 文件、游戏运行时、OAuth、插件和云状态工作流 |
| `metadata/` | 外部元数据的请求、适配、合并和转换 |
| `store/` | Zustand 客户端状态和持久化迁移 |
| `providers/` | Router、QueryClient、i18n、主题和全局 Provider |

页面私有逻辑优先就近放置；只有跨页面复用时才上移。

## 状态边界

| 状态 | 管理方 | 示例 |
| --- | --- | --- |
| 后端/远程事实 | TanStack Query | 游戏、合集、统计、设置、存档、任务 |
| UI 与用户偏好 | `useStore` | 筛选、排序、弹窗、NSFW、数据源、代理 |
| 运行中游戏 | `useGamePlayStore` | 当前进程、实时时长、会话结束 |
| 短期交互 | 组件本地状态 | 表单输入、弹窗内选择 |

`src/providers/queryClient.ts` 将本地事实默认视为长期 fresh，远程查询可使用单独的时效配置。Zustand `persist` 只保存选定偏好，并通过 `appStoreMigrations.ts` 迁移。不要将数据库实体复制到 Zustand 形成第二事实源。

## 标准数据流

```text
Page / Component
→ feature hook
→ query hook
→ invoke service
→ BaseService.invoke
→ Tauri command
→ mutation 成功后 patch / invalidate Query 缓存
→ UI 重渲染
```

`BaseService` 是底层 IPC 入口，负责检查 Tauri 运行时并将错误归一化为 `AppError`。组件和页面禁止直接 `invoke`，也不应自行操作 QueryClient。

当前 `src/pages/Home/HomePage.tsx` 仍直接使用 `useInfiniteQuery`，属于已知分层偏差，不是新代码的示例。

## 修改入口

- 增加后端调用：在 `services/invoke` 扩展对应 service。
- 增加数据查询或写入：在 `hooks/queries` 定义 key、hook 和缓存策略。
- 编排多个数据源或状态：在 `hooks/features` 提供业务门面。
- 增加页面：在 `pages` 实现，并更新集中路由配置。
- 增加全局偏好：更新 store 及其持久化选择；必要时增加 store migration。

## 相关文档

- 游戏数据的 Query 和索引规则：[`game-library.md`](game-library.md)
- 元数据搜索和适配器：[`metadata.md`](metadata.md)
