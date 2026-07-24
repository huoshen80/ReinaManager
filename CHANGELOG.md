## [0.26.0](https://github.com/huoshen80/ReinaManager/compare/v0.25.0...v0.26.0) (2026-07-24)

<details>
<summary>查看中文版本</summary>

### ✨ 新功能

- *(add-modal)* 支持按 Enter 键提交 ([a946114](https://github.com/huoshen80/ReinaManager/commit/a9461147cd2c5f2f7dedb141398c80dfb1c37925))
- *(collection)* 增强收藏浏览体验 ([6120a80](https://github.com/huoshen80/ReinaManager/commit/6120a80b257edc895903f41c4c2f84ff6392f34c))

### 🐛 Bug 修复

- *(ui)* 在输入法合成期间忽略 Enter 键 ([72b8ca2](https://github.com/huoshen80/ReinaManager/commit/72b8ca255d6e874539a6bfe71029a369debf6c0a))
- *(db)* 恢复游戏设置默认值 ([c23e713](https://github.com/huoshen80/ReinaManager/commit/c23e7130370f18e4d0d30769feb98d5f9d3977e0))
- *(bgm)* 将 total_cont 替换为 total_count ([f333802](https://github.com/huoshen80/ReinaManager/commit/f333802a991a2757a2bb7239722daef36eea9637))
- *(stats)* 确保事件监听器初始化 ([f32dd4c](https://github.com/huoshen80/ReinaManager/commit/f32dd4ca88bbfa2932a2a465e5add2eeb2ba7293))

### 🚀 性能优化

- 减少应用依赖体积 ([3953aad](https://github.com/huoshen80/ReinaManager/commit/3953aad055e40443f8f9d05593cdf326594e21e8))

### 🚜 重构

- *(metadata)* 为外部 API 响应声明类型 ([28dd4c9](https://github.com/huoshen80/ReinaManager/commit/28dd4c970848d2a785668d6aac82a40178ea7959))
- *(collection)* 同置页面内部逻辑 ([3dfab43](https://github.com/huoshen80/ReinaManager/commit/3dfab432e28d135a937c597e8728f46ebb9b1293))
- *(hooks)* 对齐所有权边界 ([1e47397](https://github.com/huoshen80/ReinaManager/commit/1e47397228f858808fadbce7dc146cff6e853248))
- *(home)* 拆分仪表盘模块 ([de50892](https://github.com/huoshen80/ReinaManager/commit/de5089237d56edc4b9bc885d85d5fc6f04c459d4))
- *(detail)* 拆分统计与封面模块 ([9654e05](https://github.com/huoshen80/ReinaManager/commit/9654e05d85e2c48e5ffbb4e9eb39b5ff3ba73a10))
- *(settings)* 同置 BGM 认证控制器 ([d514119](https://github.com/huoshen80/ReinaManager/commit/d5141195488b073e6ec998db94a8e806acca8d9d))
- *(detail)* 分组页面功能模块 ([a6fbe9c](https://github.com/huoshen80/ReinaManager/commit/a6fbe9c1f36364f40a31c3a695d9377c2031820d))

</details>

### ✨ Features

- *(add-modal)* Submit with Enter key ([a946114](https://github.com/huoshen80/ReinaManager/commit/a9461147cd2c5f2f7dedb141398c80dfb1c37925))
- *(collection)* Enhance collection browsing ([6120a80](https://github.com/huoshen80/ReinaManager/commit/6120a80b257edc895903f41c4c2f84ff6392f34c))

### 🐛 Bug Fixes

- *(ui)* Ignore Enter during IME composition ([72b8ca2](https://github.com/huoshen80/ReinaManager/commit/72b8ca255d6e874539a6bfe71029a369debf6c0a))
- *(db)* Restore game setting defaults ([c23e713](https://github.com/huoshen80/ReinaManager/commit/c23e7130370f18e4d0d30769feb98d5f9d3977e0))
- *(bgm)* Replace total_cont with total_count ([f333802](https://github.com/huoshen80/ReinaManager/commit/f333802a991a2757a2bb7239722daef36eea9637))
- *(stats)* Ensure event listeners initialize ([f32dd4c](https://github.com/huoshen80/ReinaManager/commit/f32dd4ca88bbfa2932a2a465e5add2eeb2ba7293))

### 🚀 Performance

- Reduce application dependency footprint ([3953aad](https://github.com/huoshen80/ReinaManager/commit/3953aad055e40443f8f9d05593cdf326594e21e8))

### 🚜 Refactor

- *(metadata)* Type external API responses ([28dd4c9](https://github.com/huoshen80/ReinaManager/commit/28dd4c970848d2a785668d6aac82a40178ea7959))
- *(collection)* Colocate page internals ([3dfab43](https://github.com/huoshen80/ReinaManager/commit/3dfab432e28d135a937c597e8728f46ebb9b1293))
- *(hooks)* Align ownership boundaries ([1e47397](https://github.com/huoshen80/ReinaManager/commit/1e47397228f858808fadbce7dc146cff6e853248))
- *(home)* Split dashboard modules ([de50892](https://github.com/huoshen80/ReinaManager/commit/de5089237d56edc4b9bc885d85d5fc6f04c459d4))
- *(detail)* Separate stats and cover modules ([9654e05](https://github.com/huoshen80/ReinaManager/commit/9654e05d85e2c48e5ffbb4e9eb39b5ff3ba73a10))
- *(settings)* Colocate BGM auth controller ([d514119](https://github.com/huoshen80/ReinaManager/commit/d5141195488b073e6ec998db94a8e806acca8d9d))
- *(detail)* Group page feature modules ([a6fbe9c](https://github.com/huoshen80/ReinaManager/commit/a6fbe9c1f36364f40a31c3a695d9377c2031820d))


## [0.25.0](https://github.com/huoshen80/ReinaManager/compare/v0.24.3...v0.25.0) (2026-07-14)

<details>
<summary>查看中文版本</summary>

### ✨ 新功能

- *(add-modal)* 改进数据源匹配模式 ([d0ab2cc](https://github.com/huoshen80/ReinaManager/commit/d0ab2cc1789652b5460bba00088f029e2596c1c7))
- *(metadata)* 增加 erogamescape 数据源 ([a0a15dc](https://github.com/huoshen80/ReinaManager/commit/a0a15dc11308a4f9a77b47d9beb08a1f5bdff2be))
- *(metadata)* 增加 dlsite 数据源 ([0d72c0d](https://github.com/huoshen80/ReinaManager/commit/0d72c0dc6caa4a76c43f5669c720bad21227b5a6))
- *(localpath)* 统一本地路径解析逻辑 ([18a20b2](https://github.com/huoshen80/ReinaManager/commit/18a20b267c3de9a59ef61bbeeb4b7c13e0be8517))
- *(import)* 增加一级目录扫描模式 ([e08b6b6](https://github.com/huoshen80/ReinaManager/commit/e08b6b67cd13f244b9329fe22658b638bc6a32f2))
- *(home)* 重新设计主页仪表盘体验 ([d6c5fb7](https://github.com/huoshen80/ReinaManager/commit/d6c5fb765349763f0a7739e29011eb5b678a8eab))
- *(import)* 将扫描选项移动至设置 ([d33e4bd](https://github.com/huoshen80/ReinaManager/commit/d33e4bdb6c0adab548e062c3f7f3b67c8a3848a1))
- *(cards)* 在选择模式下显示游戏选中数量 ([d4cbe11](https://github.com/huoshen80/ReinaManager/commit/d4cbe117a9d8d821e5883536fc95e56834ed74e9))
- *(dto)* 递归清理数据源 JSON 数据中的空值 ([9d66cbb](https://github.com/huoshen80/ReinaManager/commit/9d66cbb7403f63b176a802c0377a9f93571e7ea8))

### 🎨 样式

- *(ui)* 重构路径输入框使用内联图标按钮 ([f922450](https://github.com/huoshen80/ReinaManager/commit/f922450c93e58a87952dcdaf9b4a519ffdec56bb))

### 🐛 Bug 修复

- *(readme)* 修复 star 历史图表显示损坏的问题 [skip ci] ([1ca196a](https://github.com/huoshen80/ReinaManager/commit/1ca196a356adf723b102a9e49abc2756aea214e7))
- *(metadata)* 恢复 kungal 数据源 ([5f770fa](https://github.com/huoshen80/ReinaManager/commit/5f770faee03eca408704146fa50923c666fc4d19))
- *(detail)* 限制数据源封面的显示优先级 ([63f6f38](https://github.com/huoshen80/ReinaManager/commit/63f6f385eaba9ccd91d64a88e5ef886c20bc66e6))
- *(metadata)* 移除爬取数据源的 User-Agent 限制 ([956dc72](https://github.com/huoshen80/ReinaManager/commit/956dc727382862491fac7c786be726405c64cdf7))
- *(game)* 在添加元数据时保留原路径 ([1eb741a](https://github.com/huoshen80/ReinaManager/commit/1eb741af97e61f53045f238c01def450bbf9d95e))
- *(fs)* 直接打开解析后的游戏目录 ([f75d88d](https://github.com/huoshen80/ReinaManager/commit/f75d88d41455c48e5199ef7e92f58733bf7c7800))
- *(metadata)* 在批量导入时解析 DLsite ID ([b6edc91](https://github.com/huoshen80/ReinaManager/commit/b6edc91a1e2f726b05a3a44caa81c01740b04367))
- *(launch)* 分离路径同步与游戏启动逻辑 ([0af4ef3](https://github.com/huoshen80/ReinaManager/commit/0af4ef3d0777473ce2a82d8324517de3b11006b5))
- *(scan)* 优先扫描中文可执行文件 ([00e59fc](https://github.com/huoshen80/ReinaManager/commit/00e59fc5dc345b7ad80b26f28d3730e964858a61))
- *(sort)* 修正最后游玩时间的排序 ([e15ee83](https://github.com/huoshen80/ReinaManager/commit/e15ee83cca9982879e86ef3377e8240c16360380))
- *(db)* 增强数据源表迁移逻辑 ([7f5f075](https://github.com/huoshen80/ReinaManager/commit/7f5f0759680cd1031ae4f836699126ddc0d9d32d))
- *(metadata)* 保留失败的数据源信息 ([eb655fe](https://github.com/huoshen80/ReinaManager/commit/eb655fef7a2b30c2688c021fb235c722dc2ff742))
- *(import)* 根据平台拼接可执行文件路径 ([680526e](https://github.com/huoshen80/ReinaManager/commit/680526ee164d42177267d02f81ddb28f785bc892))
- *(monitor)* 处理前台 PID 转换问题 ([be7bb72](https://github.com/huoshen80/ReinaManager/commit/be7bb721f35b42544f50d61d61cf3b04fc2482bf))
- *(migration)* 回退使用默认的备份目录 ([d7d82b1](https://github.com/huoshen80/ReinaManager/commit/d7d82b15fbd10d1660a58373236f408098a31918))
- *(add-modal)* 同步批量导入设置 ([91c2468](https://github.com/huoshen80/ReinaManager/commit/91c246871da947363ee5949ee86d530494f9a8d9))
- *(home)* 防止主页焦点卡片内容溢出 ([5a4d170](https://github.com/huoshen80/ReinaManager/commit/5a4d1705848cc688231079e2ed2a996b06450b05))

### 📚 文档

- 更新部分文档内容 ([2cae39c](https://github.com/huoshen80/ReinaManager/commit/2cae39cc639c7e035636b2b233ed8b3a2f61e42f))
- *(settings)* 澄清混合数据源相关的限制说明 ([01c7002](https://github.com/huoshen80/ReinaManager/commit/01c70023754481d70c525e4df6b830e435bbc172))

### 🚀 性能优化

- *(metadata)* 避免重复进行数据源 ID 扫描 ([7669438](https://github.com/huoshen80/ReinaManager/commit/76694386c48e82932ddb118a524a9b49724fea21))
- *(scan)* 使用路径字典树过滤重复导入 ([781980f](https://github.com/huoshen80/ReinaManager/commit/781980ff50181d0ea2a85c9f7e0ce93fe6dde979))
- *(fs)* 限制已删除路径的检查频率 ([08b7bfe](https://github.com/huoshen80/ReinaManager/commit/08b7bfef19196965d70b5b74cfba9b9e58d9d6d3))

### 🚜 重构

- 将游戏数据源修改为本地数据源模型 (#66) ([dd6bf12](https://github.com/huoshen80/ReinaManager/commit/dd6bf12bef0257e0ce8c57482a042a94ee210f55))
- *(fs)* 将本地路径检查移至后端处理 ([2f73322](https://github.com/huoshen80/ReinaManager/commit/2f733226a14404add063348222ff6dbf1492c6b9))
- *(game)* 统一启动路径的处理逻辑 ([6c3592f](https://github.com/huoshen80/ReinaManager/commit/6c3592f3aa1d6179aa6f311d808280c4215ae3f5))
- *(game)* 使用原生的启动路径选择器 ([a68f6e9](https://github.com/huoshen80/ReinaManager/commit/a68f6e91c7ab280ecc0f30b374482f2c7b008c36))
- *(datetime)* 集中管理日期相关标签 ([b11ae72](https://github.com/huoshen80/ReinaManager/commit/b11ae729761d3a64a793f45edc43542a453d0e98))
- *(games)* 拆分启动路径相关字段 ([c84fdd4](https://github.com/huoshen80/ReinaManager/commit/c84fdd4e6f033d5b74e5847772e446a193b87d73))
- *(settings)* 简化默认路径选择器 ([e76569b](https://github.com/huoshen80/ReinaManager/commit/e76569bc6188dca6dc011bfe38f861d098d3e52b))
- *(home)* 简化主页仪表盘布局 ([223d109](https://github.com/huoshen80/ReinaManager/commit/223d109f6f14584fd85e62f5725ceedc7ff86587))

</details>

### ✨ Features

- *(add-modal)* Refine source match modes ([d0ab2cc](https://github.com/huoshen80/ReinaManager/commit/d0ab2cc1789652b5460bba00088f029e2596c1c7))
- *(metadata)* Add erogamescape source ([a0a15dc](https://github.com/huoshen80/ReinaManager/commit/a0a15dc11308a4f9a77b47d9beb08a1f5bdff2be))
- *(metadata)* Add dlsite source ([0d72c0d](https://github.com/huoshen80/ReinaManager/commit/0d72c0dc6caa4a76c43f5669c720bad21227b5a6))
- *(localpath)* Centralize local path resolution ([18a20b2](https://github.com/huoshen80/ReinaManager/commit/18a20b267c3de9a59ef61bbeeb4b7c13e0be8517))
- *(import)* Add first-level directory scan ([e08b6b6](https://github.com/huoshen80/ReinaManager/commit/e08b6b67cd13f244b9329fe22658b638bc6a32f2))
- *(home)* Redesign dashboard experience ([d6c5fb7](https://github.com/huoshen80/ReinaManager/commit/d6c5fb765349763f0a7739e29011eb5b678a8eab))
- *(import)* Move scan options to settings ([d33e4bd](https://github.com/huoshen80/ReinaManager/commit/d33e4bdb6c0adab548e062c3f7f3b67c8a3848a1))
- *(cards)* Show game selection counts ([d4cbe11](https://github.com/huoshen80/ReinaManager/commit/d4cbe117a9d8d821e5883536fc95e56834ed74e9))
- *(dto)* Clean empty values from source JSON data recursively ([9d66cbb](https://github.com/huoshen80/ReinaManager/commit/9d66cbb7403f63b176a802c0377a9f93571e7ea8))

### 🎨 Styling

- *(ui)* Refactor path input to use inline icon buttons ([f922450](https://github.com/huoshen80/ReinaManager/commit/f922450c93e58a87952dcdaf9b4a519ffdec56bb))

### 🐛 Bug Fixes

- *(readme)* Fix broken star history chart display [skip ci] ([1ca196a](https://github.com/huoshen80/ReinaManager/commit/1ca196a356adf723b102a9e49abc2756aea214e7))
- *(metadata)* Restore kungal source ([5f770fa](https://github.com/huoshen80/ReinaManager/commit/5f770faee03eca408704146fa50923c666fc4d19))
- *(detail)* Limit source cover priority display ([63f6f38](https://github.com/huoshen80/ReinaManager/commit/63f6f385eaba9ccd91d64a88e5ef886c20bc66e6))
- *(metadata)* Omit ua for scraped sources ([956dc72](https://github.com/huoshen80/ReinaManager/commit/956dc727382862491fac7c786be726405c64cdf7))
- *(game)* Preserve path during metadata add ([1eb741a](https://github.com/huoshen80/ReinaManager/commit/1eb741af97e61f53045f238c01def450bbf9d95e))
- *(fs)* Open resolved game directory directly ([f75d88d](https://github.com/huoshen80/ReinaManager/commit/f75d88d41455c48e5199ef7e92f58733bf7c7800))
- *(metadata)* Resolve DLsite IDs in bulk import ([b6edc91](https://github.com/huoshen80/ReinaManager/commit/b6edc91a1e2f726b05a3a44caa81c01740b04367))
- *(launch)* Separate path sync from game start ([0af4ef3](https://github.com/huoshen80/ReinaManager/commit/0af4ef3d0777473ce2a82d8324517de3b11006b5))
- *(scan)* Prioritize cn executables ([00e59fc](https://github.com/huoshen80/ReinaManager/commit/00e59fc5dc345b7ad80b26f28d3730e964858a61))
- *(sort)* Align last played time order ([e15ee83](https://github.com/huoshen80/ReinaManager/commit/e15ee83cca9982879e86ef3377e8240c16360380))
- *(db)* Harden source table migration ([7f5f075](https://github.com/huoshen80/ReinaManager/commit/7f5f0759680cd1031ae4f836699126ddc0d9d32d))
- *(metadata)* Preserve failed source data ([eb655fe](https://github.com/huoshen80/ReinaManager/commit/eb655fef7a2b30c2688c021fb235c722dc2ff742))
- *(import)* Join executable paths by platform ([680526e](https://github.com/huoshen80/ReinaManager/commit/680526ee164d42177267d02f81ddb28f785bc892))
- *(monitor)* Handle foreground PID transitions ([be7bb72](https://github.com/huoshen80/ReinaManager/commit/be7bb721f35b42544f50d61d61cf3b04fc2482bf))
- *(migration)* Fallback to default backup dir ([d7d82b1](https://github.com/huoshen80/ReinaManager/commit/d7d82b15fbd10d1660a58373236f408098a31918))
- *(add-modal)* Sync bulk import settings ([91c2468](https://github.com/huoshen80/ReinaManager/commit/91c246871da947363ee5949ee86d530494f9a8d9))
- *(home)* Prevent focus card overflow ([5a4d170](https://github.com/huoshen80/ReinaManager/commit/5a4d1705848cc688231079e2ed2a996b06450b05))

### 📚 Documentation

- Update some docs ([2cae39c](https://github.com/huoshen80/ReinaManager/commit/2cae39cc639c7e035636b2b233ed8b3a2f61e42f))
- *(settings)* Clarify mixed source limits ([01c7002](https://github.com/huoshen80/ReinaManager/commit/01c70023754481d70c525e4df6b830e435bbc172))

### 🚀 Performance

- *(metadata)* Avoid repeated source id scans ([7669438](https://github.com/huoshen80/ReinaManager/commit/76694386c48e82932ddb118a524a9b49724fea21))
- *(scan)* Deduplicate imports with path trie ([781980f](https://github.com/huoshen80/ReinaManager/commit/781980ff50181d0ea2a85c9f7e0ce93fe6dde979))
- *(fs)* Bound dropped path inspection ([08b7bfe](https://github.com/huoshen80/ReinaManager/commit/08b7bfef19196965d70b5b74cfba9b9e58d9d6d3))

### 🚜 Refactor

- Game metadata sources to source-native model (#66) ([dd6bf12](https://github.com/huoshen80/ReinaManager/commit/dd6bf12bef0257e0ce8c57482a042a94ee210f55))
- *(fs)* Move local path checks to backend ([2f73322](https://github.com/huoshen80/ReinaManager/commit/2f733226a14404add063348222ff6dbf1492c6b9))
- *(game)* Unify launch path handling ([6c3592f](https://github.com/huoshen80/ReinaManager/commit/6c3592f3aa1d6179aa6f311d808280c4215ae3f5))
- *(game)* Use native launch path picker ([a68f6e9](https://github.com/huoshen80/ReinaManager/commit/a68f6e91c7ab280ecc0f30b374482f2c7b008c36))
- *(datetime)* Centralize date labels ([b11ae72](https://github.com/huoshen80/ReinaManager/commit/b11ae729761d3a64a793f45edc43542a453d0e98))
- *(games)* Split launch path fields ([c84fdd4](https://github.com/huoshen80/ReinaManager/commit/c84fdd4e6f033d5b74e5847772e446a193b87d73))
- *(settings)* Simplify path picker default ([e76569b](https://github.com/huoshen80/ReinaManager/commit/e76569bc6188dca6dc011bfe38f861d098d3e52b))
- *(home)* Simplify dashboard layout ([223d109](https://github.com/huoshen80/ReinaManager/commit/223d109f6f14584fd85e62f5725ceedc7ff86587))


## [0.24.3](https://github.com/huoshen80/ReinaManager/compare/v0.24.1...v0.24.3) (2026-07-07)

<details>
<summary>查看中文版本</summary>

### ◀️ 回退

- *(ci)* 恢复 tauri action v0 [skip ci] ([2d8bf4e](https://github.com/huoshen80/ReinaManager/commit/2d8bf4e33e02eaf1aea131020d65e68d26ec61c4))

### ✨ 新功能

- *(stats)* 改进会话追踪与数据库完整性 (#65) ([ea9169b](https://github.com/huoshen80/ReinaManager/commit/ea9169b0fcb58dffe7dc87a024208afb717a09df))
- *(settings)* 添加启动页偏好设置 ([45716ee](https://github.com/huoshen80/ReinaManager/commit/45716ee9bc71e4c5194daa5cd7db3f4d632be85d))
- *(metadata)* 暂时在所有搜索和更新链路中禁用 Kungal 数据源 ([7d3754b](https://github.com/huoshen80/ReinaManager/commit/7d3754be307a22458098f0ce70f6b2648754cece))

### 🐛 Bug 修复

- *(stats)* 改进图表时间的易读性 ([99272ea](https://github.com/huoshen80/ReinaManager/commit/99272ea6f28fdb55f891e234125984317a767d69))
- *(kun)* 读取蛇形命名 API 字段 ([cfbbc50](https://github.com/huoshen80/ReinaManager/commit/cfbbc50a74e2ad2788558f916e67d86c460a56cc))
- *(stats)* 防止图表最右侧数据点及标签被截断 ([479e34f](https://github.com/huoshen80/ReinaManager/commit/479e34fb6e182917eddb22ff74ba69e0e694ea3c))

### 🚜 重构

- *(store)* 直接使用注册表的默认值 ([b0cde0d](https://github.com/huoshen80/ReinaManager/commit/b0cde0d1da0a1ab73c153bd66cab457931594db4))

</details>

### ◀️ Revert

- *(ci)* Restore tauri action v0 [skip ci] ([2d8bf4e](https://github.com/huoshen80/ReinaManager/commit/2d8bf4e33e02eaf1aea131020d65e68d26ec61c4))

### ✨ Features

- *(stats)* Improve session tracking and database integrity (#65) ([ea9169b](https://github.com/huoshen80/ReinaManager/commit/ea9169b0fcb58dffe7dc87a024208afb717a09df))
- *(settings)* Add startup page preference ([45716ee](https://github.com/huoshen80/ReinaManager/commit/45716ee9bc71e4c5194daa5cd7db3f4d632be85d))
- *(metadata)* Temporarily ban kungal data source from all search and update workflows ([7d3754b](https://github.com/huoshen80/ReinaManager/commit/7d3754be307a22458098f0ce70f6b2648754cece))

### 🐛 Bug Fixes

- *(stats)* Improve chart time readability ([99272ea](https://github.com/huoshen80/ReinaManager/commit/99272ea6f28fdb55f891e234125984317a767d69))
- *(kun)* Read snake case API fields ([cfbbc50](https://github.com/huoshen80/ReinaManager/commit/cfbbc50a74e2ad2788558f916e67d86c460a56cc))
- *(stats)* Prevent rightmost chart point and label from clipping ([479e34f](https://github.com/huoshen80/ReinaManager/commit/479e34fb6e182917eddb22ff74ba69e0e694ea3c))

### 🚜 Refactor

- *(store)* Use registry defaults directly ([b0cde0d](https://github.com/huoshen80/ReinaManager/commit/b0cde0d1da0a1ab73c153bd66cab457931594db4))


## [0.24.1](https://github.com/huoshen80/ReinaManager/compare/v0.24.0...v0.24.1) (2026-06-30)

<details>
<summary>查看中文版本</summary>

### ⚙️ 杂类任务

- 更新 GitHub Actions 版本 ([bcada64](https://github.com/huoshen80/ReinaManager/commit/bcada64a888f41e8188a7c6663d75e5f87ea8ad0))

### ✨ 新功能

- *(detail)* 添加游玩会话时间线 ([c1e7a30](https://github.com/huoshen80/ReinaManager/commit/c1e7a30b215be14fd3515e0bdf02b71ed3a5c5b2))

### 🎨 样式

- *(filter)* 移除模态框分隔线 ([cfff838](https://github.com/huoshen80/ReinaManager/commit/cfff838ed2d31d902b78ff999482725794c5d87b))

### 🐛 Bug 修复

- *(scan)* 将默认批量扫描深度提高到 3，并在深度变化时重新扫描 (#63) ([39a6ac0](https://github.com/huoshen80/ReinaManager/commit/39a6ac06ec2611957d1309810d57775c30ec419f))
- *(detail)* 隐藏不可用的游戏指标 ([fd507e3](https://github.com/huoshen80/ReinaManager/commit/fd507e3ccc84eca066b73671315613fb5407918d))
- *(i18n)* 使源默认文本与本地化翻译保持一致 ([f53fca6](https://github.com/huoshen80/ReinaManager/commit/f53fca626f56e3c6714e6d0ee1493326f07be63c))

### 🚜 重构

- *(detail)* 明确详情面板命名 ([1237336](https://github.com/huoshen80/ReinaManager/commit/1237336c3a27bbcff4cdf6e7c6a8766a165bf166))

</details>

### ⚙️ Miscellaneous Tasks

- Update GitHub Actions versions ([bcada64](https://github.com/huoshen80/ReinaManager/commit/bcada64a888f41e8188a7c6663d75e5f87ea8ad0))

### ✨ Features

- *(detail)* Add play session timeline ([c1e7a30](https://github.com/huoshen80/ReinaManager/commit/c1e7a30b215be14fd3515e0bdf02b71ed3a5c5b2))

### 🎨 Styling

- *(filter)* Remove modal divider borders ([cfff838](https://github.com/huoshen80/ReinaManager/commit/cfff838ed2d31d902b78ff999482725794c5d87b))

### 🐛 Bug Fixes

- *(scan)* Raise default bulk scan depth to 3 and rescan on depth change (#63) ([39a6ac0](https://github.com/huoshen80/ReinaManager/commit/39a6ac06ec2611957d1309810d57775c30ec419f))
- *(detail)* Hide unavailable game metrics ([fd507e3](https://github.com/huoshen80/ReinaManager/commit/fd507e3ccc84eca066b73671315613fb5407918d))
- *(i18n)* Align source defaults with locales ([f53fca6](https://github.com/huoshen80/ReinaManager/commit/f53fca626f56e3c6714e6d0ee1493326f07be63c))

### 🚜 Refactor

- *(detail)* Clarify detail panel names ([1237336](https://github.com/huoshen80/ReinaManager/commit/1237336c3a27bbcff4cdf6e7c6a8766a165bf166))


## [0.24.0](https://github.com/huoshen80/ReinaManager/compare/v0.23.2...v0.24.0) (2026-06-25)

<details>
<summary>查看中文版本</summary>

### ✨ 新功能

- *(detail)* 添加个人评测和评分 ([33ebfeb](https://github.com/huoshen80/ReinaManager/commit/33ebfebafdc8463e1ca669c322d1cba5573d99e8))
- *(cards)* 在封面显示选中的排序值 ([ccb0c1e](https://github.com/huoshen80/ReinaManager/commit/ccb0c1ef9da242c7f421d1ca4561950b52e32587))
- *(cards)* 在封面显示来源排序值 ([bccbf61](https://github.com/huoshen80/ReinaManager/commit/bccbf61f6d2362b89d7d6b00643599d242ea32ac))

### 🐛 Bug 修复

- *(games)* 让缺失发售日期的项目排在最后 ([04d2a1d](https://github.com/huoshen80/ReinaManager/commit/04d2a1dcbc5ebedf744e1d92477054414e1b0d27))
- *(games)* 遵循最近游玩排序顺序 ([d0e3c28](https://github.com/huoshen80/ReinaManager/commit/d0e3c28eb6105629620108a38ca635a4abe210a8))
- *(games)* 按评分排序 BGM 条目 ([1a2f78d](https://github.com/huoshen80/ReinaManager/commit/1a2f78dc426630aa41d971258e5eb8cb26841168))

### 🚀 性能

- *(metadata)* 限制默认搜索结果数量 ([475a1c0](https://github.com/huoshen80/ReinaManager/commit/475a1c047977de8e2754b191c7c8f0bc4e02d31a))

</details>

### ✨ Features

- *(detail)* Add personal reviews and ratings ([33ebfeb](https://github.com/huoshen80/ReinaManager/commit/33ebfebafdc8463e1ca669c322d1cba5573d99e8))
- *(cards)* Show selected sort value on covers ([ccb0c1e](https://github.com/huoshen80/ReinaManager/commit/ccb0c1ef9da242c7f421d1ca4561950b52e32587))
- *(cards)* Show source sort values on covers ([bccbf61](https://github.com/huoshen80/ReinaManager/commit/bccbf61f6d2362b89d7d6b00643599d242ea32ac))

### 🐛 Bug Fixes

- *(games)* Keep missing release dates last ([04d2a1d](https://github.com/huoshen80/ReinaManager/commit/04d2a1dcbc5ebedf744e1d92477054414e1b0d27))
- *(games)* Respect last played sort order ([d0e3c28](https://github.com/huoshen80/ReinaManager/commit/d0e3c28eb6105629620108a38ca635a4abe210a8))
- *(games)* Rank BGM entries by score ([1a2f78d](https://github.com/huoshen80/ReinaManager/commit/1a2f78dc426630aa41d971258e5eb8cb26841168))

### 🚀 Performance

- *(metadata)* Limit default search results ([475a1c0](https://github.com/huoshen80/ReinaManager/commit/475a1c047977de8e2754b191c7c8f0bc4e02d31a))


## [0.23.2](https://github.com/huoshen80/ReinaManager/compare/v0.23.1...v0.23.2) (2026-06-22)

<details>
<summary>查看中文版本</summary>

### ✨ 新功能

- *(detail)* 添加名称搜索模式，简化来源元数据更新 ([695695f](https://github.com/huoshen80/ReinaManager/commit/695695f557d8acc8bf6dc0730c611e3aceb1b21d))

### 🐛 Bug 修复

- *(ui)* 抑制对话框焦点轮廓 ([c8e7a34](https://github.com/huoshen80/ReinaManager/commit/c8e7a34a830df49df4e8cff1895a8f8fa087292f))
- *(add-modal)* 分离批量操作页脚 ([8fe25fa](https://github.com/huoshen80/ReinaManager/commit/8fe25fa6a2f50dd9ca29eeef18b42d6a366b6659))

### 🚜 重构

- *(metadata)* 从适配器派生来源 UI ([521d6c0](https://github.com/huoshen80/ReinaManager/commit/521d6c0546f10e10d8bb41d66afe06cae4088610))

</details>

### ✨ Features

- *(detail)* Add name search mode to streamline source metadata updates ([695695f](https://github.com/huoshen80/ReinaManager/commit/695695f557d8acc8bf6dc0730c611e3aceb1b21d))

### 🐛 Bug Fixes

- *(ui)* Suppress dialog focus outline ([c8e7a34](https://github.com/huoshen80/ReinaManager/commit/c8e7a34a830df49df4e8cff1895a8f8fa087292f))
- *(add-modal)* Separate bulk action footer ([8fe25fa](https://github.com/huoshen80/ReinaManager/commit/8fe25fa6a2f50dd9ca29eeef18b42d6a366b6659))

### 🚜 Refactor

- *(metadata)* Derive source UI from adapters ([521d6c0](https://github.com/huoshen80/ReinaManager/commit/521d6c0546f10e10d8bb41d66afe06cae4088610))


## [0.23.1](https://github.com/huoshen80/ReinaManager/compare/v0.23.0...v0.23.1) (2026-06-20)

<details>
<summary>查看中文版本</summary>

- 移除静态元素上的悬停效果，恢复一些之前的样式([a8c7392](https://github.com/huoshen80/ReinaManager/commit/096cec249c3f0c668d178856778923cf90f5c426)）

</details>

- remove the hover effect on static elements,restore some of the previous style([a8c7392](https://github.com/huoshen80/ReinaManager/commit/096cec249c3f0c668d178856778923cf90f5c426)）

## [0.23.0](https://github.com/huoshen80/ReinaManager/compare/v0.22.1...v0.23.0) (2026-06-19)

<details>
<summary>查看中文版本</summary>

### ✨ 新功能

- *(updater)* 为静默更新检查失败添加 snackbar 警告 ([a8c7392](https://github.com/huoshen80/ReinaManager/commit/a8c7392de205f95a4c128c75962e63d5e9d73fa3))
- 添加代理设置并让 BGM token 变为可选 (#60) ([43206c2](https://github.com/huoshen80/ReinaManager/commit/43206c2c9f41d7b1001ba5609d4cd7178df6527b))
- *(image)* 添加图片代理协议和工具函数 ([1209c57](https://github.com/huoshen80/ReinaManager/commit/1209c5779c9fa91562b9490f878445e71e000dad))
- *(ui)* 将图片代理接入组件 ([1ec73ec](https://github.com/huoshen80/ReinaManager/commit/1ec73ec06baf7fdcdbd2e682c6dfb70763bbff31))
- *(theme)* 全局 MUI 样式、滚动条和头像修复 ([153e8ee](https://github.com/huoshen80/ReinaManager/commit/153e8ee16d49d2fc7910d794634c5f354aa4a69e))

### 🐛 Bug 修复

- 改进错误处理和异步初始化 ([4033782](https://github.com/huoshen80/ReinaManager/commit/4033782718234c578feeb80e787d683a15d8f374))
- *(ui)* 修复 DetailPage chip 抖动和悬停可见性 ([1bc6362](https://github.com/huoshen80/ReinaManager/commit/1bc6362076d43e86691146ed602c56f124006aa1))
- *(metadata)* 允许匿名 BGM 混合更新 ([4513b6b](https://github.com/huoshen80/ReinaManager/commit/4513b6b65427f2411ae7471514aa2a6de9d6936e))

### 📚 文档

- 更新文档中的文件路径 [skip ci] ([4d1d744](https://github.com/huoshen80/ReinaManager/commit/4d1d744ab41498279e80f80e60009dfba98e60c0))

### 🚜 重构

- 集中管理 noResultsMessage，并使用 settingsService 处理代理 ([a4c457f](https://github.com/huoshen80/ReinaManager/commit/a4c457f02abe55ed626b2644fdf68505963a6931))
- 引入 SettingsGroup/SettingsItem 布局组件，并为文本字段添加自动保存 ([0af8551](https://github.com/huoshen80/ReinaManager/commit/0af855170fcdbb92cbef1f5109d38549dc8a0b37))
- 重组项目文件结构 ([d168379](https://github.com/huoshen80/ReinaManager/commit/d16837992a9ab405998feac6b969d96843e7ab1b))
- *(backend)* 重组 utils 和 game 模块 ([1809849](https://github.com/huoshen80/ReinaManager/commit/180984954d378af036ae2a0c7bb34fd687d20211))
- *(ui)* 重新设计设置布局和路径输入 ([ee9a1a0](https://github.com/huoshen80/ReinaManager/commit/ee9a1a0591f0bcab0c06da8f737ddafe38a12b0d))
- *(ui)* 用渐变遮罩和排版重新设计游戏卡片 UI ([6db71fb](https://github.com/huoshen80/ReinaManager/commit/6db71fb78e73fa0b5bccfc508df07480723dee3f))

</details>

### ✨ Features

- *(updater)* Add snackbar warning for silent update check failure ([a8c7392](https://github.com/huoshen80/ReinaManager/commit/a8c7392de205f95a4c128c75962e63d5e9d73fa3))
- Add proxy settings and make BGM token optional (#60) ([43206c2](https://github.com/huoshen80/ReinaManager/commit/43206c2c9f41d7b1001ba5609d4cd7178df6527b))
- *(image)* Add image proxy protocol and utilities ([1209c57](https://github.com/huoshen80/ReinaManager/commit/1209c5779c9fa91562b9490f878445e71e000dad))
- *(ui)* Integrate image proxy into components ([1ec73ec](https://github.com/huoshen80/ReinaManager/commit/1ec73ec06baf7fdcdbd2e682c6dfb70763bbff31))
- *(theme)* Global MUI styling, scrollbars, and avatar fixes ([153e8ee](https://github.com/huoshen80/ReinaManager/commit/153e8ee16d49d2fc7910d794634c5f354aa4a69e))

### 🐛 Bug Fixes

- Improve error handling and async initialization ([4033782](https://github.com/huoshen80/ReinaManager/commit/4033782718234c578feeb80e787d683a15d8f374))
- *(ui)* Resolve DetailPage chip jitter and hover visibility ([1bc6362](https://github.com/huoshen80/ReinaManager/commit/1bc6362076d43e86691146ed602c56f124006aa1))
- *(metadata)* Allow anonymous BGM mixed updates ([4513b6b](https://github.com/huoshen80/ReinaManager/commit/4513b6b65427f2411ae7471514aa2a6de9d6936e))

### 📚 Documentation

- Update file paths in documentation [skip ci] ([4d1d744](https://github.com/huoshen80/ReinaManager/commit/4d1d744ab41498279e80f80e60009dfba98e60c0))

### 🚜 Refactor

- Centralize noResultsMessage and use settingsService for proxy ([a4c457f](https://github.com/huoshen80/ReinaManager/commit/a4c457f02abe55ed626b2644fdf68505963a6931))
- Introduce SettingsGroup/SettingsItem layout components and auto-save for text fields ([0af8551](https://github.com/huoshen80/ReinaManager/commit/0af855170fcdbb92cbef1f5109d38549dc8a0b37))
- Reorganize project file structure ([d168379](https://github.com/huoshen80/ReinaManager/commit/d16837992a9ab405998feac6b969d96843e7ab1b))
- *(backend)* Reorganize utils and game modules ([1809849](https://github.com/huoshen80/ReinaManager/commit/180984954d378af036ae2a0c7bb34fd687d20211))
- *(ui)* Redesign settings layout and path inputs ([ee9a1a0](https://github.com/huoshen80/ReinaManager/commit/ee9a1a0591f0bcab0c06da8f737ddafe38a12b0d))
- *(ui)* Redesign game card UI with gradient overlay and typography ([6db71fb](https://github.com/huoshen80/ReinaManager/commit/6db71fb78e73fa0b5bccfc508df07480723dee3f))


## [0.22.1](https://github.com/huoshen80/ReinaManager/compare/v0.22.0...v0.22.1) (2026-06-08)

<details>
<summary>查看中文版本</summary>

### 🐛 Bug 修复

- *(cover)* 添加缓存代数，防止过期下载写入 ([a58561a](https://github.com/huoshen80/ReinaManager/commit/a58561aa1f2fff8e0e79b0cdf92e1b5546796c47))

</details>

### 🐛 Bug Fixes

- *(cover)* Add cache generation to prevent stale download writes ([a58561a](https://github.com/huoshen80/ReinaManager/commit/a58561aa1f2fff8e0e79b0cdf92e1b5546796c47))


## [0.22.0](https://github.com/huoshen80/ReinaManager/compare/v0.21.7...v0.22.0) (2026-06-07)

<details>
<summary>查看中文版本</summary>

### ✨ 新功能

- *(backup)* 添加退出时自动备份及保留策略 ([1cdabfb](https://github.com/huoshen80/ReinaManager/commit/1cdabfbbb87c334a2d52731ad1568086e9c3329e))
- *(cover)* 为混合数据源游戏添加封面源选择 ([caa20fe](https://github.com/huoshen80/ReinaManager/commit/caa20fe4de9d5be90f563f94cd9e8785ca8036ea))

### 🐛 Bug 修复

- *(kun)* 处理包装过的 API 响应格式 ([3f70932](https://github.com/huoshen80/ReinaManager/commit/3f7093205eced3e130d52f0fcc0f537881b8c37e))

### 🚜 重构

- *(cards)* 移除长按和双击启动设置 ([86a14f1](https://github.com/huoshen80/ReinaManager/commit/86a14f17c5e20d9619a9094b92d573d619af6008))
- *(collection)* 用可选链简化空值检查 ([580abd8](https://github.com/huoshen80/ReinaManager/commit/580abd89a7311eb7c0ee93eb03fe803eacca62b7))
- *(data)* 调整数据源合并优先级并移除 ymgal 标签 ([6b9d440](https://github.com/huoshen80/ReinaManager/commit/6b9d4408317093c4730923009ecd7ceb985ce50a))
- *(metadata)* 引入数据源适配器注册表模式 ([4579a64](https://github.com/huoshen80/ReinaManager/commit/4579a644026dfceabdb5a220556931197ad995e0))

</details>

### ✨ Features

- *(backup)* Add auto backup on exit with retention policy ([1cdabfb](https://github.com/huoshen80/ReinaManager/commit/1cdabfbbb87c334a2d52731ad1568086e9c3329e))
- *(cover)* Add source cover selection for mixed games ([caa20fe](https://github.com/huoshen80/ReinaManager/commit/caa20fe4de9d5be90f563f94cd9e8785ca8036ea))

### 🐛 Bug Fixes

- *(kun)* Handle wrapped API responses ([3f70932](https://github.com/huoshen80/ReinaManager/commit/3f7093205eced3e130d52f0fcc0f537881b8c37e))

### 🚜 Refactor

- *(cards)* Remove long-press and double-click launch settings ([86a14f1](https://github.com/huoshen80/ReinaManager/commit/86a14f17c5e20d9619a9094b92d573d619af6008))
- *(collection)* Simplify null check with optional chaining ([580abd8](https://github.com/huoshen80/ReinaManager/commit/580abd89a7311eb7c0ee93eb03fe803eacca62b7))
- *(data)* Adjust data source merge priority and drop ymgal tags ([6b9d440](https://github.com/huoshen80/ReinaManager/commit/6b9d4408317093c4730923009ecd7ceb985ce50a))
- *(metadata)* Introduce source adapter registry pattern ([4579a64](https://github.com/huoshen80/ReinaManager/commit/4579a644026dfceabdb5a220556931197ad995e0))

## [0.21.7](https://github.com/huoshen80/ReinaManager/compare/v0.21.6...v0.21.7) (2026-06-03)

### ⚠️注意：Bangumi 已经被墙，如果没有梯子，更新后请主动前往设置 Mixed 搜索源关闭 Bangumi 源以提升 Mixed 源的搜索速度。

<details>
<summary>查看中文版本</summary>

### ✨ 新功能

- *(backup)* 重构导入流程，加入封面备份、冷备份提取和相同路径保护 ([a18d28a](https://github.com/huoshen80/ReinaManager/commit/a18d28a4f14b43693cc4a465d92cd7a3adf9f142))
- *(settings)* 自修复无效工具/备份路径并同步前端缓存 ([6a09e4c](https://github.com/huoshen80/ReinaManager/commit/6a09e4cf9914086676acb5e049f8af2a68605254))

### 🐛 Bug 修复

- *(window)* 设置阶段显示主窗口，避免静默启动 ([76e0ee0](https://github.com/huoshen80/ReinaManager/commit/76e0ee0f4392536a2b9bbe4334b42c4413c559cd))
- *(migration)* 通过幂等列操作和更广的旧版检测强化基线迁移 ([d340165](https://github.com/huoshen80/ReinaManager/commit/d3401653e1159a2d4c072022ff17cccefbcb7d32))

### 🚜 重构

- *(settings)* 将混合来源标志统一为 mixedEnabledSources 数组 ([e25d3fe](https://github.com/huoshen80/ReinaManager/commit/e25d3fef643163d915648a6b83cb4f048a21d643))
- *(collection)* 用 SelectedCategory 替换 selectedCategoryId ([2e06ca5](https://github.com/huoshen80/ReinaManager/commit/2e06ca5ee1396000374245aa173e4de4bb5debdc))
- *(collection)* 虚拟化开发者分类网格并恢复滚动位置 ([61c10fa](https://github.com/huoshen80/ReinaManager/commit/61c10fa2ad6239739268263dd2a3d4262e1dd156))

</details>

### ✨ Features

- *(backup)* Refactor import flow with cover backup, cold backup extraction, and same-path guard ([a18d28a](https://github.com/huoshen80/ReinaManager/commit/a18d28a4f14b43693cc4a465d92cd7a3adf9f142))
- *(settings)* Self-heal invalid tool/backup paths and sync frontend cache ([6a09e4c](https://github.com/huoshen80/ReinaManager/commit/6a09e4cf9914086676acb5e049f8af2a68605254))

### 🐛 Bug Fixes

- *(window)* Show main window on setup to prevent silent startup ([76e0ee0](https://github.com/huoshen80/ReinaManager/commit/76e0ee0f4392536a2b9bbe4334b42c4413c559cd))
- *(migration)* Harden baseline migration with idempotent column ops and broader legacy detection ([d340165](https://github.com/huoshen80/ReinaManager/commit/d3401653e1159a2d4c072022ff17cccefbcb7d32))

### 🚜 Refactor

- *(settings)* Unify mixed source flags into mixedEnabledSources array ([e25d3fe](https://github.com/huoshen80/ReinaManager/commit/e25d3fef643163d915648a6b83cb4f048a21d643))
- *(collection)* Replace selectedCategoryId with SelectedCategory ([2e06ca5](https://github.com/huoshen80/ReinaManager/commit/2e06ca5ee1396000374245aa173e4de4bb5debdc))
- *(collection)* Virtualize developer category grid with scroll restore ([61c10fa](https://github.com/huoshen80/ReinaManager/commit/61c10fa2ad6239739268263dd2a3d4262e1dd156))


## [0.21.6](https://github.com/huoshen80/ReinaManager/compare/v0.21.5...v0.21.6) (2026-05-30)

<details>
<summary>查看中文版本</summary>

### ⚙️ 杂类任务

- *(dev)* 添加 WebView2 CDP 调试脚本 ([940eff9](https://github.com/huoshen80/ReinaManager/commit/940eff9fdb2336374c8841a3fd1781089f8c4917))

### ✨ 新功能

- *(cover)* 添加游戏封面的剪贴板图片导入 ([1ede9ea](https://github.com/huoshen80/ReinaManager/commit/1ede9eab5f4d4ca4e8fd7a7b8b03c007e27513fc))

### 🐛 Bug 修复

- *(errors)* 保留 invoke 错误详情 ([a50edaa](https://github.com/huoshen80/ReinaManager/commit/a50edaaf619ae3b0c0df2e2b00faf24125d3d805))
- *(tray)* 防护并发初始化 ([10dd3b6](https://github.com/huoshen80/ReinaManager/commit/10dd3b609bc76dd3ea7f23f04297140b47524d78))
- *(fs)* 明确缺失目录错误 ([b7f9d48](https://github.com/huoshen80/ReinaManager/commit/b7f9d482e8a99e8035644d2135ad076663481885))

### 📚 文档

- *(ui)* 更新截图并修复 ymgallink 标签 ([f586f47](https://github.com/huoshen80/ReinaManager/commit/f586f47663713e3e8f886440d6d4b0c8d5ed276c))

### 🚀 性能优化

- *(scan)* 在目录扫描中使用 HashSet 做祖先去重 ([85ca31c](https://github.com/huoshen80/ReinaManager/commit/85ca31c928c295048ca89e2aba6a5f2d425c184f))
- *(launch)* 收窄游戏计时器订阅 ([b552c8a](https://github.com/huoshen80/ReinaManager/commit/b552c8a3c2f53c72837bcc2abf7a435304c6f8a7))

### 🚜 重构

- *(logging)* 用 log 宏替换 println 并降低游戏监控日志冗余 ([00930d1](https://github.com/huoshen80/ReinaManager/commit/00930d13fe573e59ccd87c02f910ec4698da6dff))
- *(logging)* 规范日志级别、添加运行日志并改进错误处理 ([9988244](https://github.com/huoshen80/ReinaManager/commit/9988244e7f5d6adae18bf91db89aa8a7161a7d9c))

</details>

### ⚙️ Miscellaneous Tasks

- *(dev)* Add CDP debugging script for WebView2 ([940eff9](https://github.com/huoshen80/ReinaManager/commit/940eff9fdb2336374c8841a3fd1781089f8c4917))

### ✨ Features

- *(cover)* Add clipboard image import for game covers ([1ede9ea](https://github.com/huoshen80/ReinaManager/commit/1ede9eab5f4d4ca4e8fd7a7b8b03c007e27513fc))

### 🐛 Bug Fixes

- *(errors)* Preserve invoke error details ([a50edaa](https://github.com/huoshen80/ReinaManager/commit/a50edaaf619ae3b0c0df2e2b00faf24125d3d805))
- *(tray)* Guard concurrent initialization ([10dd3b6](https://github.com/huoshen80/ReinaManager/commit/10dd3b609bc76dd3ea7f23f04297140b47524d78))
- *(fs)* Clarify missing directory error ([b7f9d48](https://github.com/huoshen80/ReinaManager/commit/b7f9d482e8a99e8035644d2135ad076663481885))

### 📚 Documentation

- *(ui)* Update screenshots and fix ymgallink label ([f586f47](https://github.com/huoshen80/ReinaManager/commit/f586f47663713e3e8f886440d6d4b0c8d5ed276c))

### 🚀 Performance

- *(scan)* Use HashSet for ancestor dedup in directory scanning ([85ca31c](https://github.com/huoshen80/ReinaManager/commit/85ca31c928c295048ca89e2aba6a5f2d425c184f))
- *(launch)* Narrow game timer subscriptions ([b552c8a](https://github.com/huoshen80/ReinaManager/commit/b552c8a3c2f53c72837bcc2abf7a435304c6f8a7))

### 🚜 Refactor

- *(logging)* Replace println with log macros and lower game monitor verbosity ([00930d1](https://github.com/huoshen80/ReinaManager/commit/00930d13fe573e59ccd87c02f910ec4698da6dff))
- *(logging)* Standardize log levels, add operational logging, and improve error handling ([9988244](https://github.com/huoshen80/ReinaManager/commit/9988244e7f5d6adae18bf91db89aa8a7161a7d9c))


## [0.21.5](https://github.com/huoshen80/ReinaManager/compare/v0.21.4...v0.21.5) (2026-05-27)

<details>
<summary>查看中文版本</summary>

### ⚙️ 杂类任务

- *(pnpm)* 固定 pnpm 和构建策略 ([26714af](https://github.com/huoshen80/ReinaManager/commit/26714afae64e1e276bf1691623b6a48f573a0c7a))
- 更新 pnpm 11 构建工作流 ([28a12fd](https://github.com/huoshen80/ReinaManager/commit/28a12fd9619ea3fe4464e7883257edd2f6615165))
- *(workspace)* 更新 pnpm 工作区配置 ([1f8df89](https://github.com/huoshen80/ReinaManager/commit/1f8df89a1621f044cc73cdbce7d9b074d8f43c77))

### ✨ 新功能

- *(api)* 添加统一限速基础设施 ([184005b](https://github.com/huoshen80/ReinaManager/commit/184005b401458b9d66852a514002de1785d353f8))
- *(api)* 在 API 源中集成限速和中止信号 ([28c5c24](https://github.com/huoshen80/ReinaManager/commit/28c5c2486956ab52e788d6aa63da2f08a2fd2dc6))
- *(ui)* 通过服务层和 UI 层传播中止信号 ([cff4dd3](https://github.com/huoshen80/ReinaManager/commit/cff4dd3d475536adbcb01ad62964516b4533dab5))
- *(bulk-import)* 将导入拆分为已匹配和自定义两条路径 ([cb0b16f](https://github.com/huoshen80/ReinaManager/commit/cb0b16f5d15cd019d5e825f4d739a94055f343d2))
- *(api)* 搜索限制可配置并调整限速参数 ([27bd316](https://github.com/huoshen80/ReinaManager/commit/27bd316ca3cf457c05880e1a0737c805dd375426))

### 🐛 Bug 修复

- *(backup)* 将默认存档路径设为所选游戏所在文件夹 ([5016867](https://github.com/huoshen80/ReinaManager/commit/5016867c38306ee2cf6160b249cf807cc75214e5))

### 🚜 重构

- *(dialog)* 合并文件夹/文件对话框并支持默认路径 ([00b712c](https://github.com/huoshen80/ReinaManager/commit/00b712ceadcbb2ac778f0633125c7dbf0bcc9ade))

</details>

### ⚙️ Miscellaneous Tasks

- *(pnpm)* Pin pnpm and build policy ([26714af](https://github.com/huoshen80/ReinaManager/commit/26714afae64e1e276bf1691623b6a48f573a0c7a))
- Update build workflows for pnpm 11 ([28a12fd](https://github.com/huoshen80/ReinaManager/commit/28a12fd9619ea3fe4464e7883257edd2f6615165))
- *(workspace)* Update pnpm workspace config ([1f8df89](https://github.com/huoshen80/ReinaManager/commit/1f8df89a1621f044cc73cdbce7d9b074d8f43c77))

### ✨ Features

- *(api)* Add unified rate limiting infrastructure ([184005b](https://github.com/huoshen80/ReinaManager/commit/184005b401458b9d66852a514002de1785d353f8))
- *(api)* Integrate rate limiting and abort signals in API sources ([28c5c24](https://github.com/huoshen80/ReinaManager/commit/28c5c2486956ab52e788d6aa63da2f08a2fd2dc6))
- *(ui)* Propagate abort signals through service and UI layers ([cff4dd3](https://github.com/huoshen80/ReinaManager/commit/cff4dd3d475536adbcb01ad62964516b4533dab5))
- *(bulk-import)* Split import into matched and custom paths ([cb0b16f](https://github.com/huoshen80/ReinaManager/commit/cb0b16f5d15cd019d5e825f4d739a94055f343d2))
- *(api)* Make search limit configurable and tune rate limits ([27bd316](https://github.com/huoshen80/ReinaManager/commit/27bd316ca3cf457c05880e1a0737c805dd375426))

### 🐛 Bug Fixes

- *(backup)* Set default save data path to parent of selected game ([5016867](https://github.com/huoshen80/ReinaManager/commit/5016867c38306ee2cf6160b249cf807cc75214e5))

### 🚜 Refactor

- *(dialog)* Consolidate folder/file dialogs and pass defaultPath ([00b712c](https://github.com/huoshen80/ReinaManager/commit/00b712ceadcbb2ac778f0633125c7dbf0bcc9ade))


## [0.21.4](https://github.com/huoshen80/ReinaManager/compare/v0.21.3...v0.21.4) (2026-05-25)

<details>
<summary>查看中文版本</summary>

### 🐛 Bug 修复

- *(tauri)* 在 Tauri 运行时外保护原生 API ([c065ead](https://github.com/huoshen80/ReinaManager/commit/c065ead90aca9384e16481db657b1d87aed85a9c))
- *(games)* 集中处理日期回退 ([b6d4fa8](https://github.com/huoshen80/ReinaManager/commit/b6d4fa88dcb6df8dc10104ce3478a6116064f80e))

### 🚜 重构

- *(frontend)* 使用规范游戏日期 ([5cb0cc0](https://github.com/huoshen80/ReinaManager/commit/5cb0cc09ad578baf8e46eb6dd314444a48691eca))
- *(bgm)* 集中管理 Bangumi API 基础 URL ([acc95e3](https://github.com/huoshen80/ReinaManager/commit/acc95e388f7ffbea56ad338832489716ed3138c0))

</details>

### 🐛 Bug Fixes

- *(tauri)* Guard native APIs outside Tauri runtime ([c065ead](https://github.com/huoshen80/ReinaManager/commit/c065ead90aca9384e16481db657b1d87aed85a9c))
- *(games)* Centralize date fallback handling ([b6d4fa8](https://github.com/huoshen80/ReinaManager/commit/b6d4fa88dcb6df8dc10104ce3478a6116064f80e))

### 🚜 Refactor

- *(frontend)* Rely on canonical game dates ([5cb0cc0](https://github.com/huoshen80/ReinaManager/commit/5cb0cc09ad578baf8e46eb6dd314444a48691eca))
- *(bgm)* Centralize bangumi api base urls ([acc95e3](https://github.com/huoshen80/ReinaManager/commit/acc95e388f7ffbea56ad338832489716ed3138c0))


## [0.21.3](https://github.com/huoshen80/ReinaManager/compare/v0.21.2...v0.21.3) (2026-05-24)

<details>
<summary>查看中文版本</summary>

### ✨ 新功能

- *(add-modal)* 增强批量导入流程 ([ee3a89c](https://github.com/huoshen80/ReinaManager/commit/ee3a89c2bd3ee9595bca76aeaf1d09f0e95a7170))
- *(layout)* 添加返回顶部按钮 ([f0ea488](https://github.com/huoshen80/ReinaManager/commit/f0ea4884086f7a37a5a5d6ff3ec0c756b747153d))

### 🐛 Bug 修复

- *(add-modal)* 移除已导入的批量项目 ([2d08d64](https://github.com/huoshen80/ReinaManager/commit/2d08d644490e9cf14823b20eab36a37d0822c3d6))

### 🚀 性能优化

- *(database)* 加速批量导入持久化 ([0c64f56](https://github.com/huoshen80/ReinaManager/commit/0c64f563b82f1ea9d101bc18b5dfa74cfe37238b))
- *(add-modal)* 预取云端游玩状态 ([d575ff2](https://github.com/huoshen80/ReinaManager/commit/d575ff2c2591486988b0bbf2ade20f9659573768))

</details>

### ✨ Features

- *(add-modal)* Enhance bulk import workflow ([ee3a89c](https://github.com/huoshen80/ReinaManager/commit/ee3a89c2bd3ee9595bca76aeaf1d09f0e95a7170))
- *(layout)* Add back to top button ([f0ea488](https://github.com/huoshen80/ReinaManager/commit/f0ea4884086f7a37a5a5d6ff3ec0c756b747153d))

### 🐛 Bug Fixes

- *(add-modal)* Remove imported bulk items ([2d08d64](https://github.com/huoshen80/ReinaManager/commit/2d08d644490e9cf14823b20eab36a37d0822c3d6))

### 🚀 Performance

- *(database)* Speed up bulk import persistence ([0c64f56](https://github.com/huoshen80/ReinaManager/commit/0c64f563b82f1ea9d101bc18b5dfa74cfe37238b))
- *(add-modal)* Prefetch cloud play statuses ([d575ff2](https://github.com/huoshen80/ReinaManager/commit/d575ff2c2591486988b0bbf2ade20f9659573768))


## [0.21.2](https://github.com/huoshen80/ReinaManager/compare/v0.21.1...v0.21.2) (2026-05-21)

<details>
<summary>查看中文版本</summary>

### ✨ 新功能

- *(settings)* 为关于部分添加赞助链接 ([9a4d24a](https://github.com/huoshen80/ReinaManager/commit/9a4d24a2d529d79068a8603148d6c044c5c3d5c2))

### 🐛 Bug 修复

- *(api)* 提高 VNDB 搜索准确性 ([160086d](https://github.com/huoshen80/ReinaManager/commit/160086d7267c0ab37c71f13233d71759d1443c35))

</details>

### ✨ Features

- *(settings)* Add sponsor link to about section ([9a4d24a](https://github.com/huoshen80/ReinaManager/commit/9a4d24a2d529d79068a8603148d6c044c5c3d5c2))

### 🐛 Bug Fixes

- *(api)* Improve VNDB search accuracy ([160086d](https://github.com/huoshen80/ReinaManager/commit/160086d7267c0ab37c71f13233d71759d1443c35))


## [0.21.1](https://github.com/huoshen80/ReinaManager/compare/v0.21.0...v0.21.1) (2026-05-20)

<details>
<summary>查看中文版本</summary>

### ✨ 新功能

- *(home)* 显示空游戏库状态 ([25b2bbe](https://github.com/huoshen80/ReinaManager/commit/25b2bbeb47517b32d88660f00b5bcfd192a3ba81))

### 🐛 Bug 修复

- *(window)* 强制退出前保存窗口状态 ([b95be7e](https://github.com/huoshen80/ReinaManager/commit/b95be7ee98b17e5951f127c66a221b6ed3338a9a))
- *(layout)* 预留滚动条槽位 ([74d91c0](https://github.com/huoshen80/ReinaManager/commit/74d91c0bf8df1f7c59c5807192514f174d7b92cc))

### 📚 文档

- *(readme)* 同步本地化功能文档 [skip ci] ([3712f36](https://github.com/huoshen80/ReinaManager/commit/3712f36f858f17dc095db738a0dacdd1cd684344))

</details>

### ✨ Features

- *(home)* Show empty library state ([25b2bbe](https://github.com/huoshen80/ReinaManager/commit/25b2bbeb47517b32d88660f00b5bcfd192a3ba81))

### 🐛 Bug Fixes

- *(window)* Save state before forced exit ([b95be7e](https://github.com/huoshen80/ReinaManager/commit/b95be7ee98b17e5951f127c66a221b6ed3338a9a))
- *(layout)* Reserve scrollbar gutter ([74d91c0](https://github.com/huoshen80/ReinaManager/commit/74d91c0bf8df1f7c59c5807192514f174d7b92cc))

### 📚 Documentation

- *(readme)* Sync localized feature docs [skip ci] ([3712f36](https://github.com/huoshen80/ReinaManager/commit/3712f36f858f17dc095db738a0dacdd1cd684344))


## [0.21.0](https://github.com/huoshen80/ReinaManager/compare/v0.20.4...v0.21.0) (2026-05-18)

<details>
<summary>查看中文版本</summary>

### ⚙️ 杂类任务

- 应用小幅优化 ([465cd61](https://github.com/huoshen80/ReinaManager/commit/465cd611ea203fc1cdfc16b30fbbe13197a1be5c))

### ✨ 新功能

- *(home)* 切换周/月游戏时长 ([46a00d6](https://github.com/huoshen80/ReinaManager/commit/46a00d639f42047eedb6f141ef484c1ad02122f4))
- *(filter)* 添加 Tag 筛选功能 ([95055ea](https://github.com/huoshen80/ReinaManager/commit/95055ea34b7a78d860488308aeddb964ba498f98))
- *(detail)* 添加标签选择和搜索 ([cb92721](https://github.com/huoshen80/ReinaManager/commit/cb927212c515a52091d5b6fe52339ec87d576788))
- *(filters)* 添加快速清除控件 ([17069ac](https://github.com/huoshen80/ReinaManager/commit/17069ac1f98d71c366be3fdd3182e790267bc9aa))

### 🎨 样式

- *(settings)* 优化设置页布局 ([bed2849](https://github.com/huoshen80/ReinaManager/commit/bed284904e6d4101cb87ba44062eb34f1f89985d))

### 🐛 Bug 修复

- *(games)* 使动态查询与当前状态一致 ([d673ead](https://github.com/huoshen80/ReinaManager/commit/d673ead5dae61818684f1381c0c9b50e8be6782c))

### 🚀 性能优化

- *(app)* 减少启动和查询缓存工作 ([b595061](https://github.com/huoshen80/ReinaManager/commit/b5950615ed588441d0b9e3baae91035f9e5529ab))
- *(ui)* 减少重复列表处理 ([816d4d7](https://github.com/huoshen80/ReinaManager/commit/816d4d7017690d09d4321e4cef80976f84f0a462))
- *(query)* 保持本地缓存驻留 ([7d55d92](https://github.com/huoshen80/ReinaManager/commit/7d55d9227f04cdd787387cd97e85ad774be18713))
- *(cards)* 简化网格尺寸变化处理 ([95b44a1](https://github.com/huoshen80/ReinaManager/commit/95b44a19e150d096c23ff847156ff8d02388aae2))
- *(home)* 从查询派生活动数据 ([76aeb8f](https://github.com/huoshen80/ReinaManager/commit/76aeb8fb0593307feb0d90d2747d7f3f0cf54776))
- *(tags)* 减少筛选匹配工作 ([3ba9f20](https://github.com/huoshen80/ReinaManager/commit/3ba9f2055bb02420144d9a62377830d29f510ac9))

### 🚜 重构

- *(add-modal)* 复用 API 来源控件 ([9d91329](https://github.com/huoshen80/ReinaManager/commit/9d913294935aa65bbff08515fbbc4bc76aa918b1))
- *(utils)* 按领域组织辅助函数 ([48debde](https://github.com/huoshen80/ReinaManager/commit/48debde28e5aa0b282f37606f3113d8d546ac122))

</details>

### ⚙️ Miscellaneous Tasks

- Apply minor optimizations ([465cd61](https://github.com/huoshen80/ReinaManager/commit/465cd611ea203fc1cdfc16b30fbbe13197a1be5c))

### ✨ Features

- *(home)* Toggle weekly and monthly playtime ([46a00d6](https://github.com/huoshen80/ReinaManager/commit/46a00d639f42047eedb6f141ef484c1ad02122f4))
- *(filter)* Add tag filter functionality ([95055ea](https://github.com/huoshen80/ReinaManager/commit/95055ea34b7a78d860488308aeddb964ba498f98))
- *(detail)* Add tag selection and search ([cb92721](https://github.com/huoshen80/ReinaManager/commit/cb927212c515a52091d5b6fe52339ec87d576788))
- *(filters)* Add quick clear control ([17069ac](https://github.com/huoshen80/ReinaManager/commit/17069ac1f98d71c366be3fdd3182e790267bc9aa))

### 🎨 Styling

- *(settings)* Refine settings page layout ([bed2849](https://github.com/huoshen80/ReinaManager/commit/bed284904e6d4101cb87ba44062eb34f1f89985d))

### 🐛 Bug Fixes

- *(games)* Align activity queries with current state ([d673ead](https://github.com/huoshen80/ReinaManager/commit/d673ead5dae61818684f1381c0c9b50e8be6782c))

### 🚀 Performance

- *(app)* Narrow startup and query cache work ([b595061](https://github.com/huoshen80/ReinaManager/commit/b5950615ed588441d0b9e3baae91035f9e5529ab))
- *(ui)* Reduce repeated list work ([816d4d7](https://github.com/huoshen80/ReinaManager/commit/816d4d7017690d09d4321e4cef80976f84f0a462))
- *(query)* Keep local caches resident ([7d55d92](https://github.com/huoshen80/ReinaManager/commit/7d55d9227f04cdd787387cd97e85ad774be18713))
- *(cards)* Simplify grid resize handling ([95b44a1](https://github.com/huoshen80/ReinaManager/commit/95b44a19e150d096c23ff847156ff8d02388aae2))
- *(home)* Derive activity data from query ([76aeb8f](https://github.com/huoshen80/ReinaManager/commit/76aeb8fb0593307feb0d90d2747d7f3f0cf54776))
- *(tags)* Reduce filter matching work ([3ba9f20](https://github.com/huoshen80/ReinaManager/commit/3ba9f2055bb02420144d9a62377830d29f510ac9))

### 🚜 Refactor

- *(add-modal)* Share api source controls ([9d91329](https://github.com/huoshen80/ReinaManager/commit/9d913294935aa65bbff08515fbbc4bc76aa918b1))
- *(utils)* Organize helpers by domain ([48debde](https://github.com/huoshen80/ReinaManager/commit/48debde28e5aa0b282f37606f3113d8d546ac122))


## [0.20.4](https://github.com/huoshen80/ReinaManager/compare/v0.20.3...v0.20.4) (2026-05-15)

<details>
<summary>查看中文版本</summary>

### ⚙️ 杂类任务

- *(i18n)* 添加同步脚本 ([41cfd6d](https://github.com/huoshen80/ReinaManager/commit/41cfd6d6cd002525e8582a416a88f89466bceb61))

### ✨ 新功能

- *(game-list)* 统一列表状态视图 ([3a373c3](https://github.com/huoshen80/ReinaManager/commit/3a373c34a933191f96b7c1aa04234d7b5e2899da))

### 🐛 Bug 修复

- *(collection)* 删除功能被禁用时跳过 AlertConfirmBox 渲染 ([672cf1a](https://github.com/huoshen80/ReinaManager/commit/672cf1ada9cf05e9842bd272e06e3f407c367ce9))
- *(i18n)* 保留提取出的复数键 ([d04d0e4](https://github.com/huoshen80/ReinaManager/commit/d04d0e4310ec8d5852348cdcc98a62e9c89a80b8))
- *(i18n)* 同步默认回退文本 ([a691bdf](https://github.com/huoshen80/ReinaManager/commit/a691bdfdba76db59da4ccd4668a8e279b23e84ef))
- *(i18n)* 使用静态 count 默认值 ([75f3892](https://github.com/huoshen80/ReinaManager/commit/75f3892742f679707d511c02c801daf4dbdad353))
- *(logging)* 保留轮转日志文件 ([cd74277](https://github.com/huoshen80/ReinaManager/commit/cd742772033f71f902b4bcc17db3505340cbf2d0))

### 📚 文档

- *(games)* 记录游戏数据缓存流程 ([be08957](https://github.com/huoshen80/ReinaManager/commit/be089575e2993ec9519c854ee6d57c03b20f0497))

### 🚀 性能优化

- *(game-list)* 将过滤步骤合并为单次循环 ([5d9cec3](https://github.com/huoshen80/ReinaManager/commit/5d9cec3da6c5a15400708a1db26015a5136b1493))
- *(games)* 写入后修补游戏缓存 ([4358d30](https://github.com/huoshen80/ReinaManager/commit/4358d30e9d10a3ab5b37ab4137c55e194063b9f8))
- *(search)* 简化游戏搜索流程 ([cf96ac4](https://github.com/huoshen80/ReinaManager/commit/cf96ac4edfa978b3c42acb6bfd4b599bf649075c))
- *(collection)* 批量处理分类游戏计数 ([7e4100d](https://github.com/huoshen80/ReinaManager/commit/7e4100d737b0f825e5678864f999715523e1ffa4))

### 🚜 重构

- *(game-index)* 引入统一的 GameIndex 并移除详情缓存层 ([3a5db3b](https://github.com/huoshen80/ReinaManager/commit/3a5db3bed020a4fb350df38a230d517217884d08))
- *(cards)* 传递 displayById 映射，而不是逐个查找游戏 ([0693184](https://github.com/huoshen80/ReinaManager/commit/0693184f251168e88f077b22b65e1cc7e6af3a90))
- *(pages)* 在页面和虚拟分类中集成 GameIndex ([2c1b06c](https://github.com/huoshen80/ReinaManager/commit/2c1b06c20dc08a0e86edc92e2a76bce4a95c73c6))
- *(games)* 改进开发者分类 ID 哈希函数 ([df99b78](https://github.com/huoshen80/ReinaManager/commit/df99b78b490e5289bafaca1462c52a463a8f186b))
- *(home)* 移除包装 hook 并虚拟化游戏列表 ([f3613ee](https://github.com/huoshen80/ReinaManager/commit/f3613ee5df3420432981cfb147dce0d8f870ca12))
- *(collection)* 收窄合集类型 ([ff9a956](https://github.com/huoshen80/ReinaManager/commit/ff9a9567fdd2dae930319f2771af8dcbe23954a5))

</details>

### ⚙️ Miscellaneous Tasks

- *(i18n)* Add sync script ([41cfd6d](https://github.com/huoshen80/ReinaManager/commit/41cfd6d6cd002525e8582a416a88f89466bceb61))

### ✨ Features

- *(game-list)* Unify list state views ([3a373c3](https://github.com/huoshen80/ReinaManager/commit/3a373c34a933191f96b7c1aa04234d7b5e2899da))

### 🐛 Bug Fixes

- *(collection)* Skip AlertConfirmBox render when delete is disabled ([672cf1a](https://github.com/huoshen80/ReinaManager/commit/672cf1ada9cf05e9842bd272e06e3f407c367ce9))
- *(i18n)* Preserve extracted plural keys ([d04d0e4](https://github.com/huoshen80/ReinaManager/commit/d04d0e4310ec8d5852348cdcc98a62e9c89a80b8))
- *(i18n)* Sync default fallback text ([a691bdf](https://github.com/huoshen80/ReinaManager/commit/a691bdfdba76db59da4ccd4668a8e279b23e84ef))
- *(i18n)* Use static count defaults ([75f3892](https://github.com/huoshen80/ReinaManager/commit/75f3892742f679707d511c02c801daf4dbdad353))
- *(logging)* Keep rotated log files ([cd74277](https://github.com/huoshen80/ReinaManager/commit/cd742772033f71f902b4bcc17db3505340cbf2d0))

### 📚 Documentation

- *(games)* Document game data cache flow ([be08957](https://github.com/huoshen80/ReinaManager/commit/be089575e2993ec9519c854ee6d57c03b20f0497))

### 🚀 Performance

- *(game-list)* Merge filter passes into single loop ([5d9cec3](https://github.com/huoshen80/ReinaManager/commit/5d9cec3da6c5a15400708a1db26015a5136b1493))
- *(games)* Patch game caches after writes ([4358d30](https://github.com/huoshen80/ReinaManager/commit/4358d30e9d10a3ab5b37ab4137c55e194063b9f8))
- *(search)* Simplify game search flow ([cf96ac4](https://github.com/huoshen80/ReinaManager/commit/cf96ac4edfa978b3c42acb6bfd4b599bf649075c))
- *(collection)* Batch category game counts ([7e4100d](https://github.com/huoshen80/ReinaManager/commit/7e4100d737b0f825e5678864f999715523e1ffa4))

### 🚜 Refactor

- *(game-index)* Introduce unified GameIndex and remove detail cache layer ([3a5db3b](https://github.com/huoshen80/ReinaManager/commit/3a5db3bed020a4fb350df38a230d517217884d08))
- *(cards)* Pass displayById map instead of individual game lookups ([0693184](https://github.com/huoshen80/ReinaManager/commit/0693184f251168e88f077b22b65e1cc7e6af3a90))
- *(pages)* Integrate GameIndex across pages and virtual categories ([2c1b06c](https://github.com/huoshen80/ReinaManager/commit/2c1b06c20dc08a0e86edc92e2a76bce4a95c73c6))
- *(games)* Improve developer category ID hash fn ([df99b78](https://github.com/huoshen80/ReinaManager/commit/df99b78b490e5289bafaca1462c52a463a8f186b))
- *(home)* Remove wrapper hook and virtualize game list ([f3613ee](https://github.com/huoshen80/ReinaManager/commit/f3613ee5df3420432981cfb147dce0d8f870ca12))
- *(collection)* Narrow collection types ([ff9a956](https://github.com/huoshen80/ReinaManager/commit/ff9a9567fdd2dae930319f2771af8dcbe23954a5))


## [0.20.3](https://github.com/huoshen80/ReinaManager/compare/v0.20.2...v0.20.3) (2026-05-11)

<details>
<summary>查看中文版本</summary>

### ⚙️ 杂类任务

- *(build)* 传递 Bangumi OAuth 密钥 ([5c2a2d8](https://github.com/huoshen80/ReinaManager/commit/5c2a2d8aee460eeb49e2c09340286369b2dc15c9))

### ✨ 新功能

- *(bgm)* 添加 Bangumi OAuth 认证存储 ([ac961c4](https://github.com/huoshen80/ReinaManager/commit/ac961c4b3c400d1bc3783ee086f2ec278db08435))
- *(bgm-auth)* 添加 OAuth 令牌自动刷新 ([0062b8d](https://github.com/huoshen80/ReinaManager/commit/0062b8d4ada88b9bedfb093e78e12f9cb6b1ea9a))
- *(detail)* 添加无需重新获取数据的显示源切换 ([9cfc2cd](https://github.com/huoshen80/ReinaManager/commit/9cfc2cddf90ac2eba077b0c7083fa77c69cb533d))

### 🐛 Bug 修复

- *(bgm)* 加固 OAuth 回调流程 ([9dba210](https://github.com/huoshen80/ReinaManager/commit/9dba210633aca843c0fdd78ba74e915367623806))

### 🚜 重构

- *(bgm-auth)* 收紧令牌类型并将 BGM_TOKEN 重命名为 bgmToken ([6999077](https://github.com/huoshen80/ReinaManager/commit/6999077626c17e2b2fa7aadfa3f679f1173cd33e))
- *(bgm-auth)* 合并工具函数并内联组件 ([913ccab](https://github.com/huoshen80/ReinaManager/commit/913ccab95a4266169a9c0f9db22e1d75ed61a549))
- 拆分游戏列表门面 hook 并添加加载/错误状态 ([f90bad5](https://github.com/huoshen80/ReinaManager/commit/f90bad5cac94e615cefcc14d508699ddac17973b))
- *(bgm-auth)* 防止跨钩子实例重复 BGM OAuth 登录 ([8768916](https://github.com/huoshen80/ReinaManager/commit/8768916d9ba1ed0f21127ef8e25e832903b6c4d6))

</details>

### ⚙️ Miscellaneous Tasks

- *(build)* Pass Bangumi OAuth secret ([5c2a2d8](https://github.com/huoshen80/ReinaManager/commit/5c2a2d8aee460eeb49e2c09340286369b2dc15c9))

### ✨ Features

- *(bgm)* Add Bangumi OAuth auth storage ([ac961c4](https://github.com/huoshen80/ReinaManager/commit/ac961c4b3c400d1bc3783ee086f2ec278db08435))
- *(bgm-auth)* Add automatic OAuth token refresh ([0062b8d](https://github.com/huoshen80/ReinaManager/commit/0062b8d4ada88b9bedfb093e78e12f9cb6b1ea9a))
- *(detail)* Add display source switch without re-fetching ([9cfc2cd](https://github.com/huoshen80/ReinaManager/commit/9cfc2cddf90ac2eba077b0c7083fa77c69cb533d))

### 🐛 Bug Fixes

- *(bgm)* Harden OAuth callback flow ([9dba210](https://github.com/huoshen80/ReinaManager/commit/9dba210633aca843c0fdd78ba74e915367623806))

### 🚜 Refactor

- *(bgm-auth)* Tighten token types and rename BGM_TOKEN to bgmToken ([6999077](https://github.com/huoshen80/ReinaManager/commit/6999077626c17e2b2fa7aadfa3f679f1173cd33e))
- *(bgm-auth)* Consolidate utilities and inline components ([913ccab](https://github.com/huoshen80/ReinaManager/commit/913ccab95a4266169a9c0f9db22e1d75ed61a549))
- Split game list facade and add loading/error states ([f90bad5](https://github.com/huoshen80/ReinaManager/commit/f90bad5cac94e615cefcc14d508699ddac17973b))
- *(bgm-auth)* Prevent duplicate BGM OAuth login across hook instances ([8768916](https://github.com/huoshen80/ReinaManager/commit/8768916d9ba1ed0f21127ef8e25e832903b6c4d6))


## [0.20.2](https://github.com/huoshen80/ReinaManager/compare/v0.20.1...v0.20.2) (2026-05-08)

<details>
<summary>查看中文版本</summary>

### 🐛 Bug 修复
- *(collections)* 移除收藏夹页面的 NSFW 过滤器 ([7c681e3](https://github.com/huoshen80/ReinaManager/commit/7c681e31fd4c4d3a9070e778fc4762b1697b2fa3))

### 🚀 性能优化
- *(Cards)* 为游戏仓库页面添加虚拟化网格 ([7030310](https://github.com/huoshen80/ReinaManager/commit/7030310da76b6c901def1cf38a2eeb307f54ace7))

### 🚜 重构
- *(cards)* 用懒加载替换全量加载 ([5d3ba5e](https://github.com/huoshen80/ReinaManager/commit/5d3ba5e2222ddd8d72605259e0d1397478513db1))
- *(cards)* 使用仅传递 ID 的 IPC 和缓存字典进行卡片渲染 ([d98b5eb](https://github.com/huoshen80/ReinaManager/commit/d98b5eb99b923f7109993d28f1e676b440ed5025))

</details>

### 🐛 Bug Fixes

- *(collections)* Remove NSFW filter from collection pages ([7c681e3](https://github.com/huoshen80/ReinaManager/commit/7c681e31fd4c4d3a9070e778fc4762b1697b2fa3))

### 🚀 Performance

- *(Cards)* Add virtualized grid for libraries page ([7030310](https://github.com/huoshen80/ReinaManager/commit/7030310da76b6c901def1cf38a2eeb307f54ace7))

### 🚜 Refactor

- *(cards)* Replace load all with lazy load ([5d3ba5e](https://github.com/huoshen80/ReinaManager/commit/5d3ba5e2222ddd8d72605259e0d1397478513db1))
- *(cards)* Use ID-only IPC and cache dictionary for card rendering ([d98b5eb](https://github.com/huoshen80/ReinaManager/commit/d98b5eb99b923f7109993d28f1e676b440ed5025))


## [0.20.1](https://github.com/huoshen80/ReinaManager/compare/v0.20.0...v0.20.1) (2026-05-06)

<details>
<summary>查看中文版本</summary>

### 🐛 Bug 修复
- *(mixed-source)* 修复第二次添加游戏时显示旧封面的问题 ([bf25db0](https://github.com/huoshen80/ReinaManager/commit/bf25db09d7d2bdb1d9439af77061da750b0530a1))

</details>

### 🐛 Bug Fixes

- *(mixed-source)* Fix stale cover image shown on second add ([bf25db0](https://github.com/huoshen80/ReinaManager/commit/bf25db09d7d2bdb1d9439af77061da750b0530a1))


## [0.20.0](https://github.com/huoshen80/ReinaManager/compare/v0.19.3...v0.20.0) (2026-05-06)

<details>
<summary>查看中文版本</summary>

### ⚙️ 杂类任务
- *(tsconfig)* 将编译目标迁移至 ESNext ([eb5f4f6](https://github.com/huoshen80/ReinaManager/commit/eb5f4f671ccf7ffda7aa5058cacc41383bf63b2e))
- *(es2023)* 修正 lib 为 es2023 并处理低风险语法迁移 ([08875c5](https://github.com/huoshen80/ReinaManager/commit/08875c547ee818ea1a0ac192ada8e40be6b4a8eb))

### ✨ 新功能
- *(scroll)* 使用返回按钮时保存当前页面滚动位置 ([a4638da](https://github.com/huoshen80/ReinaManager/commit/a4638da2553062656c0dc371da0fd52b912f0f76))
- *(settings)* 设置页添加锚点导航布局 ([df1735f](https://github.com/huoshen80/ReinaManager/commit/df1735f42c832f7d27275464dcd36dfbc11a9802))
- *(GameInfoEdit)* 自定义游戏名称提供别名选项 ([97ec736](https://github.com/huoshen80/ReinaManager/commit/97ec7361ff0ada3ca59725457e4cea608afe0f62))
- *(addmodal)* 添加混合数据源可选列表 ([f45de08](https://github.com/huoshen80/ReinaManager/commit/f45de08d5dd361d2308944dda962a75a2bc2c064))
- *(edit)* 默认折叠数据源更新区域 ([d4c1a23](https://github.com/huoshen80/ReinaManager/commit/d4c1a2398aa11f6bbf371e246f4b125695c1fcef))
- *(GameInfoEdit)* 自定义游戏名称选择中添加全部标题 ([f10b709](https://github.com/huoshen80/ReinaManager/commit/f10b7099287892c711a97b0c12983888f13c230d))
- *(chart)* 优化 ALL 模式下日期轴显示策略 ([afcaafb](https://github.com/huoshen80/ReinaManager/commit/afcaafb930f1b607d172b9477c12d9a2f8adf5c2))
- *(backup)* 添加自定义封面备份功能 ([313480e](https://github.com/huoshen80/ReinaManager/commit/313480efb2af085f89e1873df203a841e5dac1be))
- *(Cards)* 添加批量操作功能 ([b0f315f](https://github.com/huoshen80/ReinaManager/commit/b0f315f6bc9346e3189a9e1634168e6ebb8f58ba))
- *(cards)* 添加渲染数量限制并优化数据管理 ([5d50269](https://github.com/huoshen80/ReinaManager/commit/5d50269a3c77763087019dee530af3e134fe8676))
- *(collection)* 添加 CollectionPickerDialog 及合集管理界面 ([6d6ae2b](https://github.com/huoshen80/ReinaManager/commit/6d6ae2bcdca6a7d4d0d8029ae502bc9d666612dd))
- *(CardBatchBar)* 任何批量操作后自动退出批量模式 ([5c3ad7a](https://github.com/huoshen80/ReinaManager/commit/5c3ad7a3abc6b862d4780a7ef8f72f0712c1e0e4))
- 实现游戏数据源与游玩状态的双重筛选 ([852e60f](https://github.com/huoshen80/ReinaManager/commit/852e60fbb6a327e51c07d4e8f01a07fe34850bb8))

### 🐛 Bug 修复
- *(navigation)* 修复删除游戏后的导航问题 ([64712f5](https://github.com/huoshen80/ReinaManager/commit/64712f54ea61fcc856cc51a36a9af18e8219cbe6))

### 🚀 性能优化
- *(addmodal)* 移除使用 ID 添加游戏时的确认弹窗，简化添加流程 ([5b2b8cd](https://github.com/huoshen80/ReinaManager/commit/5b2b8cd184d5cdd6d92a1cba6ed3d7100b59f248))
- 优化搜索索引及热路径操作性能 ([cfdeb52](https://github.com/huoshen80/ReinaManager/commit/cfdeb526cb3bb7e1c412c013bc7cfc39c28263ed))
- *(cards)* 优化游戏列表渲染与数据流 ([c768d84](https://github.com/huoshen80/ReinaManager/commit/c768d84f9a86961b6f56f501cf53d101b95fd4b2))

### 🚜 重构
- *(store)* 移除冗余的 stop 清理逻辑 ([d452109](https://github.com/huoshen80/ReinaManager/commit/d4521094636110b7c9c88bc6461489d7cd7e1bda))
- *(utils)* 简化代码并移除无用逻辑 ([71af5fa](https://github.com/huoshen80/ReinaManager/commit/71af5fa8d8e2230f51e483f1ec4c536a1fdeaaea))
- *(Toolbar)* 使用 store 中的 selectedGameId ([0b42b1f](https://github.com/huoshen80/ReinaManager/commit/0b42b1ffc37751e1f5bed4b540d791388d5bacdb))
- *(i18n)* 复用重复的 i18n 键值对 ([5d69ff1](https://github.com/huoshen80/ReinaManager/commit/5d69ff1ed7a7d3a9291b3cd07185ee50b31a8af1))
- *(selected-game)* 引入 guard 包装器 ([b4f1e7f](https://github.com/huoshen80/ReinaManager/commit/b4f1e7fe3ab27a270821e483c35db0ca75f790f6))
- *(api)* ID 搜索模式改为自动检测并清理无用代码 ([75b5dcc](https://github.com/huoshen80/ReinaManager/commit/75b5dccc59b77ad2014497c6a5b81d877a9c8fdc))
- *(addmodal)* 提取可复用的 addModal hooks ([9fc3621](https://github.com/huoshen80/ReinaManager/commit/9fc36215b9ca8efda6b43d99282b3a69ee5d8085))
- *(mixed)* 整理函数归属 ([eea8527](https://github.com/huoshen80/ReinaManager/commit/eea8527c87e5dcbf24e6f9f34f1d8d5918cd954b))
- *(addmodal)* 调整混合数据源确认弹窗样式 ([2f75f0f](https://github.com/huoshen80/ReinaManager/commit/2f75f0f13ff6b9ddb44178446bb61c3f4ba52536))
- *(types)* 将 SelectedGameWithId 移至 types 并移除 selectedGame 的空值检查 ([8c13086](https://github.com/huoshen80/ReinaManager/commit/8c13086eab9e583f65da7e0dc5690b55e1027b2b))
- *(core)* 优化热路径性能并移除死代码 ([7aeff77](https://github.com/huoshen80/ReinaManager/commit/7aeff773cf73b0dff42a69c412933a5f2b44c912))
- 移除无用代码 ([2b6f60d](https://github.com/huoshen80/ReinaManager/commit/2b6f60d76840ec86fe04018fbf55bd7ebb13d5ff))
- *(scroll)* 移除 KeepAlive 模式并简化滚动恢复逻辑 ([6957cb4](https://github.com/huoshen80/ReinaManager/commit/6957cb45c4ba49671470f16f3c04afd44aa5dd0b))
- *(cards)* 隔离右键菜单状态并将激活检查移入 CardItem ([4f3bdd9](https://github.com/huoshen80/ReinaManager/commit/4f3bdd9623b21ced671459e22b8e7d698415b5a5))
- *(cards)* 将 Cards 组件拆分为模块化子组件 ([75be1bf](https://github.com/huoshen80/ReinaManager/commit/75be1bfaa1f2db4c15a4b901fe977aa0740d32e1))
- *(collection)* 简化合集 API 并添加批量操作 ([13ea69f](https://github.com/huoshen80/ReinaManager/commit/13ea69fe71440ac0da559c6b701f7ab69166c747))
- *(types)* 拆分游戏数据生命周期类型 ([40cabf3](https://github.com/huoshen80/ReinaManager/commit/40cabf3585f353131ded0f32f6fe33a58683a59f))
- *(launch)* 将游戏路径查找和启动选项迁移至后端 ([eabc355](https://github.com/huoshen80/ReinaManager/commit/eabc35529b0261e7f7a792bc1bd9aa9923dcdb9e))
- *(collection)* 提取类型并简化右键菜单接口 ([a08bdbd](https://github.com/huoshen80/ReinaManager/commit/a08bdbd3098c6c24b5bdb0f1d5abda75e5d6c747))
- *(db)* 移除 game_sessions 和 savedata 中冗余的 created_at 字段 ([b4df397](https://github.com/huoshen80/ReinaManager/commit/b4df3974e10e5e9fb8343be3815e1e586f35b676))

</details>

### ⚙️ Miscellaneous Tasks

- *(tsconfig)* Move to ESNext ([eb5f4f6](https://github.com/huoshen80/ReinaManager/commit/eb5f4f671ccf7ffda7aa5058cacc41383bf63b2e))
- *(es2023)* Fix lib to es2023 and handle low-risk syntax migration ([08875c5](https://github.com/huoshen80/ReinaManager/commit/08875c547ee818ea1a0ac192ada8e40be6b4a8eb))

### ✨ Features

- *(scroll)* Save the scroll of the current page when using the back button ([a4638da](https://github.com/huoshen80/ReinaManager/commit/a4638da2553062656c0dc371da0fd52b912f0f76))
- *(settings)* Add anchor navigation layout ([df1735f](https://github.com/huoshen80/ReinaManager/commit/df1735f42c832f7d27275464dcd36dfbc11a9802))
- *(GameInfoEdit)* Provide alias options for custom game names ([97ec736](https://github.com/huoshen80/ReinaManager/commit/97ec7361ff0ada3ca59725457e4cea608afe0f62))
- *(addmodal)* Add mixed source optional list ([f45de08](https://github.com/huoshen80/ReinaManager/commit/f45de08d5dd361d2308944dda962a75a2bc2c064))
- *(edit)* Default collapse the data source update section ([d4c1a23](https://github.com/huoshen80/ReinaManager/commit/d4c1a2398aa11f6bbf371e246f4b125695c1fcef))
- *(GameInfoEdit)* Add all titles to the custom game name selection ([f10b709](https://github.com/huoshen80/ReinaManager/commit/f10b7099287892c711a97b0c12983888f13c230d))
- *(chart)* Improve ALL mode date axis display strategy ([afcaafb](https://github.com/huoshen80/ReinaManager/commit/afcaafb930f1b607d172b9477c12d9a2f8adf5c2))
- *(backup)* Add custom cover backup feature ([313480e](https://github.com/huoshen80/ReinaManager/commit/313480efb2af085f89e1873df203a841e5dac1be))
- *(Cards)* Add batch actions ([b0f315f](https://github.com/huoshen80/ReinaManager/commit/b0f315f6bc9346e3189a9e1634168e6ebb8f58ba))
- *(cards)* Add render limit and optimize data management ([5d50269](https://github.com/huoshen80/ReinaManager/commit/5d50269a3c77763087019dee530af3e134fe8676))
- *(collection)* Add CollectionPickerDialog and manage collections UI ([6d6ae2b](https://github.com/huoshen80/ReinaManager/commit/6d6ae2bcdca6a7d4d0d8029ae502bc9d666612dd))
- *(CardBatchBar)* Close batch mode after any operations ([5c3ad7a](https://github.com/huoshen80/ReinaManager/commit/5c3ad7a3abc6b862d4780a7ef8f72f0712c1e0e4))
- Implement dual filtering for game source and play status ([852e60f](https://github.com/huoshen80/ReinaManager/commit/852e60fbb6a327e51c07d4e8f01a07fe34850bb8))

### 🐛 Bug Fixes

- *(navigation)* Fix navigation after game deletion ([64712f5](https://github.com/huoshen80/ReinaManager/commit/64712f54ea61fcc856cc51a36a9af18e8219cbe6))

### 🚀 Performance

- *(addmodal)* Remove the confirmation dialog for using id to add a game,simplifying the adding process ([5b2b8cd](https://github.com/huoshen80/ReinaManager/commit/5b2b8cd184d5cdd6d92a1cba6ed3d7100b59f248))
- Optimize search indexing and hot-path operations ([cfdeb52](https://github.com/huoshen80/ReinaManager/commit/cfdeb526cb3bb7e1c412c013bc7cfc39c28263ed))
- *(cards)* Optimize rendering and data flow for game lists ([c768d84](https://github.com/huoshen80/ReinaManager/commit/c768d84f9a86961b6f56f501cf53d101b95fd4b2))

### 🚜 Refactor

- *(store)* Remove redundant stop cleanup ([d452109](https://github.com/huoshen80/ReinaManager/commit/d4521094636110b7c9c88bc6461489d7cd7e1bda))
- *(utils)* Simplify the code and remove useless logic ([71af5fa](https://github.com/huoshen80/ReinaManager/commit/71af5fa8d8e2230f51e483f1ec4c536a1fdeaaea))
- *(Toolbar)* Use selectedGameId from store ([0b42b1f](https://github.com/huoshen80/ReinaManager/commit/0b42b1ffc37751e1f5bed4b540d791388d5bacdb))
- *(i18n)* Reuse duplicate i18n key-value pairs ([5d69ff1](https://github.com/huoshen80/ReinaManager/commit/5d69ff1ed7a7d3a9291b3cd07185ee50b31a8af1))
- *(selected-game)* Introduce guard wrapper ([b4f1e7f](https://github.com/huoshen80/ReinaManager/commit/b4f1e7fe3ab27a270821e483c35db0ca75f790f6))
- *(api)* Change id search mode to automatic detection and clean some useless code ([75b5dcc](https://github.com/huoshen80/ReinaManager/commit/75b5dccc59b77ad2014497c6a5b81d877a9c8fdc))
- *(addmodal)* Extract reusable hooks for use with addModal ([9fc3621](https://github.com/huoshen80/ReinaManager/commit/9fc36215b9ca8efda6b43d99282b3a69ee5d8085))
- *(mixed)* Organize fn attribution ([eea8527](https://github.com/huoshen80/ReinaManager/commit/eea8527c87e5dcbf24e6f9f34f1d8d5918cd954b))
- *(addmodal)* Adjust the style of the mixed source confirmation modal ([2f75f0f](https://github.com/huoshen80/ReinaManager/commit/2f75f0f13ff6b9ddb44178446bb61c3f4ba52536))
- *(types)* Move SelectedGameWithId to types and remove nullable checks for selectedGame ([8c13086](https://github.com/huoshen80/ReinaManager/commit/8c13086eab9e583f65da7e0dc5690b55e1027b2b))
- *(core)* Optimize hot-path perf and remove dead code ([7aeff77](https://github.com/huoshen80/ReinaManager/commit/7aeff773cf73b0dff42a69c412933a5f2b44c912))
- Remove useless code ([2b6f60d](https://github.com/huoshen80/ReinaManager/commit/2b6f60d76840ec86fe04018fbf55bd7ebb13d5ff))
- *(scroll)* Remove KeepAlive mode and simplify restore logic ([6957cb4](https://github.com/huoshen80/ReinaManager/commit/6957cb45c4ba49671470f16f3c04afd44aa5dd0b))
- *(cards)* Isolate right menu state and move active check into CardItem ([4f3bdd9](https://github.com/huoshen80/ReinaManager/commit/4f3bdd9623b21ced671459e22b8e7d698415b5a5))
- *(cards)* Split Cards component into modular subcomponents ([75be1bf](https://github.com/huoshen80/ReinaManager/commit/75be1bfaa1f2db4c15a4b901fe977aa0740d32e1))
- *(collection)* Simplify collection API and add batch operations ([13ea69f](https://github.com/huoshen80/ReinaManager/commit/13ea69fe71440ac0da559c6b701f7ab69166c747))
- *(types)* Split game data lifecycles ([40cabf3](https://github.com/huoshen80/ReinaManager/commit/40cabf3585f353131ded0f32f6fe33a58683a59f))
- *(launch)* Move game path lookup and launch options to backend ([eabc355](https://github.com/huoshen80/ReinaManager/commit/eabc35529b0261e7f7a792bc1bd9aa9923dcdb9e))
- *(collection)* Extract types and simplify right menu interface ([a08bdbd](https://github.com/huoshen80/ReinaManager/commit/a08bdbd3098c6c24b5bdb0f1d5abda75e5d6c747))
- *(db)* Remove redundant created_at from game_sessions and savedata ([b4df397](https://github.com/huoshen80/ReinaManager/commit/b4df3974e10e5e9fb8343be3815e1e586f35b676))


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



## [0.18.2](https://github.com/huoshen80/ReinaManager/compare/v0.18.1...v0.18.2) (2026-04-02)


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



## [0.12.0](https://github.com/huoshen80/ReinaManager/compare/v0.11.0...v0.12.0) (2025-12-06)

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
