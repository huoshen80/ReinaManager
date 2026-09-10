# Rust 后端架构

## 组合根

`src-tauri/src/main.rs` 仅调用 `reina_manager_lib::run()`。`src-tauri/src/lib.rs` 是应用组合根，负责：

- 注册自定义协议、Tauri 插件和 IPC commands。
- 注入数据库连接、安装协议和任务运行状态。
- 初始化日志、旧文件迁移、SQLite 和 schema migration。
- 恢复中断的安装任务，退出时关闭数据库。

根模块为 `backup`、`database`、`entity`、`game`、`install`、`oauth` 和 `utils`。

## 模块组织

Rust 模块使用 `<模块>.rs + <模块>/` 结构，不使用 `mod.rs`。同级 `.rs` 只做子模块声明和重导出，业务逻辑位于子模块。

Windows 和 Linux 的游戏启动/监控使用 `#[cfg(target_os = ...)]` 分文件隔离。当前未实现 macOS 游戏启动与监控，不要由 capability 声明推导出完整平台支持。

## 数据库主路径

```text
Tauri command
→ database/service.rs
→ DTO 清洗与边界校验
→ repository
→ SeaORM entity / transaction
→ SQLite
```

| 模块 | 职责 |
| --- | --- |
| `database/db.rs` | 解析路径，建立/关闭连接，启用 SQLite 外键 |
| `database/dto.rs` | IPC 读取、新增、更新和批处理类型，以及输入清洗 |
| `database/service.rs` | 数据库类 commands 与操作上下文错误 |
| `database/repository/` | 查询、业务不变量和事务 |
| `entity/` | SeaORM 实体与表关联 |

游戏是聚合根：写入时在同一事务中维护 `games` 和 `game_sources`。合集与游戏统计的跨表不变量也由 repository 事务保护。`Option<Option<T>>` 在更新 DTO 中区分“不修改”和“显式清空”。

全库统计中的时段分布是 `game_sessions` 的只读投影：command 校验包含首尾日期的范围与游戏 ID，repository 按会话开始时间汇总本地小时和星期。它不创建领域实体或持久化表，前端需传入经过内容过滤后的游戏 ID。

这不是全局严格三层架构。独立特性可根据职责直接组合 repository、entity、文件系统或外部 HTTP。

## 存储

核心业务数据存于 SQLite，连接池固定为单连接，并强制开启外键。`src-tauri/migration` 按顺序管理 schema，应用启动时执行 `Migrator::up`。

`reina-path` 统一路径策略：

- 便携模式：可执行文件旁存在 `resources/data`，数据根目录为 `<exe>/resources`。
- 标准模式：数据根目录为系统 data 目录下的 `com.reinamanager.dev`。
- 数据库统一为 `<base>/data/reina_manager.db`。

少量启动设置使用 `tauri-plugin-store` 的 `settings.json`。封面、存档备份、数据库备份和安装中间文件存于文件系统。

## 特性模块

| 模块 | 职责 |
| --- | --- |
| `game` | 扫描、Steam 解析、启停、进程监控、会话统计、封面缓存 |
| `install` | deep link、持久化任务、下载、校验、解压、导入与恢复 |
| `backup` | 数据库、封面和游戏存档备份 |
| `oauth` | Bangumi/Hikarinagi OAuth、localhost 回调、token 交换与刷新 |
| `utils` | 文件、HTTP、图片协议、日志和历史文件迁移 |

## 游戏存档备份

存档路径可以指向一个普通文件或目录。存档专用 7z 归档保留该对象的原始名称：文件直接位于归档顶层，目录连同根目录一起写入。归档必须且只能包含一个逻辑顶层对象，类型和名称从条目结构读取；不增加 manifest 或数据库类型字段。封面归档继续使用原有目录内容格式。

`backup/archive.rs` 只提供封面等功能沿用的通用目录压缩。`backup/savedata/` 按职责拆分：`archive/` 负责 V2 写入和 V1/V2 安全预检，`create.rs` 负责创建 command，`maintenance.rs` 负责删除、保留数量和目录迁移，`restore/` 分别放置入口调度、Legacy V1、Rooted V2 及共享事务提交逻辑。对应的 `.rs` 模块声明文件只声明和重导出子模块。

新存档备份文件名以 `savedata_v2_` 开头；有此前缀的归档按 V2 处理，其余永久按 Legacy V1 处理，禁止根据归档内容猜测版本。V1 源自只允许目录的历史业务规则，因此确定为目录备份；它可以有任意数量的安全顶层条目，恢复到当前配置的 `save_path` 目录，不尝试推断已经丢失的原目录名。V1 和 V2 都不需要数据库迁移，也不重新打包历史备份。

恢复先读取归档条目并校验相对路径、普通文件/目录类型及资源限制，拒绝链接、重解析点及路径越界。V2 还校验唯一顶层对象；当前配置路径存在但类型不同时拒绝恢复，名称相同时替换当前路径，名称不同时恢复到其父目录下的备份原名，并拒绝覆盖已存在的同名对象。异名恢复不自动修改游戏配置。V1 当前路径存在时必须是目录，不存在时创建完整的新目录。

解压先写入目标同卷的独立临时目录，校验全部内容后通过 rename 替换，禁止目录合并。替换失败尝试回滚；回滚失败保留旧对象并在错误中返回其位置。恢复结果返回实际路径及旧对象清理警告，前端据此提示。该流程处理运行时失败，不提供断电后的自动事务恢复。

## HTTP 与代理生命周期

后端封面、OAuth 和安装下载复用 `utils/http/client.rs` 中的共享客户端。应用内代理非空时显式代理优先；留空时由底层 HTTP 库读取系统代理。

Windows 会监听当前用户的 Internet Settings。固定系统代理变化后，后端原子替换共享客户端；已有请求和正在运行的安装任务继续持有旧客户端，后续请求及新启动或恢复的安装任务使用新客户端。

## 错误边界

- 多数 command 返回 `Result<T, String>`，并附加中文操作上下文。
- repository 内保留 `sea_orm::DbErr`。
- 安装域使用带稳定 `code` 的结构化失败类型。
- 前端 `BaseService` 将 IPC 失败归一化为 `AppError`。

## 修改入口

1. 普通数据库能力优先沿 `service → repository → entity` 扩展。
2. 独立特性使用 `<feature>.rs + <feature>/`；平台实现用 `cfg` 分文件隔离。
3. 聚合写入、多表不变量和任务状态转换由单个 repository/workflow 事务覆盖。
4. Command 是信任边界；进入文件系统或系统 API 前完成参数、路径和可执行文件校验。
5. 修改 schema 时追加 migration，并同步 entity、DTO、repository 和前端类型。
