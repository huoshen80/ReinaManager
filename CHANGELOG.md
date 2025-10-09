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
