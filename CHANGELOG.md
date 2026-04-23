## [0.19.3](https://github.com/huoshen80/ReinaManager/compare/v0.19.2...v0.19.3) (2026-04-23)

!!! warning 由于 Vndb 源站服务器迁移问题，该源暂时不可用，本次更新会修复 Kun 源在 Vndb 源宕机时无法正常使用的问题，建议尽快更新。

!!! warning Due to the server migration of the Vndb source, the source is temporarily unavailable. This update will fix the problem that the Kun source cannot be used normally when the Vndb source is down. It is recommended to update as soon as possible.

### 更新日志(Changelog)

<details>
<summary>查看中文版本</summary>

### ⚙️ 杂类任务
- *(Ci)* 修复所有平台使用中的缓存问题 ([d431252](https://github.com/huoshen80/ReinaManager/commit/d43125271f8c52e52d95409f3ad7b619dbd6dc90))

### 🐛 Bug 修复

- *(api/kun)* 当 VNDB 失败时回退到 kun 数据 ([0c260a4](https://github.com/huoshen80/ReinaManager/commit/0c260a4432314e54f8e8f62cbbd4be96bc77b6c8))

### 🚜 重构

- *(components)* 简化游戏预览 ([5245196](https://github.com/huoshen80/ReinaManager/commit/5245196c9a461dd2fa0a5fd7a97e67430c14031a))

</details>

### ⚙️ Miscellaneous Tasks

- *(Ci)* Fix cache using problem in all platforms ([d431252](https://github.com/huoshen80/ReinaManager/commit/d43125271f8c52e52d95409f3ad7b619dbd6dc90))

### 🐛 Bug Fixes

- *(api/kun)* Fall back to kun data when VNDB fails ([0c260a4](https://github.com/huoshen80/ReinaManager/commit/0c260a4432314e54f8e8f62cbbd4be96bc77b6c8))

### 🚜 Refactor

- *(components)* Simplify game preview ([5245196](https://github.com/huoshen80/ReinaManager/commit/5245196c9a461dd2fa0a5fd7a97e67430c14031a))


## [0.19.2](https://github.com/huoshen80/ReinaManager/compare/v0.19.1...v0.19.2) (2026-04-21)

<details>
<summary>查看中文版本</summary>

### ⚙️ 杂类任务

- 将 KUN 简介切换到末尾 ([7bc721e](https://github.com/huoshen80/ReinaManager/commit/7bc721e3d8362c4de42693b7158623b1250c717c))

### 🐛 Bug 修复

- 修复软件内更新日志链接打开的问题 ([90b605c](https://github.com/huoshen80/ReinaManager/commit/90b605cc78849f3ad81fcd4a4e4e7b84f5434))

</details>

### ⚙️ Miscellaneous Tasks

- Switch the kun summary to the end ([7bc721e](https://github.com/huoshen80/ReinaManager/commit/7bc721e3d8362c4de42693b7158623b1250c717c))

### 🐛 Bug Fixes

- The link to the changelog opens in the software ([90b605c](https://github.com/huoshen80/ReinaManager/commit/90b605cc78849f3ad81fcd4a4e4be4e7b84f5434))


## [0.19.1](https://github.com/huoshen80/ReinaManager/compare/v0.19.0...v0.19.1) (2026-04-21)

<details>
<summary>查看中文版本</summary>

### 🐛 Bug 修复

- *(savedata)* 修复自动备份存档时，游戏结束阶段界面更新出现延迟的问题 ([a91ae77](https://github.com/huoshen80/ReinaManager/commit/a91ae776ffdafac85e1d36840949e85721af0d4c))
- *(savedata)* 修复自动备份后备份列表不会刷新，并调整自动备份开关逻辑 ([b7e237b](https://github.com/huoshen80/ReinaManager/commit/b7e237b0fe9fdff4d83566d7862f0c5aa277261b))
- *(ThemeSwitcher)* 修复路由切换时重复发送主题设置请求的问题 ([cfee207](https://github.com/huoshen80/ReinaManager/commit/cfee20790dc8a1d1219e61f201161fbe08ade52d))

### 🚀 性能优化

- *(backup)* 备份存档改用 Zstd 压缩，大幅提升备份速度 ([c600e4f](https://github.com/huoshen80/ReinaManager/commit/c600e4f2136d21d5127490a64f7ab6ce359c6d98))

### 🚜 重构

- *(hooks/queries)* 提取查询配置项，新增请求辅助函数，并清理部分未使用函数 ([e868a66](https://github.com/huoshen80/ReinaManager/commit/e868a66dd5446417501185f49ef7e6ce9b60c0b6))
- *(components)* 重构选中游戏的处理逻辑，并拆分相关界面 ([a83960c](https://github.com/huoshen80/ReinaManager/commit/a83960c8f3fb341dcf9539024a5d05660bdec7f3))

</details>

### 🐛 Bug Fixes

- *(savedata)* Avoid delay UI changes at the end of the game when auto backing up savedata ([a91ae77](https://github.com/huoshen80/ReinaManager/commit/a91ae776ffdafac85e1d36840949e85721af0d4c))
- *(savedata)* The backup list does not refresh after auto backup and adjust the logic of the autom backup switch ([b7e237b](https://github.com/huoshen80/ReinaManager/commit/b7e237b0fe9fdff4d83566d7862f0c5aa277261b))
- *(ThemeSwitcher)* Repeatedly sending theme setting requests when switching routes ([cfee207](https://github.com/huoshen80/ReinaManager/commit/cfee20790dc8a1d1219e61f201161fbe08ade52d))

### 🚀 Performance

- *(backup)* Use Zstd compression for savedata backup(Greatly improve backup speed) ([c600e4f](https://github.com/huoshen80/ReinaManager/commit/c600e4f2136d21d5127490a64f7ab6ce359c6d98))

### 🚜 Refactor

- *(hooks/queries)* Extract query options,add fetch helpers and clear some unuse fn ([e868a66](https://github.com/huoshen80/ReinaManager/commit/e868a66dd5446417501185f49ef7e6ce9b60c0b6))
- *(components)* Refactor selected-game handling and split UI ([a83960c](https://github.com/huoshen80/ReinaManager/commit/a83960c8f3fb341dcf9539024a5d05660bdec7f3))


## [0.19.0](https://github.com/huoshen80/ReinaManager/compare/v0.18.2...v0.19.0) (2026-04-17)

<details>
<summary>查看中文版本</summary>

### ⚙️ 杂类任务

- 修复发布工作流 [skip ci] ([9561be1](https://github.com/huoshen80/ReinaManager/commit/9561be16c3d570a3b913aaf7e319959985068820))
- 更新依赖 ([36a9735](https://github.com/huoshen80/ReinaManager/commit/36a9735c97ae28862e5ceb8112bfdbe0204807e9))

### ✨ 新功能

- 添加 KUNGAL 相关 API，关闭 [#45](https://github.com/huoshen80/ReinaManager/issues/45) ([f2c4ab4](https://github.com/huoshen80/ReinaManager/commit/f2c4ab43a5dc81dfc0196e58f57765627ccba866))
- *(api/kun)*: 在获取数据时合并 VNDB 数据，清洗简介，并在需要时获取标签 ([f62983f](https://github.com/huoshen80/ReinaManager/commit/f62983f6a92965f2af00396e9951e5f761b12a03))
- *(mixed)* 在混合数据源中新增 KUNGAL ([5427363](https://github.com/huoshen80/ReinaManager/commit/5427363b2a94c359aaad5d9d8adeecedee43a686))
- *(mixed)* 支持配置混合检索数据源 ([f098e82](https://github.com/huoshen80/ReinaManager/commit/f098e82e5678c61f5226ba7a22622f2698aeccc1))
- *(Toolbar)* 在更多菜单中显示 API 来源站点图标 ([925159c](https://github.com/huoshen80/ReinaManager/commit/925159c43a5fa4df63c5d11cd0aebb704535c8c0))

### 🐛 Bug 修复

- *(Toolbar)* 修复切换按钮问题 ([a2175ec](https://github.com/huoshen80/ReinaManager/commit/a2175ecb5190e0e477aff0db01767e066a4bff54))
- *(utils)* 支持 `nsfw=false` 并简化 `getDiff` ([e7512c3](https://github.com/huoshen80/ReinaManager/commit/e7512c3bc400faa6bf9a1f9655376f5c83aafa2e))
- *(cover)* 修复删除游戏后封面缓存可能被过期任务回写的问题 ([e77c6b3](https://github.com/huoshen80/ReinaManager/commit/e77c6b3aee787c84a9247a3d8856f643b9e59779))

### 🚜 重构

- 简化部分 API 来源详情数据获取逻辑，移除 `IdType` 枚举 [skip ci] ([97f74dc](https://github.com/huoshen80/ReinaManager/commit/97f74dc29fbdabb757fccdb19d2b6925654085c0))
- *(metadata)* 重构元数据来源处理逻辑 ([0e3b0e6](https://github.com/huoshen80/ReinaManager/commit/0e3b0e61dcb9851b4953d8c102598055afa70921))
- *(api)* 重构混合来源处理逻辑 ([1b387ef](https://github.com/huoshen80/ReinaManager/commit/1b387ef29766b465f54370d403c0f45c8ba38954))

</details>

### ⚙️ Miscellaneous Tasks

- Fix release workflow again [skip ci] ([9561be1](https://github.com/huoshen80/ReinaManager/commit/9561be16c3d570a3b913aaf7e319959985068820))
- Update deps ([36a9735](https://github.com/huoshen80/ReinaManager/commit/36a9735c97ae28862e5ceb8112bfdbe0204807e9))

### ✨ Features

- 添加kungal相关api (#45) ([f2c4ab4](https://github.com/huoshen80/ReinaManager/commit/f2c4ab43a5dc81dfc0196e58f57765627ccba866))
- *(api/kun)*: merge VNDB data on fetch, sanitize the summary, and fetch
tags if needed([f62983f(https://github.com/huoshen80/ReinaManager/commit/f62983f6a92965f2af00396e9951e5f761b12a03)])
- *(mixed)* Add Kungal to the mixed api ([5427363](https://github.com/huoshen80/ReinaManager/commit/5427363b2a94c359aaad5d9d8adeecedee43a686))
- *(mixed)* Allow configuring mixed search sources ([f098e82](https://github.com/huoshen80/ReinaManager/commit/f098e82e5678c61f5226ba7a22622f2698aeccc1))
- *(Toolbar)* Show api source favicons in more menu ([925159c](https://github.com/huoshen80/ReinaManager/commit/925159c43a5fa4df63c5d11cd0aebb704535c8c0))

### 🐛 Bug Fixes

- *(Toolbar)* Bug of toggle button ([a2175ec](https://github.com/huoshen80/ReinaManager/commit/a2175ecb5190e0e477aff0db01767e066a4bff54))
- *(utils)* Accept nsfw=false and simplify getDiff ([e7512c3](https://github.com/huoshen80/ReinaManager/commit/e7512c3bc400faa6bf9a1f9655376f5c83aafa2e))
- *(cover)* Prevent stale cache writes after game deletion ([e77c6b3](https://github.com/huoshen80/ReinaManager/commit/e77c6b3aee787c84a9247a3d8856f643b9e59779))

### 🚜 Refactor

- Simplify the logic for obtaining detailed data of some api sources,remove the enum of IdType [skip ci] ([97f74dc](https://github.com/huoshen80/ReinaManager/commit/97f74dc29fbdabb757fccdb19d2b6925654085c0))
- *(metadata)* Refactor source handling for metadata ([0e3b0e6](https://github.com/huoshen80/ReinaManager/commit/0e3b0e61dcb9851b4953d8c102598055afa70921))
- *(api)* Refactor mixed source handling ([1b387ef](https://github.com/huoshen80/ReinaManager/commit/1b387ef29766b465f54370d403c0f45c8ba38954))



## [0.18.2] - 2026-04-02

<details>
<summary>查看中文版本</summary>

### ⚙️ 杂类

- 清理项目根目录 [skip ci]
- *(workflow)* 使用 git-cliff 并改进发布流程
- *(src-tauri)* 整理导入并提升 Rust 版本

### 🐛 Bug 修复

- 在批量导入模式下，选择 Ymgal 数据源或混合数据源会导致 Ymgal 元数据获取不完整，切换日志级别到 info 解决 #46

### 🚀 性能优化

- *(game_monitor)* 替换 sysinfo 为 Windows ToolHelp API，提升监控性能

### 🚜 重构

- 聚合多个设置以进行统一的获取和更新，移除统一路径管理器

</details>

### ⚙️ Miscellaneous Tasks

- Clean the root of project [skip ci]
- *(workflow)* Use git-cliff and improve release workflow
- *(src-tauri)* Tidy imports and bump Rust edition

### 🐛 Bug Fixes

- In batch import mode, selecting the Ymgal source or Mixed source will cause incomplete retrieval of Ymgal metadata,switch log level to info resolve #46

### 🚀 Performance

- *(game_monitor)* Replace sysinfo with Windows ToolHelp API,enhance monitoring performance

### 🚜 Refactor

- Aggregate multiple settings for unified retrieval and updating, remove the unified path manager


## [0.18.1](https://github.com/huoshen80/ReinaManager/compare/v0.18.0...v0.18.1) (2026-03-30)

<details>
<summary>查看中文版本</summary>

### Bug 修复

* 玩过游戏的筛选逻辑问题 ([10a4e46](https://github.com/huoshen80/ReinaManager/commit/10a4e46c2350e210b5788fa499b4d838c4163eb2))

</details>

### Bug Fixes

* filter logic issue for games that have been played ([10a4e46](https://github.com/huoshen80/ReinaManager/commit/10a4e46c2350e210b5788fa499b4d838c4163eb2))


## [0.18.0](https://github.com/huoshen80/ReinaManager/compare/v0.17.1...v0.18.0) (2026-03-29)

<details>
<summary>查看中文版本</summary>

### Bug 修复

* **AddModal:** 批量模式下切换 Tab 导致数据丢失的问题，解决 [#43](https://github.com/huoshen80/ReinaManager/issues/43) ([99b41fe](https://github.com/huoshen80/ReinaManager/commit/99b41fe697240341b4ce529e029c26f26db12910))
* **RightMenu:** 游戏游玩状态子菜单中的 bug ([7c7bf89](https://github.com/huoshen80/ReinaManager/commit/7c7bf89200a4fa1440a9a3d8943f355de7029dee))
* 软件运行时系统操作函数失败的问题 ([3d2dc37](https://github.com/huoshen80/ReinaManager/commit/3d2dc3713d4ec2a6a3601328287b228748306b7b))，关闭 [#44](https://github.com/huoshen80/ReinaManager/issues/44)

### 新功能

* 添加全局返回按钮 ([7b64b97](https://github.com/huoshen80/ReinaManager/commit/7b64b972f35e674420f4fec3f7ec819bf7760606))
* Reina 退出时添加提醒对话框 ([9e95d2e](https://github.com/huoshen80/ReinaManager/commit/9e95d2edfae9d6f97ac1e432bd3b978cf91fedd8))
* 添加游戏封面本地缓存 ([a3941ea](https://github.com/huoshen80/ReinaManager/commit/a3941ea583838cd75238ae396d8afe86df911a03))
* 添加 VNDB 令牌管理和游戏状态同步功能 ([c4106cd](https://github.com/huoshen80/ReinaManager/commit/c4106cd92a69b2885ead73272179ea30d4bc6a65))
* **FilterModal:** 添加自定义游戏筛选类型 ([318b734](https://github.com/huoshen80/ReinaManager/commit/318b7349bcd8533d28d3d94e21a5a829b239c6f1))
* 启动时运行旧版封面迁移 ([b70a0f6](https://github.com/huoshen80/ReinaManager/commit/b70a0f6c306afd09e2c5fa0ba0ced74c1ecb304a))

### 性能改进

* 优化游戏封面缓存逻辑 ([37ad736](https://github.com/huoshen80/ReinaManager/commit/37ad736e2836af82b4bdc64a554c7945316e6ebf))
* 为路径设置提供统一的保存按钮 ([f3c6235](https://github.com/huoshen80/ReinaManager/commit/f3c6235222cf04994a95e1a68af3b2260d88aabe))

</details>

### Bug Fixes

* **AddModal:** data is lost when switching tabs in bulk mode resolve [#43](https://github.com/huoshen80/ReinaManager/issues/43) ([99b41fe](https://github.com/huoshen80/ReinaManager/commit/99b41fe697240341b4ce529e029c26f26db12910))
* **RightMenu:** bug in the submenu of the game play status ([7c7bf89](https://github.com/huoshen80/ReinaManager/commit/7c7bf89200a4fa1440a9a3d8943f355de7029dee))
* the problem of system operation fn failing when the software runs ([3d2dc37](https://github.com/huoshen80/ReinaManager/commit/3d2dc3713d4ec2a6a3601328287b228748306b7b)), closes [#44](https://github.com/huoshen80/ReinaManager/issues/44)


### Features

* add a global back button ([7b64b97](https://github.com/huoshen80/ReinaManager/commit/7b64b972f35e674420f4fec3f7ec819bf7760606))
* add a reminder dialog when Reina exits ([9e95d2e](https://github.com/huoshen80/ReinaManager/commit/9e95d2edfae9d6f97ac1e432bd3b978cf91fedd8))
* add game cover  local cache ([a3941ea](https://github.com/huoshen80/ReinaManager/commit/a3941ea583838cd75238ae396d8afe86df911a03))
* add VNDB token management and game status sync fn ([c4106cd](https://github.com/huoshen80/ReinaManager/commit/c4106cd92a69b2885ead73272179ea30d4bc6a65))
* **FilterModal:** add custom game filter types ([318b734](https://github.com/huoshen80/ReinaManager/commit/318b7349bcd8533d28d3d94e21a5a829b239c6f1))
* run legacy cover migrations at startup ([b70a0f6](https://github.com/huoshen80/ReinaManager/commit/b70a0f6c306afd09e2c5fa0ba0ced74c1ecb304a))


### Performance Improvements

* optimize game cover cache logic ([37ad736](https://github.com/huoshen80/ReinaManager/commit/37ad736e2836af82b4bdc64a554c7945316e6ebf))
* provide a unified save button for the path settings ([f3c6235](https://github.com/huoshen80/ReinaManager/commit/f3c6235222cf04994a95e1a68af3b2260d88aabe))


## [0.17.1](https://github.com/huoshen80/ReinaManager/compare/v0.17.0...v0.17.1) (2026-03-14)

<details>
<summary>查看中文版本</summary>

### Bug 修复
* 游戏库滚动条状态会继承到详情页的问题 ([791b726](https://github.com/huoshen80/ReinaManager/commit/791b7268db95ba9b9c1474fbfead3fdb856de0fc))
* 同步本地按钮无法选择本地可执行文件的问题 ([daa98d8](https://github.com/huoshen80/ReinaManager/commit/daa98d8854396be841cce1c4f0b03f3a4e18e4e1))

</details>

### Bug Fixes

* carry over the scrollbar state of the game library to the detail page ([791b726](https://github.com/huoshen80/ReinaManager/commit/791b7268db95ba9b9c1474fbfead3fdb856de0fc))
* the issue of sync local button cannot select local executable file ([daa98d8](https://github.com/huoshen80/ReinaManager/commit/daa98d8854396be841cce1c4f0b03f3a4e18e4e1))



## [0.17.0](https://github.com/huoshen80/ReinaManager/compare/v0.16.3...v0.17.0) (2026-03-13)


<details>
<summary>查看中文版本</summary>

### Bug 修复
* 补全数据库与 pathmanager 的日志，并格式化后端代码 ([1eb2677](https://github.com/huoshen80/ReinaManager/commit/1eb267722c07e3b71b377f39e7ff87c0225e9d42))

### 新功能
* 新增目录名清理函数用于提取游戏名，并将可取消的异步操作逻辑抽离到 utils ([3a5679a](https://github.com/huoshen80/ReinaManager/commit/3a5679ab227cae805fdf3bfe2f207f6f34ff3223))
* 在游戏详情页新增跳转到对应开发商分类的链接 ([e5892d9](https://github.com/huoshen80/ReinaManager/commit/e5892d9cbfd57840322c564328700b848dd3a5b6))
* 新增主题跟随系统的选项 ([d83a3de](https://github.com/huoshen80/ReinaManager/commit/d83a3debe9e3a5424708ad94b147877717419526))
* 新增批量导入功能 ([8a50540](https://github.com/huoshen80/ReinaManager/commit/8a505401105af87398920a40834a6063d1b89f24))
* **批量导入:** 元数据匹配可取消，修复 YMgal 数据获取不完整的问题 ([6f4a34d](https://github.com/huoshen80/ReinaManager/commit/6f4a34dbf1b4922cc97ab453c746f3f0edc166f2))

### 性能改进
* 优化添加游戏的 UI 与交互体验 ([4c318e7](https://github.com/huoshen80/ReinaManager/commit/4c318e74bb8b709d657ec92119e58387ee9d6272))
* **存档:** 优化备份逻辑的 UI 与交互体验 ([3f002e9](https://github.com/huoshen80/ReinaManager/commit/3f002e9e4852b56e07c2ca7eb30492bbc2d5cb00))

</details>


### Bug Fixes

* missing db and pathmanager logs,fmt backend code ([1eb2677](https://github.com/huoshen80/ReinaManager/commit/1eb267722c07e3b71b377f39e7ff87c0225e9d42))


### Features

* add a directory name cleaning fn to extract game names, and extract cancellable async operation logic to utils ([3a5679a](https://github.com/huoshen80/ReinaManager/commit/3a5679ab227cae805fdf3bfe2f207f6f34ff3223))
* add a link on the game details page that can jump to the corresponding developer category ([e5892d9](https://github.com/huoshen80/ReinaManager/commit/e5892d9cbfd57840322c564328700b848dd3a5b6))
* add an option to follow the system for the theme ([d83a3de](https://github.com/huoshen80/ReinaManager/commit/d83a3debe9e3a5424708ad94b147877717419526))
* add bulkimport fn ([8a50540](https://github.com/huoshen80/ReinaManager/commit/8a505401105af87398920a40834a6063d1b89f24))
* **bulkimport:** matching metadata can be canceled and  fix the problem of incomplete YMgal data retrieval ([6f4a34d](https://github.com/huoshen80/ReinaManager/commit/6f4a34dbf1b4922cc97ab453c746f3f0edc166f2))


### Performance Improvements

* optimize the UI and UX for adding games ([4c318e7](https://github.com/huoshen80/ReinaManager/commit/4c318e74bb8b709d657ec92119e58387ee9d6272))
* **savedata:** optimize the UI and UX of backup logic ([3f002e9](https://github.com/huoshen80/ReinaManager/commit/3f002e9e4852b56e07c2ca7eb30492bbc2d5cb00))



## [0.16.3](https://github.com/huoshen80/ReinaManager/compare/v0.16.2...v0.16.3) (2026-02-25)

<details>
<summary>查看中文版本</summary>

### Bug 修复
* 首页显示的本地游戏数量异常 ([d15b1df](https://github.com/huoshen80/ReinaManager/commit/d15b1dfd85f78d589eca9a851fe048b23a4d2d2f))
* 游戏库滚动条恢复功能有概率失效 ([8a572ef](https://github.com/huoshen80/ReinaManager/commit/8a572ef32075ec728f591e9309a7e77c535e3502))

</details>


### Bug Fixes

* **home:** the number of local games displayed on the homepage is abnormal ([d15b1df](https://github.com/huoshen80/ReinaManager/commit/d15b1dfd85f78d589eca9a851fe048b23a4d2d2f))
* **library:** game library scrollbar restore function may fail ([8a572ef](https://github.com/huoshen80/ReinaManager/commit/8a572ef32075ec728f591e9309a7e77c535e3502))



## [0.16.2](https://github.com/huoshen80/ReinaManager/compare/v0.16.1...v0.16.2) (2026-02-24)

<details>
<summary>查看中文版本</summary>

### Bug 修复
* 自定义游戏预览封面显示问题 ([d0ed1f9](https://github.com/huoshen80/ReinaManager/commit/d0ed1f9708c5f5c9644cc290dfc4737c28773f10))
* 标记为 NSFW 的游戏封面不被替换的问题 ([e4bfb56](https://github.com/huoshen80/ReinaManager/commit/e4bfb56d91f3fa88f35a617b4e541d9edd5a8d1b))
* 在软件启动时按 Win+D 会导致 UI 崩溃的问题，取消全局禁用 Ctrl+A 快捷键 [#36](https://github.com/huoshen80/ReinaManager/issues/36) ([08fd61b](https://github.com/huoshen80/ReinaManager/commit/08fd61b1cfda35e47717f57aacb48e4e52c3a871))

### 新功能
* 在设置中添加文档链接和问题反馈按钮 ([afd58e5](https://github.com/huoshen80/ReinaManager/commit/afd58e5af1c382e9a8149877bdced90f1ab5d24b))
* BGM 和 VNDB 排序功能的简单实现 ([f8503a7](https://github.com/huoshen80/ReinaManager/commit/f8503a711e051fc4e33008c5b250ff82cff0ae2b))

</details>

### Bug Fixes

* custom game preview cover display issue ([d0ed1f9](https://github.com/huoshen80/ReinaManager/commit/d0ed1f9708c5f5c9644cc290dfc4737c28773f10))
* game covers marked as NSFW will not be replaced ([e4bfb56](https://github.com/huoshen80/ReinaManager/commit/e4bfb56d91f3fa88f35a617b4e541d9edd5a8d1b))
* pressing Win+D at startup causes the UI to crash, cancel the disabling of the Ctrl+A shortcut [#36](https://github.com/huoshen80/ReinaManager/issues/36) ([08fd61b](https://github.com/huoshen80/ReinaManager/commit/08fd61b1cfda35e47717f57aacb48e4e52c3a871))


### Features

* add docs link and issue button to settings ([afd58e5](https://github.com/huoshen80/ReinaManager/commit/afd58e5af1c382e9a8149877bdced90f1ab5d24b))
* simple implementation of BGM and VNDB ranking sorting ([f8503a7](https://github.com/huoshen80/ReinaManager/commit/f8503a711e051fc4e33008c5b250ff82cff0ae2b))



## [0.16.1](https://github.com/huoshen80/ReinaManager/compare/v0.16.0...v0.16.1) (2026-02-07)

<details>
<summary>查看中文版本</summary>

### 性能改进
* 优化全局游戏添加模块 ([14c2a24](https://github.com/huoshen80/ReinaManager/commit/14c2a24bd45fecc29e24a3faaff5c8ef50e5c255))

</details>

### Performance Improvements

* optimize global game addmodal ([14c2a24](https://github.com/huoshen80/ReinaManager/commit/14c2a24bd45fecc29e24a3faaff5c8ef50e5c255))



## [0.16.0](https://github.com/huoshen80/ReinaManager/compare/v0.15.2...v0.16.0) (2026-02-07)

<details>
<summary>查看中文版本</summary>

### Bug 修复
* 修复游戏详情页简介不换行的问题 ([8e2d0e1](https://github.com/huoshen80/ReinaManager/commit/8e2d0e11526fa0e8850fb348faeebe2d530ed7b1))

### 新功能
* 添加全局拖拽添加游戏功能 ([6297314](https://github.com/huoshen80/ReinaManager/commit/6297314c8631b2619972abd1f12ee9f6e385c05b))
* 增强游戏添加功能，添加成功后有成功提示并提供跳转详情页的按钮 ([90a28cd](https://github.com/huoshen80/ReinaManager/commit/90a28cd5052dd7faef3d20dd875ee494940d0b6e))

### 性能改进
* 调整收藏页面导航栏与下方内容的间距 ([17d2aa9](https://github.com/huoshen80/ReinaManager/commit/17d2aa9bf6a015a5bd8702d036fb101e7166476f))


</details>

### Bug Fixes

* the issue of the game details page summary not wrapping resolve [#35](https://github.com/huoshen80/ReinaManager/issues/35) ([8e2d0e1](https://github.com/huoshen80/ReinaManager/commit/8e2d0e11526fa0e8850fb348faeebe2d530ed7b1))


### Features

* add global drag-and-drop game adding feature ([6297314](https://github.com/huoshen80/ReinaManager/commit/6297314c8631b2619972abd1f12ee9f6e385c05b))
* enhance game addition with success snackbar and navigation option ([90a28cd](https://github.com/huoshen80/ReinaManager/commit/90a28cd5052dd7faef3d20dd875ee494940d0b6e))


### Performance Improvements

* adjust the spacing between the nav bar and the content below on the collection page ([17d2aa9](https://github.com/huoshen80/ReinaManager/commit/17d2aa9bf6a015a5bd8702d036fb101e7166476f))


## [0.15.2](https://github.com/huoshen80/ReinaManager/compare/v0.15.1...v0.15.2) (2026-02-02)

<details>
<summary>查看中文版本</summary>

### 新功能

* 冻结收藏页面顶部的导航栏 ([ced5fe2](https://github.com/huoshen80/ReinaManager/commit/ced5fe272c7efba2275f6bce8226874a4b0163cc))

</details>

### Features

* freeze the navigation bar at the top of the collection page ([ced5fe2](https://github.com/huoshen80/ReinaManager/commit/ced5fe272c7efba2275f6bce8226874a4b0163cc))



## [0.15.1](https://github.com/huoshen80/ReinaManager/compare/v0.14.2...v0.15.1) (2026-02-01)

<details>
<summary>查看中文版本</summary>

### Bug 修复

* 旧的游戏状态映射引起的显示和逻辑问题 ([5d6cbe2](https://github.com/huoshen80/ReinaManager/commit/5d6cbe2a232af74346a992fcc39ba89c5278e81c))
* 游戏状态切换二级菜单在展开时超出视口范围 ([218600c](https://github.com/huoshen80/ReinaManager/commit/218600cadf914db0db66c63097a3eea6ca6c72c7))


### 新功能

* 为新添加的游戏分配默认游戏状态 ([1d07d90](https://github.com/huoshen80/ReinaManager/commit/1d07d9051f630d54e394cdff50519019b2e78e0b))
* 实现游戏状态切换功能，并为其修改添加二级菜单 ([c73c597](https://github.com/huoshen80/ReinaManager/commit/c73c597e90a58a6ce93d5689c9dcd5ff5d6eeefc))


### 性能改进

* 添加迁移以清理数据库中的空字符串，并更新 DTO 以进行字符串清理 ([718ed54](https://github.com/huoshen80/ReinaManager/commit/718ed54355765cbacde5c5e9ae08feee65b89350))

</details>

### Bug Fixes

* display and logic issues caused by old game status mapping ([5d6cbe2](https://github.com/huoshen80/ReinaManager/commit/5d6cbe2a232af74346a992fcc39ba89c5278e81c))
* the submenu for switch game status extends beyond the viewport when expanded ([218600c](https://github.com/huoshen80/ReinaManager/commit/218600cadf914db0db66c63097a3eea6ca6c72c7))


### Features

* assign a default game status to newly added games ([1d07d90](https://github.com/huoshen80/ReinaManager/commit/1d07d9051f630d54e394cdff50519019b2e78e0b))
* implement switch games status feature with submenu for its updates ([c73c597](https://github.com/huoshen80/ReinaManager/commit/c73c597e90a58a6ce93d5689c9dcd5ff5d6eeefc))


### Performance Improvements

* add migration to clean empty strings in db and update DTOs for string sanitization ([718ed54](https://github.com/huoshen80/ReinaManager/commit/718ed54355765cbacde5c5e9ae08feee65b89350))



## ~~[0.15.0](https://github.com/huoshen80/ReinaManager/compare/v0.14.2...v0.15.0)(2026-02-01)~~ 

### *This is a deprecated version; the relevant content has been merged into version v0.15.1*

<details>
<summary>查看中文版本</summary>

### Bug 修复

* 游戏状态切换二级菜单在展开时超出视口范围 ([218600c](https://github.com/huoshen80/ReinaManager/commit/218600cadf914db0db66c63097a3eea6ca6c72c7))


### 新功能

* 为新添加的游戏分配默认游戏状态 ([1d07d90](https://github.com/huoshen80/ReinaManager/commit/1d07d9051f630d54e394cdff50519019b2e78e0b))
* 实现游戏状态切换功能，并为其修改添加二级菜单 ([c73c597](https://github.com/huoshen80/ReinaManager/commit/c73c597e90a58a6ce93d5689c9dcd5ff5d6eeefc))


### 性能改进

* 添加迁移以清理数据库中的空字符串，并更新 DTO 以进行字符串清理 ([718ed54](https://github.com/huoshen80/ReinaManager/commit/718ed54355765cbacde5c5e9ae08feee65b89350))

</details>

### Bug Fixes

* the submenu for switch game status extends beyond the viewport when expanded ([218600c](https://github.com/huoshen80/ReinaManager/commit/218600cadf914db0db66c63097a3eea6ca6c72c7))


### Features

* assign a default game status to newly added games ([1d07d90](https://github.com/huoshen80/ReinaManager/commit/1d07d9051f630d54e394cdff50519019b2e78e0b))
* implement switch games status feature with submenu for its updates ([c73c597](https://github.com/huoshen80/ReinaManager/commit/c73c597e90a58a6ce93d5689c9dcd5ff5d6eeefc))


### Performance Improvements

* add migration to clean empty strings in db and update DTOs for string sanitization ([718ed54](https://github.com/huoshen80/ReinaManager/commit/718ed54355765cbacde5c5e9ae08feee65b89350))



## [0.14.2](https://github.com/huoshen80/ReinaManager/compare/v0.14.1...v0.14.2) (2026-01-30)

<details>
<summary>查看中文版本</summary>

### Bug 修复

* **fs:** 补全了备份存档路径丢失的 "backups" 目录 ([bbe5b53](https://github.com/huoshen80/ReinaManager/commit/bbe5b538072f8df20743447654ebd1079979b2b4))

</details>

### Bug Fixes

* **fs:** add missing "backups" to the savedata backups path ([bbe5b53](https://github.com/huoshen80/ReinaManager/commit/bbe5b538072f8df20743447654ebd1079979b2b4))



## [0.14.1](https://github.com/huoshen80/ReinaManager/compare/v0.14.0...v0.14.1) (2026-01-28)

<details>
<summary>查看中文版本</summary>

### Bug 修复

* 修复在 LE 和 Magpie 开关上点击切换时的双重警告提示 ([8741ee0](https://github.com/huoshen80/ReinaManager/commit/8741ee0aa835aae6bfdaddc5fbc894af9e18a74f))
* 修复设置存档备份路径后无法打开存档备份文件夹的问题，解决 [#34](https://github.com/huoshen80/ReinaManager/issues/34) ([c5b47d4](https://github.com/huoshen80/ReinaManager/commit/c5b47d44aabdc423b37e16991ee3abe086e59553))

### 性能优化

* 将存档备份路径和数据库备份路径添加到路径缓存预加载 ([825970b](https://github.com/huoshen80/ReinaManager/commit/825970b08d3d2bde151748b8ff4ea32338ca7b01))

</details>

### Bug Fixes

* double warning alert when click the switch on the le and magpie switcher ([8741ee0](https://github.com/huoshen80/ReinaManager/commit/8741ee0aa835aae6bfdaddc5fbc894af9e18a74f))
* faild to open the savedata backup folder when set a savedata backup path resolve [#34](https://github.com/huoshen80/ReinaManager/issues/34) ([c5b47d4](https://github.com/huoshen80/ReinaManager/commit/c5b47d44aabdc423b37e16991ee3abe086e59553))


### Performance Improvements

* add savedata backup path and db backup path to path cache preload ([825970b](https://github.com/huoshen80/ReinaManager/commit/825970b08d3d2bde151748b8ff4ea32338ca7b01))



## [0.14.0](https://github.com/huoshen80/ReinaManager/compare/v0.13.0...v0.14.0) (2026-01-27)

<details>
<summary>查看中文版本</summary>

### Bug 修复

* 修复 custom_data 显示中的一些错误以及删除/更改自定义图像的逻辑 [skip ci] ([777bd1f](https://github.com/huoshen80/ReinaManager/commit/777bd1f499e95901645fead3aabfb6f4f3dc46cb))
* 修复通过 API 获取游戏数据的一些错误 ([9750268](https://github.com/huoshen80/ReinaManager/commit/975026818deb06f28ae7228696cdad0f31c3926e))

### 新功能

* 添加自定义字段：别名、开发商、发售日期、NSFW、简介和标签([f303660](https://github.com/huoshen80/ReinaManager/commit/f303660a7dd750385150559f5c4d033731911a85))
* 添加 LE 和 Magpie 工具联动启动 ([db6cb7f](https://github.com/huoshen80/ReinaManager/commit/db6cb7f8d0a2828ee198c54c01e8467b3d4b46e3))
* 添加 LE 和 Magpie 软件路径设置 ([1a20666](https://github.com/huoshen80/ReinaManager/commit/1a20666a10ba4dfff7d4ce5da4a0b6d28568fafd))
* 添加 reina-path 来管理数据库相关的路径常量 ([183571d](https://github.com/huoshen80/ReinaManager/commit/183571d34573cbfd51a8641da115b15f965ccf4a))
* 添加 YMGal 数据源并重构为单表 JSON 架构 ([cd4beda](https://github.com/huoshen80/ReinaManager/commit/cd4bedaaf6df3102790d59d3452d083eeb98e0b5))
* 在游戏详情页面添加最大游戏存档备份数量设置 ([c917443](https://github.com/huoshen80/ReinaManager/commit/c917443b5de15ae1907a7ab15444aff16c906886))
* 正式添加 YmGal 数据源 ([d8f2ffd](https://github.com/huoshen80/ReinaManager/commit/d8f2ffd23621fdc7fd61724babf6fa356118162b))

### 性能改进

* 优化 NSFW 游戏判断逻辑，优先使用数据源，其次使用标签判断 ([021802e](https://github.com/huoshen80/ReinaManager/commit/021802e4fdae9b8c2d6c4deadbd337850065a877))

### 破坏性变更

* 将数据库从多表关系重构为带有 JSON 列的单表结构（bgm_data、vndb_data、ymgal_data、custom_data）

- 添加 YMGal API 集成
- 为前端类型使用 DTO 模式（InsertGameParams、UpdateGameParams、FullGameData）
- 支持三态更新逻辑（undefined/null/value）
- 用 custom_data JSON 列替换 custom_name/custom_cover
- 简化服务层 API 并移除嵌套结构
- 更新所有 UI 组件以支持 YMGal 数据源

</details>

### Bug Fixes

* some bugs in custom_data display and the logic for delete/change custom images [skip ci] ([777bd1f](https://github.com/huoshen80/ReinaManager/commit/777bd1f499e95901645fead3aabfb6f4f3dc46cb))
* some bugs of get game data by api ([9750268](https://github.com/huoshen80/ReinaManager/commit/975026818deb06f28ae7228696cdad0f31c3926e))


### Features

* add custom fields for alias, developer, release date, NSFW, description, and tags ([f303660](https://github.com/huoshen80/ReinaManager/commit/f303660a7dd750385150559f5c4d033731911a85))
* add LE and Magpie launch support ([db6cb7f](https://github.com/huoshen80/ReinaManager/commit/db6cb7f8d0a2828ee198c54c01e8467b3d4b46e3))
* add LE and Magpie software path settings ([1a20666](https://github.com/huoshen80/ReinaManager/commit/1a20666a10ba4dfff7d4ce5da4a0b6d28568fafd))
* add reina-path to manage db related path constant ([183571d](https://github.com/huoshen80/ReinaManager/commit/183571d34573cbfd51a8641da115b15f965ccf4a))
* add YMGal data source and refactor to single-table JSON architecture ([cd4beda](https://github.com/huoshen80/ReinaManager/commit/cd4bedaaf6df3102790d59d3452d083eeb98e0b5))
* added a max backup quantity setting to the game details page ([c917443](https://github.com/huoshen80/ReinaManager/commit/c917443b5de15ae1907a7ab15444aff16c906886))
* officially add YmGal data source ([d8f2ffd](https://github.com/huoshen80/ReinaManager/commit/d8f2ffd23621fdc7fd61724babf6fa356118162b))


### Performance Improvements

* optimized NSFW game judgment logic, prioritizing data source, followed by tag judgment ([021802e](https://github.com/huoshen80/ReinaManager/commit/021802e4fdae9b8c2d6c4deadbd337850065a877))


### BREAKING CHANGES

* Refactor database from multi-table relations to single-table
with JSON columns (bgm_data, vndb_data, ymgal_data, custom_data).

- Add YMGal API integration
- use DTO pattern for frontend type (InsertGameParams, UpdateGameParams, FullGameData)
- Support three-state update logic (undefined/null/value)
- Replace custom_name/custom_cover with custom_data JSON column
- Simplify service layer API and remove nested structures
- Update all UI components to easily support the YMGal data source



## [0.13.0](https://github.com/huoshen80/ReinaManager/compare/v0.12.0...v0.13.0) (2025-12-27)

<details>
<summary>查看中文版本</summary>

### Bug 修复

* 修复软件内中文更新日志显示错误的问题，更新更新日志 ([4a804b0](https://github.com/huoshen80/ReinaManager/commit/4a804b0692bf116468345d7d9508672fbbe83670))
* 恢复存档时不覆盖原始存档目录 ([5a5bec2](https://github.com/huoshen80/ReinaManager/commit/5a5bec2856f3faa7442fbfc637d9155d362e0eed))

### 新功能

* 添加存档恢复功能，限制存档备份最大数量为 20，使用 sevenz-rust2 替代原压缩库 ([9c9c10a](https://github.com/huoshen80/ReinaManager/commit/9c9c10abef05697b19e3238c1e435b19a9e285ac))
* **详情页:** 为游戏游玩时长图表添加时间范围选择器 ([94912da](https://github.com/huoshen80/ReinaManager/commit/94912da1df9fb80c4e304208d16bcf655ba18fa1))
* 实现便携模式并重构部分路径管理 ([af7d602](https://github.com/huoshen80/ReinaManager/commit/af7d602a568c42887ec9e7419a12c7803898d30f))

### 性能改进

* 改进切换便携模式时的错误处理，并整理文件操作相关的函数以提高代码可读性 ([45e7ff1](https://github.com/huoshen80/ReinaManager/commit/45e7ff1adf2e54da441347cc688e12423c64ec51))

</details>

### Bug Fixes

* issue where Chinese changelog display incorrectly in software,update changelog ([4a804b0](https://github.com/huoshen80/ReinaManager/commit/4a804b0692bf116468345d7d9508672fbbe83670))
* no overwrite the original save directory when restoring saves ([5a5bec2](https://github.com/huoshen80/ReinaManager/commit/5a5bec2856f3faa7442fbfc637d9155d362e0eed))


### Features

* add savedata restore fn, limit the max number of savedata backups to 20, using sevenz-rust2 instead ([9c9c10a](https://github.com/huoshen80/ReinaManager/commit/9c9c10abef05697b19e3238c1e435b19a9e285ac))
* **detail:** add time range selector for game playtime chart ([94912da](https://github.com/huoshen80/ReinaManager/commit/94912da1df9fb80c4e304208d16bcf655ba18fa1))
* implement portable mode and refactor some path management ([af7d602](https://github.com/huoshen80/ReinaManager/commit/af7d602a568c42887ec9e7419a12c7803898d30f))


### Performance Improvements

* improve error handling when switching portable mode, and organize fs functions to enhance code readability ([45e7ff1](https://github.com/huoshen80/ReinaManager/commit/45e7ff1adf2e54da441347cc688e12423c64ec51))



## [0.12.0](https://github.com/huoshen80/ReinaManager/compare/v0.10.0...v0.12.0) (2025-12-06)

<details>
<summary>查看中文版本</summary>

### Bug 修复

* 添加 statsVersion 用于在游戏结束时触发部分主页数据刷新 ([725107b](https://github.com/huoshen80/ReinaManager/commit/725107b396c3bfc71bab85616569ad8322fe1f21))
* **收藏夹:** 在列表更改或删除游戏后未更新分类游戏数量 ([dbaf442](https://github.com/huoshen80/ReinaManager/commit/dbaf44214f4a11d19b9974dff15bd58ca2eb00ca))
* **暗色模式:** 删除错误或无用 className 修复暗色模式下的显示问题 ([66356c1](https://github.com/huoshen80/ReinaManager/commit/66356c1d5edaf8523d7b23f275c64900ce65af57))
* **数据库:** 使用 VACUUM INTO 实现数据库热备份以避免直接复制导致的数据丢失；添加导入前自动备份 ([ee37ea8](https://github.com/huoshen80/ReinaManager/commit/ee37ea86376035de72f3650e2f605622d319d3e7))

### 新功能

* **游戏添加:** 添加游戏选择与确认对话框，并增强 bgm api 的开发商字段获取逻辑 ([44413d2](https://github.com/huoshen80/ReinaManager/commit/44413d29ae2711b70fc03eb21b8d55ea503d8bdf))
* **游戏启动:** 为在线游戏添加本地路径同步功能按钮 ([a464ea6](https://github.com/huoshen80/ReinaManager/commit/a464ea66aa16d5ac1e41ebce54cd2d5f9178650b))

### 性能改进

* **游戏状态:** 将单个统计接口替换为获取全部游戏统计的接口，以减少软件启动时对数据库的请求 ([7ff7357](https://github.com/huoshen80/ReinaManager/commit/7ff7357a120a2cbda8fd243366d3ef825385d4a1))

</details>

### Bug Fixes

* add statsVersion to trigger some home page data refresh on game end ([725107b](https://github.com/huoshen80/ReinaManager/commit/725107b396c3bfc71bab85616569ad8322fe1f21))
* **collection:** no update category game count after list changes or game deletion ([dbaf442](https://github.com/huoshen80/ReinaManager/commit/dbaf44214f4a11d19b9974dff15bd58ca2eb00ca))
* **dark mode:** remove error or useless className to fix display bug in dark mode ([66356c1](https://github.com/huoshen80/ReinaManager/commit/66356c1d5edaf8523d7b23f275c64900ce65af57))
* **db:** use VACUUM INTO to implement database hot backups to avoid data loss caused by direct copy; add auto backups before import ([ee37ea8](https://github.com/huoshen80/ReinaManager/commit/ee37ea86376035de72f3650e2f605622d319d3e7))


### Features

* **AddModal:** add game selection and confirm dialog,enhance bgm api developer field fetching logic ([44413d2](https://github.com/huoshen80/ReinaManager/commit/44413d29ae2711b70fc03eb21b8d55ea503d8bdf))
* **LaunchModal:** add local path sync feat button for online games ([a464ea6](https://github.com/huoshen80/ReinaManager/commit/a464ea66aa16d5ac1e41ebce54cd2d5f9178650b))


### Performance Improvements

* **gameStats:** replace the single statistic interface with the interface that fetches all game statistic to reduce db requests when startup software ([7ff7357](https://github.com/huoshen80/ReinaManager/commit/7ff7357a120a2cbda8fd243366d3ef825385d4a1))



## [0.11.0](https://github.com/huoshen80/ReinaManager/compare/v0.10.0...v0.11.0) (2025-12-02)

<details>
<summary>查看中文版本</summary>

### 新功能

* 添加数据库导入功能 ([73d8ea3](https://github.com/huoshen80/ReinaManager/commit/73d8ea317a12cb8e4a5ca7f3bca5f86c4afde9d5))
* 为收藏页面游戏列表添加拖拽排序功能 关闭 [[#28](https://github.com/huoshen80/ReinaManager/issues/28)](https://github.com/huoshen80/ReinaManager/commit/2be37dc39e5af3bed7d38e43f12d61fe44d9a5d2))
* 添加游戏计时器模式设置，支持实际游玩时间和游戏启动时间两种计时方式 关闭 [#29](https://github.com/huoshen80/ReinaManager/issues/29) ([072f0c6](https://github.com/huoshen80/ReinaManager/commit/072f0c6beb17e121ea88654c91dcff6e22148faa))

</details>

### Features

* add database import functionality ([73d8ea3](https://github.com/huoshen80/ReinaManager/commit/73d8ea317a12cb8e4a5ca7f3bca5f86c4afde9d5))
* add drag-and-drop sorting feat to the collections page game list close [[#28](https://github.com/huoshen80/ReinaManager/issues/28)](https://github.com/huoshen80/ReinaManager/issues/28) ([2be37dc](https://github.com/huoshen80/ReinaManager/commit/2be37dc39e5af3bed7d38e43f12d61fe44d9a5d2))
* add game timer mode settings, supporting playtime and elapsed close [#29](https://github.com/huoshen80/ReinaManager/issues/29) ([072f0c6](https://github.com/huoshen80/ReinaManager/commit/072f0c6beb17e121ea88654c91dcff6e22148faa))



## [0.10.0](https://github.com/huoshen80/ReinaManager/compare/v0.9.0...v0.10.0) (2025-11-25)

<details>
<summary>查看中文版本</summary>

### Bug 修复

* 根据语言动态调整样式以改进导航栏 UI ([d0277b1](https://github.com/huoshen80/ReinaManager/commit/d0277b1e3d7db6802ae23fc1c45dac5eb1469212))
* **game_monitor:** 修复某些游戏的时长监控问题 ([7ac1906](https://github.com/huoshen80/ReinaManager/commit/7ac1906b1177e29a8c1d3a734bbdccc6355509f8))

### 新功能

* 添加日志等级设置 ([a278b77](https://github.com/huoshen80/ReinaManager/commit/a278b77905437a701ca92965292633d251d633e5))
* 添加停止游戏功能，统一异步运行时并使用 parking_lot::RwLock 替代 std::sync::Mutex ([5413400](https://github.com/huoshen80/ReinaManager/commit/5413400869a8f23856985cbdc9c084c37d6d54c8))
* **LaunchModal:** 在启动按钮中显示实时游戏时长 ([2b05d5c](https://github.com/huoshen80/ReinaManager/commit/2b05d5cc2a33a4d4163d5653009c6a44c8a6b37d))
* **linux:** Linux 系统中可使用打开目录功能 ([b21e885](https://github.com/huoshen80/ReinaManager/commit/b21e885b2a307b3f9e23da362ebeeb637e949785))

### 性能改进

* **game_monitor:** 使用 interval 定时器改进监控循环精度 ([531ac53](https://github.com/huoshen80/ReinaManager/commit/531ac53644d516b24c7d31ff58298c94e56d1f77))
* **store,gameStats:** 优化游戏统计和游戏列表检索逻辑以减少重复请求 ([f7d87e7](https://github.com/huoshen80/ReinaManager/commit/f7d87e72585682c593310b9d1b124096638ae36b))

</details>


### Bug Fixes

* add dynamic styling based on language for improved navbar UI ([d0277b1](https://github.com/huoshen80/ReinaManager/commit/d0277b1e3d7db6802ae23fc1c45dac5eb1469212))
* **game_monitor:** resolve time tracking issues for some games ([7ac1906](https://github.com/huoshen80/ReinaManager/commit/7ac1906b1177e29a8c1d3a734bbdccc6355509f8))


### Features

* add loglevel setting ([a278b77](https://github.com/huoshen80/ReinaManager/commit/a278b77905437a701ca92965292633d251d633e5))
* add stop game functionality, unified async runtime and use parking_lot::RwLock instead of std::sync::Mutex ([5413400](https://github.com/huoshen80/ReinaManager/commit/5413400869a8f23856985cbdc9c084c37d6d54c8))
* **LaunchModal:** display real-time game duration in the launch button ([2b05d5c](https://github.com/huoshen80/ReinaManager/commit/2b05d5cc2a33a4d4163d5653009c6a44c8a6b37d))
* **linux:** open directory in linux ([b21e885](https://github.com/huoshen80/ReinaManager/commit/b21e885b2a307b3f9e23da362ebeeb637e949785))


### Performance Improvements

* **game_monitor:** improve monitor loop precision with interval timer ([531ac53](https://github.com/huoshen80/ReinaManager/commit/531ac53644d516b24c7d31ff58298c94e56d1f77))
* **store,gameStats:** optimize game statistics and games list retrieval logic to reduce duplicate requests ([f7d87e7](https://github.com/huoshen80/ReinaManager/commit/f7d87e72585682c593310b9d1b124096638ae36b))



## [0.9.0](https://github.com/huoshen80/ReinaManager/compare/v0.8.2...v0.9.0) (2025-11-14)

<details>
<summary>查看中文版本</summary>

### Bug 修复

* 游戏列表中的标题偶尔不会随语言切换而改变 ([b570f0a](https://github.com/huoshen80/ReinaManager/commit/b570f0ac1725fff99d77619bb271189c797dae57))

### 新功能

* 添加具有组和分类的收藏管理功能 ([f28d093](https://github.com/huoshen80/ReinaManager/commit/f28d09302f2795f8b067e6b8056684f87035df14))
* 为收藏模块添加 i18n 支持 ([2041c19](https://github.com/huoshen80/ReinaManager/commit/2041c19c6ef3631dfeea249a022315bfdcaf75c7))

### 性能改进

* 添加防抖 Hook 并在 ManageGamesDialog 和 SearchBox 组件中应用 ([0002755](https://github.com/huoshen80/ReinaManager/commit/0002755b7f75a44532eb21be053cc0d75bb1b557))
* 添加 categoryGamesCache 以优化分类游戏数据检索 ([841fb41](https://github.com/huoshen80/ReinaManager/commit/841fb41691698e5ea76b24cd02e94f95edf507a8))
* 优化分类中批量更新游戏列表和检索组中游戏数量的接口 ([2fdf83f](https://github.com/huoshen80/ReinaManager/commit/2fdf83ff8997c8a852a3ada17715a8ef88567cbf))

</details>

### Bug Fixes

* titles in the game list occasionally do not change with the language switching ([b570f0a](https://github.com/huoshen80/ReinaManager/commit/b570f0ac1725fff99d77619bb271189c797dae57))


### Features

* add collection management features with groups and categories ([f28d093](https://github.com/huoshen80/ReinaManager/commit/f28d09302f2795f8b067e6b8056684f87035df14))
* add i18n support for collection mod ([2041c19](https://github.com/huoshen80/ReinaManager/commit/2041c19c6ef3631dfeea249a022315bfdcaf75c7))


### Performance Improvements

* add a debounce Hook and apply it in the ManageGamesDialog and SearchBox components ([0002755](https://github.com/huoshen80/ReinaManager/commit/0002755b7f75a44532eb21be053cc0d75bb1b557))
* add categoryGamesCache to optimize category game data retrieval ([841fb41](https://github.com/huoshen80/ReinaManager/commit/841fb41691698e5ea76b24cd02e94f95edf507a8))
* optimize the interface for batch updating the game list in categories and retrieving the number of games in groups ([2fdf83f](https://github.com/huoshen80/ReinaManager/commit/2fdf83ff8997c8a852a3ada17715a8ef88567cbf))



## [0.8.2](https://github.com/huoshen80/ReinaManager/compare/v0.8.1...v0.8.2) (2025-11-08)

<details>
<summary>查看中文版本</summary>

### Bug 修复

* 添加了在线游戏的可执行文件后，工具栏状态未更新的问题 ([1844962](https://github.com/huoshen80/ReinaManager/commit/1844962e2816c87f8f3113b158752550ea20e38e))
* React.lazy 引起的字体样式问题，更新部分依赖 ([ab0ea7e](https://github.com/huoshen80/ReinaManager/commit/ab0ea7e2d8d8d87f7f1188597977d757f67cd772))
* **游戏监控:** 防止程序自己监控自己并优化代码可读性和逻辑，将 println! 替换为 log! ([#24](https://github.com/huoshen80/ReinaManager/issues/24)) ([86b3a79](https://github.com/huoshen80/ReinaManager/commit/86b3a79a95c69db84a906ba970f14cdcc550c248))
* 托盘菜单在语言切换后未更新的问题，添加部分 i18n 字段 ([3bca148](https://github.com/huoshen80/ReinaManager/commit/3bca148c93ce826ae00ca72dc0148fc21093c07c))

### 新功能

* 在排序弹窗中添加名称排序选项 ([17693c5](https://github.com/huoshen80/ReinaManager/commit/17693c5a20029e67c88ac132b7d3372666745b2a))

### 性能改进

* 为获取开发商字段而改进 bgm api 的过滤器，对于mixed数据源，开发商字段现在优先使用 vndb 替代 bgm ([15e3baa](https://github.com/huoshen80/ReinaManager/commit/15e3baae5809912b051041ae5f0f7e8f8fe45363))
* 使用 React.lazy 和 Suspense 优化组件加载，并添加加载指示器 ([4fc71e9](https://github.com/huoshen80/ReinaManager/commit/4fc71e989efab60a9b29f816e7d56a23fcca288a))

</details>

### Bug Fixes

* after adding an executable file for the online game, the toolbar status does not change ([1844962](https://github.com/huoshen80/ReinaManager/commit/1844962e2816c87f8f3113b158752550ea20e38e))
* font style issues caused by react.lazy and update some deps ([ab0ea7e](https://github.com/huoshen80/ReinaManager/commit/ab0ea7e2d8d8d87f7f1188597977d757f67cd772))
* **game_monitor:** prevent self-monitoring and optimize code readability and logic, replace println! to log! ([#24](https://github.com/huoshen80/ReinaManager/issues/24)) ([86b3a79](https://github.com/huoshen80/ReinaManager/commit/86b3a79a95c69db84a906ba970f14cdcc550c248))
* tray no update the menu after language switching,add some i18n fileds ([3bca148](https://github.com/huoshen80/ReinaManager/commit/3bca148c93ce826ae00ca72dc0148fc21093c07c))


### Features

* add name sort option  in sort modal ([17693c5](https://github.com/huoshen80/ReinaManager/commit/17693c5a20029e67c88ac132b7d3372666745b2a))


### Performance Improvements

* improved the bgm api filter for retrieving developer fields.,for mixed data sources, the developer field now prioritizes using vndb instead of bgm ([15e3baa](https://github.com/huoshen80/ReinaManager/commit/15e3baae5809912b051041ae5f0f7e8f8fe45363))
* optimize component loading using React.lazy and Suspense, and add a loading indicator ([4fc71e9](https://github.com/huoshen80/ReinaManager/commit/4fc71e989efab60a9b29f816e7d56a23fcca288a))



## [0.8.1](https://github.com/huoshen80/ReinaManager/compare/v0.8.0...v0.8.1) (2025-10-25)

<details>
<summary>查看中文版本</summary>

### Bug 修复
* 更新游戏数据后，编辑页面无法正确显示更新后的游戏数据 ([7cb6c42](https://github.com/huoshen80/ReinaManager/commit/7cb6c42d53f1e5d486c52c0fdb7844fddbaf8997))

</details>

### Bug Fixes

* updated game data could not be displayed correctly after update game data in edit page ([7cb6c42](https://github.com/huoshen80/ReinaManager/commit/7cb6c42d53f1e5d486c52c0fdb7844fddbaf8997))



## [0.8.0](https://github.com/huoshen80/ReinaManager/compare/v0.7.2...v0.8.0) (2025-10-25)

<details>
<summary>查看中文版本</summary>

### 新功能

* 添加从 API 批量更新游戏数据的功能，为vndb API添加从不同剧透等级获取标签的功能 ，并改进 bgm API 的别名过滤器 ([19dd2c1](https://github.com/huoshen80/ReinaManager/commit/19dd2c1eda712d5e1b9c2a476d4f8c55e4aba35e))

</details>

### Features

* add batch update games data function from api,add get tags from diff spoiler level function for vndb api and improve aliases filter for bgm api ([19dd2c1](https://github.com/huoshen80/ReinaManager/commit/19dd2c1eda712d5e1b9c2a476d4f8c55e4aba35e))



## [0.7.2](https://github.com/huoshen80/ReinaManager/compare/v0.7.1...v0.7.2) (2025-10-22)

<details>
<summary>查看中文版本</summary>

### Bug 修复

* 由window-state插件引起的自动退出(降级到2.2.3)，更新部分依赖 ([1102e5a](https://github.com/huoshen80/ReinaManager/commit/1102e5ac8f527e4296b44ae7dfe734d89ad766fa))

</details>

### Bug Fixes

* auto exit caused by the window-state plugin(downgrade to 2.2.3) and update some dependencies ([1102e5a](https://github.com/huoshen80/ReinaManager/commit/1102e5ac8f527e4296b44ae7dfe734d89ad766fa))



## [0.7.1](https://github.com/huoshen80/ReinaManager/compare/v0.7.0...v0.7.1) (2025-10-20)

<details>
<summary>查看中文版本</summary>

### Bug 修复

* 由window-state插件引起的自动退出 ([1918e22](https://github.com/huoshen80/ReinaManager/commit/1918e2209e588c98660df3a1cc7db33894b9fab0))

</details>

### Bug Fixes

* auto exit caused by the window-state plugin ([1918e22](https://github.com/huoshen80/ReinaManager/commit/1918e2209e588c98660df3a1cc7db33894b9fab0))



## [0.7.0](https://github.com/huoshen80/ReinaManager/compare/v0.6.9...v0.7.0) (2025-10-09)

<details>
<summary>查看中文版本</summary>

### Bug 修复

* 修复勾选“不再提醒”后，关闭按钮的默认行为无法保存的问题 ([54aab08](https://github.com/huoshen80/ReinaManager/commit/54aab0818c79ddc8790d2b33ecf159bd61eb93c5))

### 新功能

* 新增自定义数据库备份路径功能，调整部分数据库表结构与约束，解决 [#19](https://github.com/huoshen80/ReinaManager/issues/19) ([40d089b](https://github.com/huoshen80/ReinaManager/commit/40d089b7983fb9a2848ed812d96ca763626a2966))
* 新增调试与发布日志功能 ([7bc734a](https://github.com/huoshen80/ReinaManager/commit/7bc734ab80438f8d6e395be276b7a9e9fb5e9b4b))
* 集成 tauri-plugin-window-state，支持窗口状态保存，格式化部分代码并更新路由依赖 ([20086a6](https://github.com/huoshen80/ReinaManager/commit/20086a6fdd73801c9d0a003121354a8bccae5182))
* 数据库迁移前自动备份数据库 ([36c71bf](https://github.com/huoshen80/ReinaManager/commit/36c71bf1c6ea093fd2b94e92c370c4df7904d2dd))
* 持久化管理筛选偏好，使用 Zustand 替代 localStorage 管理持久化字段，规范排序与筛选组件代码 ([232e2bf](https://github.com/huoshen80/ReinaManager/commit/232e2bf331d3baf22ac344af3f42aff2bd5fd45b))

### 性能改进

* 路由配置扁平化，增强滚动恢复 hook 以更好适配 KeepAlive，优化卡片组件，新增分类页面文件夹 ([5d7427f](https://github.com/huoshen80/ReinaManager/commit/5d7427f063cd83ad54f2b4fb00cfd0a4f0c3d217))

</details>

### Bug Fixes

* after checking 'Do not remind again,' the default behavior of the close button cannot save ([54aab08](https://github.com/huoshen80/ReinaManager/commit/54aab0818c79ddc8790d2b33ecf159bd61eb93c5))


### Features

* add a custom database backup path feature and adjust the structure and constraints of certain database tables resolve [#19](https://github.com/huoshen80/ReinaManager/issues/19) ([40d089b](https://github.com/huoshen80/ReinaManager/commit/40d089b7983fb9a2848ed812d96ca763626a2966))
* add log for debug and release ([7bc734a](https://github.com/huoshen80/ReinaManager/commit/7bc734ab80438f8d6e395be276b7a9e9fb5e9b4b))
* add tauri-plugin-window-state to save window state after exit,format some code  and update router dependences ([20086a6](https://github.com/huoshen80/ReinaManager/commit/20086a6fdd73801c9d0a003121354a8bccae5182))
* auto backup database before migration ([36c71bf](https://github.com/huoshen80/ReinaManager/commit/36c71bf1c6ea093fd2b94e92c370c4df7904d2dd))
* persistently manage filter preferences, use Zustand instead of localStorage to manage persistent fields, and standardize the code for sort and filter components. ([232e2bf](https://github.com/huoshen80/ReinaManager/commit/232e2bf331d3baf22ac344af3f42aff2bd5fd45b))


### Performance Improvements

* use a flattened routing config, enhance the scroll recovery hook to better adapt to KeepAlive, and optimize the cards component,create a new category page folder ([5d7427f](https://github.com/huoshen80/ReinaManager/commit/5d7427f063cd83ad54f2b4fb00cfd0a4f0c3d217))



## [0.6.9](https://github.com/huoshen80/ReinaManager/compare/v0.6.8...v0.6.9) (2025-09-18)

<details>
<summary>查看中文版本</summary>

### Bug 修复

* 优化游戏结束后的详情页闪烁的问题，优化最近游玩更新的刷新条件 ([f8cdafe](https://github.com/huoshen80/ReinaManager/commit/f8cdafe779b1bb15e18b970d5017e43e6db45295))
* 修复发布流程无法上传正确的 `latest.json`的问题,为`latest.json`更换cdn链接，更换`endpoints` ([766606b](https://github.com/huoshen80/ReinaManager/commit/766606be6a942da14935fd9f99b30cd7a5adf079))
* 修复部分组件在暗黑模式下显示异常的问题 ([e28a0df](https://github.com/huoshen80/ReinaManager/commit/e28a0dff478f756088cc8173130b255b77ba71d7))

### 新功能

* 添加未通关游戏（noclear）筛选选项 ([85f9531](https://github.com/huoshen80/ReinaManager/commit/85f9531cde9b9ca200bf945b450e9b78a49b6d1a))
* 添加对 `win_arm64` 的支持 ([c8ae9de](https://github.com/huoshen80/ReinaManager/commit/c8ae9de5227c67e2b2ec20bec847dc956a054dec))

</details>

### Bug Fixes

* details page flash after the game end, optimizing the refresh condition for recent play update ([f8cdafe](https://github.com/huoshen80/ReinaManager/commit/f8cdafe779b1bb15e18b970d5017e43e6db45295))
* release workflow can't upload correct latest.json and update cdn urls in latest.json,updater endpoints ([766606b](https://github.com/huoshen80/ReinaManager/commit/766606be6a942da14935fd9f99b30cd7a5adf079))
* some components display abnormally in dark mode ([e28a0df](https://github.com/huoshen80/ReinaManager/commit/e28a0dff478f756088cc8173130b255b77ba71d7))


### Features

* add noclear games filter ([85f9531](https://github.com/huoshen80/ReinaManager/commit/85f9531cde9b9ca200bf945b450e9b78a49b6d1a))
* add win_arm64 support ([c8ae9de](https://github.com/huoshen80/ReinaManager/commit/c8ae9de5227c67e2b2ec20bec847dc956a054dec))



## [0.6.8](https://github.com/huoshen80/ReinaManager/compare/v0.6.7...v0.6.8) (2025-09-12)

<details>
<summary>查看中文版本</summary>

### Bug 修复

* 改进工具栏，修复无法删除带有存档备份游戏的问题，避免不必要的刷新 ([0d3840c](https://github.com/huoshen80/ReinaManager/commit/0d3840c5f4d4783d96705388050b038c8d42e260))
* issue [#14](https://github.com/huoshen80/ReinaManager/issues/14) 的修复 ([#15](https://github.com/huoshen80/ReinaManager/issues/15)) ([bf0951d](https://github.com/huoshen80/ReinaManager/commit/bf0951db286bfbb5d6c7506702bbf39d81070180))
* 更新到 v0.6.8 并使用正确的 latest.json ([d8da7a6](https://github.com/huoshen80/ReinaManager/commit/d8da7a61490d58f9a95518374d21d1082c65e02e))


### 新功能

* 实现跨组件的滚动位置保存与恢复 ([e43877c](https://github.com/huoshen80/ReinaManager/commit/e43877cab10b9b6926e39e1cf2031176cddaeb7d))


### 性能改进

* 优化 Detail 页面渲染与数据处理 ([5248de8](https://github.com/huoshen80/ReinaManager/commit/5248de893131f241473f0e992e4f90dcfe8c5188))
* 优化 Home 页面渲染与游戏统计计算 ([18ff779](https://github.com/huoshen80/ReinaManager/commit/18ff779526f9f437246b739a822e65db56a5dacc))

</details>

### Bug Fixes

* improve toolbar,fix can't delete game with savedata backup,avoid unnecessary  refreshes ([0d3840c](https://github.com/huoshen80/ReinaManager/commit/0d3840c5f4d4783d96705388050b038c8d42e260))
* issue [#14](https://github.com/huoshen80/ReinaManager/issues/14) ([#15](https://github.com/huoshen80/ReinaManager/issues/15)) ([bf0951d](https://github.com/huoshen80/ReinaManager/commit/bf0951db286bfbb5d6c7506702bbf39d81070180))
* update to v0.6.8 with correct latest.json ([d8da7a6](https://github.com/huoshen80/ReinaManager/commit/d8da7a61490d58f9a95518374d21d1082c65e02e))


### Features

* implement scroll position saving and restoration across components ([e43877c](https://github.com/huoshen80/ReinaManager/commit/e43877cab10b9b6926e39e1cf2031176cddaeb7d))


### Performance Improvements

* optimize Detail page rendering and data handling ([5248de8](https://github.com/huoshen80/ReinaManager/commit/5248de893131f241473f0e992e4f90dcfe8c5188))
* optimize Home page render and game statistics calculations ([18ff779](https://github.com/huoshen80/ReinaManager/commit/18ff779526f9f437246b739a822e65db56a5dacc))



## [0.6.7](https://github.com/huoshen80/ReinaManager/compare/v0.6.6...v0.6.7) (2025-09-06)


<details>
<summary>查看中文版本</summary>

### Bug 修复

* 更新到0.6.7版本，修复单实例插件的一个bug ([f72cb5a](https://github.com/huoshen80/ReinaManager/commit/f72cb5a69e731945f4f3a5a0f0b642ecd879693b))
* 更新日志样式未生效；未带 R18 标签的拔作（nukige）未被标记为 NSFW。 ([83de6f2](https://github.com/huoshen80/ReinaManager/commit/83de6f2614fcdb66a451fa786c178eac0d055dde))

### 新功能

* 增强 API 以获取游戏别名，向数据库新增自定义游戏信息字段 ([67d2efe](https://github.com/huoshen80/ReinaManager/commit/67d2efed572ae63cf69322281325491c22143c55))
* 增强搜索功能：支持游戏别名、备注与所有标题的搜索；新增游戏备注与自定义封面功能，解决 [#12](https://github.com/huoshen80/ReinaManager/issues/12) ([bd2cbe7](https://github.com/huoshen80/ReinaManager/commit/bd2cbe790d43d9f01627d820711954a480e8db8a))
* 实现增强搜索功能 ([#11](https://github.com/huoshen80/ReinaManager/issues/11)) ([bb7160a](https://github.com/huoshen80/ReinaManager/commit/bb7160a17c720cd10d3ade2284432751e809a3ea))
* VNDB 标签翻译（简体中文） ([#10](https://github.com/huoshen80/ReinaManager/issues/10)) ([35859c4](https://github.com/huoshen80/ReinaManager/commit/35859c4121aa3093de750dff3d339739783cf179))

</details>

### Bug Fixes

* update version to 0.6.7 with fix a bug of single-instance ([f72cb5a](https://github.com/huoshen80/ReinaManager/commit/f72cb5a69e731945f4f3a5a0f0b642ecd879693b))
* update log style is not effective, nukige without R18 tags are not marked as nsfw. ([83de6f2](https://github.com/huoshen80/ReinaManager/commit/83de6f2614fcdb66a451fa786c178eac0d055dde))


### Features

* enhance API to get game aliases, add custom game info field to the database ([67d2efe](https://github.com/huoshen80/ReinaManager/commit/67d2efed572ae63cf69322281325491c22143c55))
* enhance search functionality, support game aliases, notes, and all titles searching, add game notes, and customize cover features resolve [#12](https://github.com/huoshen80/ReinaManager/issues/12) ([bd2cbe7](https://github.com/huoshen80/ReinaManager/commit/bd2cbe790d43d9f01627d820711954a480e8db8a))
* Implement enhanced search functionality ([#11](https://github.com/huoshen80/ReinaManager/issues/11)) ([bb7160a](https://github.com/huoshen80/ReinaManager/commit/bb7160a17c720cd10d3ade2284432751e809a3ea))
* VNDB Tag Translation zh_CN ([#10](https://github.com/huoshen80/ReinaManager/issues/10)) ([35859c4](https://github.com/huoshen80/ReinaManager/commit/35859c4121aa3093de750dff3d339739783cf179))



## [0.6.6](https://github.com/huoshen80/ReinaManager/compare/v0.6.6-1...v0.6.6) (2025-08-27)


<details>
<summary>查看中文版本</summary>

### Bug 修复

* 更新至 v0.6.6 版本，增强更新日志和更新部分组件 ([7826c37](https://github.com/huoshen80/ReinaManager/commit/7826c3708f51c91045f22384b9ec1b7c27aa5477))

### 新功能

* 添加卡片点击模式设置（导航/选择），支持双击和长按启动游戏 关闭 [#4](https://github.com/huoshen80/ReinaManager/issues/4) ([4af1881](https://github.com/huoshen80/ReinaManager/commit/4af1881912ff48357ab484de5f22b6f5b2f59e99))
* 为Whitecloud提供数据迁移工具 详情见 [#4](https://github.com/huoshen80/ReinaManager/issues/4) ([523c71a](https://github.com/huoshen80/ReinaManager/commit/523c71a3fdaaf78855f6dca0638a414021781a84))

</details>

### Bug Fixes

* update to v0.6.6 with enhanced changelog and update modal ([7826c37](https://github.com/huoshen80/ReinaManager/commit/7826c3708f51c91045f22384b9ec1b7c27aa5477))


### Features

* add card click mode settings, support double-click and long press to launch game close [#4](https://github.com/huoshen80/ReinaManager/issues/4) ([4af1881](https://github.com/huoshen80/ReinaManager/commit/4af1881912ff48357ab484de5f22b6f5b2f59e99))
* provide data migration tools for whitecloud  link [#4](https://github.com/huoshen80/ReinaManager/issues/4) ([523c71a](https://github.com/huoshen80/ReinaManager/commit/523c71a3fdaaf78855f6dca0638a414021781a84))



## [0.6.6-pre1](https://github.com/huoshen80/ReinaManager/compare/v0.6.5...v0.6.6-pre1) (2025-08-25)

<details>
<summary>查看中文版本</summary>

### Bug 修复

* 修复右键菜单位置 [#9](https://github.com/huoshen80/ReinaManager/issues/9) ([9b8e94a](https://github.com/huoshen80/ReinaManager/commit/9b8e94a03fe6935656df80e3cfb383e47520c114))

### 新功能

* 添加更新检查，添加更新通知 UI，改进构建和发布流程 ([315407f](https://github.com/huoshen80/ReinaManager/commit/315407fa08937e715900c555ced822955580e2b7))
* 添加 NSFW 过滤器和 NSFW 替换封面 [#6](https://github.com/huoshen80/ReinaManager/issues/6) ([fe9c8d5](https://github.com/huoshen80/ReinaManager/commit/fe9c8d5f33be367d394bd905bc4506fa4aea7e3e))
* 工作进行中：添加更新器插件并实现更新检查功能 ([a4ccbca](https://github.com/huoshen80/ReinaManager/commit/a4ccbca90091601ac866addc52351a92abbae2c2))

</details>


### Bug Fixes

* location of the right-click menu [#9](https://github.com/huoshen80/ReinaManager/issues/9) ([9b8e94a](https://github.com/huoshen80/ReinaManager/commit/9b8e94a03fe6935656df80e3cfb383e47520c114))


### Features

* add update checking,add UI for update notifications,improve build and release process ([315407f](https://github.com/huoshen80/ReinaManager/commit/315407fa08937e715900c555ced822955580e2b7))
* add NSFW filter and NSFW replace cover [#6](https://github.com/huoshen80/ReinaManager/issues/6) ([fe9c8d5](https://github.com/huoshen80/ReinaManager/commit/fe9c8d5f33be367d394bd905bc4506fa4aea7e3e))
* WIP add updater plugin and implement update checking functionality ([a4ccbca](https://github.com/huoshen80/ReinaManager/commit/a4ccbca90091601ac866addc52351a92abbae2c2))



## [0.6.5](https://github.com/huoshen80/ReinaManager/compare/v0.6.4...v0.6.5) (2025-08-21)

<details>
<summary>查看中文版本</summary>

### Bug 修复

* v0.6.5 修复添加游戏检测功能逻辑并关闭自动数据库迁移 ([f5b310e](https://github.com/huoshen80/ReinaManager/commit/f5b310ed6e37571ebfd2785e881fe02cb9c95036))

</details>

### Bug Fixes

* v0.6.5 fix the added game detection function logic and turned off automatic database migration ([f5b310e](https://github.com/huoshen80/ReinaManager/commit/f5b310ed6e37571ebfd2785e881fe02cb9c95036))



## [0.6.4](https://github.com/huoshen80/ReinaManager/compare/v0.6.3...v0.6.4) (2025-08-19)

<details>
<summary>查看中文版本</summary>

### Bug 修复

* v0.6.4 修复信息框的一些 Bug，添加 API 错误提醒的国际化支持 ([7cbec41](https://github.com/huoshen80/ReinaManager/commit/7cbec41772dad85b88db25e6f5dd48fee39f2cdd))

</details>

### Bug Fixes

* v0.6.4 fix some bugs of infobox,add api error alert i18n support ([7cbec41](https://github.com/huoshen80/ReinaManager/commit/7cbec41772dad85b88db25e6f5dd48fee39f2cdd))
