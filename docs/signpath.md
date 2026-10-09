# SignPath 测试签名

当前 `signpath-test` 分支在现有 `release.yml` 上接入 SignPath，`build.yml` 不接入代码签名，保留 Linux x64/ARM64、Windows x64/ARM64 的完整构建矩阵；日常 Build 和 Linux Release 沿用 Tauri Action。未新增 CI workflow。原 `signpath-test.yml` 保留为手动单 EXE 诊断入口，已提交审核的历史运行与签名请求不变。

## GitHub 配置

先安装 [SignPath GitHub App](https://github.com/apps/signpath)，并授权访问 `huoshen80/ReinaManager`。可以选择 Only select repositories，只勾选本仓库。若已经安装，检查安装是否被暂停、授权仓库列表是否包含本仓库。签名连接器进行 GitHub App 校验时，API Token 不能替代此项授权。

SignPath 后台还需将 GitHub.com Trusted Build System 关联到当前项目。

在仓库的 Settings → Secrets and variables → Actions 中配置仓库级值：

| 类型 | 名称 | 内容 |
| --- | --- | --- |
| Secret | `SIGNPATH_API_TOKEN` | 有 `test-signing` 提交权限的 SignPath API Token |
| Variable | `SIGNPATH_ORGANIZATION_ID` | SignPath 组织 UUID |
| Variable | `SIGNPATH_PROJECT_SLUG` | SignPath 项目的实际 slug，不能用显示名称替代 |
| Variable，旧版逐文件签名 | `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG` | 原 `reina-exe` 配置；单 EXE 诊断入口可以留空使用默认配置 |
| Variable，旧版逐文件签名 | `SIGNPATH_MSI_ARTIFACT_CONFIGURATION_SLUG` | 原 `reina-msi` 配置，保留既有审核记录 |
| Variable，批量签名必需 | `SIGNPATH_BATCH_ARTIFACT_CONFIGURATION_SLUG` | 新配置 `reina-batch` |
| Variable，分阶段 Windows 测试必需 | `SIGNPATH_TEST_UPDATER_PUBLIC_KEY` | 与测试私钥对应的 Tauri 更新公钥 |
| Secret，分阶段 Windows 测试必需 | `SIGNPATH_TEST_UPDATER_PRIVATE_KEY` | 仅测试分支使用的更新私钥，密码为 `signpath-test-only`；不使用正式更新密钥 |
| Secret，可选 | `BGM_APP_SECRET` | Bangumi OAuth 所需的应用密钥；缺失时应用可以构建，但不能验证对应登录功能 |

测试 job 不引用 `TAURI_KEY` environment，避免该环境的受保护分支限制阻止测试。环境中的 Secrets 不会自动提供给本 workflow。分阶段 Windows Release 使用存放在仓库 Secret 中的共享测试更新私钥；Build 和 Linux 测试仍在 runner 内生成临时密钥。单 EXE 诊断入口不生成自动更新 `.sig`。

## SignPath 产物配置

待签名 Artifact 使用 `actions/upload-artifact` 默认的 ZIP 格式，根目录仅包含 `ReinaManager.exe`。SignPath 后台选用的 Artifact Configuration 必须与此结构匹配，例如：

```xml
<artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
  <zip-file>
    <pe-file path="ReinaManager.exe" product-name="ReinaManager">
      <authenticode-sign />
    </pe-file>
  </zip-file>
</artifact-configuration>
```

此示例用于主程序测试。配置需要在 SignPath 后台创建或选用，仅修改本仓库文档不会自动更新后台配置。若现有默认配置要求 MSI、安装程序或额外参数，应创建匹配的主程序测试配置，并设置 `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG`。

签名范围仅包含本项目程序和生成的安装器、卸载器。内置 7-Zip 等第三方资源沿用上游文件及许可证。

## 完整发布链路测试的后台配置

### 两轮批量签名实验

批量实验新增独立配置 `reina-batch`，不修改已提交审核的 `reina-exe` 和 `reina-msi`。在同一项目新增 Artifact Configuration，XML 如下；仓库 Variable 设置 `SIGNPATH_BATCH_ARTIFACT_CONFIGURATION_SLUG=reina-batch`：

```xml
<artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
  <parameters>
    <parameter name="version" required="true" />
  </parameters>
  <zip-file>
    <pe-file-set product-name="ReinaManager" product-version="${version}">
      <include path="*/inner/*.exe" min-matches="0" max-matches="8" />
      <include path="*/installers/ReinaManager.exe" min-matches="0" max-matches="2" />
      <for-each><authenticode-sign /></for-each>
    </pe-file-set>
    <msi-file path="*/installers/ReinaManager.msi" min-matches="0" max-matches="2">
      <authenticode-sign />
    </msi-file>
  </zip-file>
</artifact-configuration>
```

两轮使用同一配置：第一轮只包含两个架构的内层 EXE，第二轮只包含两个架构的安装器。工作流另行检查每轮文件数量、源码提交、版本和 SHA-256，拒绝空集合或缺失目标；不会利用可选匹配跳过必须签名的文件。此配置不重签第三方组件，也不要求 SignPath 拆开 NSIS 安装器。

整轮 Release 共两个请求：先批量签主程序和预生成的卸载器，再重新打包并批量签安装器外层。重新打包时只允许复用与已提交文件的原始 SHA-256 完全一致的内层文件，尤其必须检查 NSIS 卸载器；不一致就停止，不静默增加签名请求。完整测试运行 `38062268548` 已验证此链路。

以下 `reina-msi` 是已通过的旧版逐文件签名配置，批量实验无需修改。它不覆盖已经提交审核的 `reina-exe`。请进入 ReinaManager 项目，在 Artifact Configurations 区域点击 Add，选择 Custom，在同一项目新增 slug 为 `reina-msi` 的 Artifact Configuration，内容如下，并设置仓库 Variable `SIGNPATH_MSI_ARTIFACT_CONFIGURATION_SLUG=reina-msi`：

```xml
<artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
  <zip-file>
    <msi-file path="ReinaManager.msi">
      <authenticode-sign />
    </msi-file>
  </zip-file>
</artifact-configuration>
```

该配置只签 MSI 外层；安装包中的主程序由 Tauri 签名钩子先签名再打包。主程序、NSIS 安装器和卸载器继续使用 `reina-exe`：提交前只规范 ZIP 内的文件名，不修改文件内容或产品元数据。

## 现有 build 和 release 的接入方式

推送 `signpath-test` 会运行现有两个 workflow：

- `Build & Test Common`：沿用原四平台矩阵、devtools、安装包和便携包 Artifact 上传。日常构建不做 Windows Authenticode 签名，仍生成 Tauri 更新签名，不安装 SignPath SDK、不提交签名请求、不增加安装验证 job。测试分支使用临时更新密钥，main 沿用 `TAURI_KEY`，fork PR 沿用不生成更新分发签名的行为。
- `Release`：保留 `prepare`、四平台构建矩阵、原生 Windows 验证、`finalize-release` 和 CDN 步骤。在原流程内新增 `sign-windows` 汇总任务：两个 Windows 构建先用 Tauri 签名钩子收集未签主程序和卸载器；第一轮一次签两个架构的八个内层文件；只调用 `tauri bundle` 重新打包，不重新编译；第二轮一次签四个安装器外层。Windows 构建直接调用官方 Tauri CLI；两轮签名在 YAML 中分别使用官方 SignPath Action，最终更新 `.sig` 在安装器外层签名完成后生成。便携版复用第一轮已签主程序和对应架构的暂存资源，Windows 最终资产使用 GitHub CLI 上传。Linux 保留原 Tauri Action 构建和上传，但不分散生成更新清单；`finalize-release` 汇总生成一次 `latest.json`，保留原 MSI／AppImage 默认目标及 MSI、NSIS、AppImage、DEB、RPM 独立目标。

两个 workflow 均保留完整四平台构建，不以仅 Windows 的测试 job 替代原矩阵。Release 新增 Windows 验证 job 分别在 `windows-latest`、`windows-11-arm` 检查 MSI、NSIS、便携主程序和 7-Zip/Zstd 的架构，执行 MSI 管理提取、NSIS 便携更新（`/REINAPORTABLE /UPDATE`）、标准安装和卸载，检查 Authenticode 和实际更新签名。不会启动应用，不代表已覆盖应用功能或客户端联网自动更新。

测试 Release 用本轮唯一的 `signpath-test-<run_id>-<attempt>`，始终保持 Draft/prerelease，构建来源为本轮远端测试分支提交，不读取本地半成品 main。测试完成后检查 Release 上的完整更新清单和下载资产，要求两个 Linux 平台以及 Windows 两种架构的 MSI/NSIS 更新目标齐全、签名有效。正式发布继续执行原发布和 CDN 步骤；测试分支跳过公开发布和 CDN 改写。

测试分支不引用 `TAURI_KEY`。Windows 的编译和签名属于不同 job，必须使用相同的测试更新公钥；测试私钥保存在 `SIGNPATH_TEST_UPDATER_PRIVATE_KEY`，仅签名任务读取，不输出、不上传，也不进入构建 Artifact。共享密钥可用于后续跨运行更新测试；但当前测试 Release 是 Draft，下载需要登录，本轮仍不验证客户端联网升级。Linux 与日常 Build 继续在 runner 临时目录生成每次运行独立的更新密钥。测试包使用原产品名及部分数据路径语义，只在隔离环境测试，不能覆盖真实安装。

SignPath 直接使用固定提交的官方 v3 Action 和标准 GitHub Artifact 上传步骤，保留来源验证。无需手动安装 Artifact SDK、导出 Action 运行时变量或在 Node 子进程内执行 Action。签名任务只安装锁定版本的 Tauri CLI 和用于读取 Cargo 元数据的工具链，不安装前端依赖、额外 Rust 目标或编译链接器。第三方 DLL、7-Zip 沿用上游内容，不使用本项目证书重签。两个架构的报告保存共享请求 ID、链接和每个文件的原始／已签哈希。原生验证要求主程序和卸载器与对应签名结果一致；最终 Release 检查两个架构共享同一组两个请求，且上传资产与报告哈希一致。更新 `.sig` 必须对应最后一次代码签名后的安装包字节。

合入 main 时保留 Windows 批量签名、重打包和验证步骤；移除测试分支自动触发、测试更新密钥及 Draft 保护的实验条件。正式 Release 使用 `release-signing`（也可通过 `SIGNPATH_SIGNING_POLICY` Variable 指定），需先开通并验证证书、审批和来源限制。SignPath 接入不要求改造正式 main 的 Build。原 Build 的 `条件 && 空字符串 || 禁用更新签名参数` 会错误地禁用所有构建的更新签名，本次将其修正为仅对 fork PR 禁用，这是独立于 SignPath 的既有条件问题；本分支 Build 的额外配置仅用于触发测试分支和绕过测试分支无法访问正式更新密钥的限制。它不签 Authenticode，这不影响应用接收有效的正式更新。

缺少批量配置 slug 或测试更新密钥时 Release 会明确失败，并在创建 Draft 或提交签名请求前停止；Build 默认不做代码签名，因此仍可验证四平台构建。配置检查不等于完整签名通过。

## 更新日志和 Release 固定格式

沿用 `CHANGELOG.md` 中当前版本的完整内容，包括中文折叠区；下载区仍由 `cliff.toml` 生成，保留分隔线、下载徽章、Windows x64／ARM64 安装包及便携包、Linux AppImage／DEB 链接的既有格式。正式下载区与原模板逐字比较通过，默认更新目标继续使用 Windows MSI 和 Linux AppImage，最终清单保留全部十四个平台键。

测试分支按 `package.json` 的实际版本提取更新日志，下载链接指向本轮独立测试 tag；仅 Windows 测试不展示本轮不存在的 Linux 下载链接。创建测试草稿时即写入完整正文，可以直接核对格式。正文通过环境变量传入，避免 Markdown 中的反引号和美元符号被 shell 展开。

正式发布继续根据 alpha／beta／rc／pre tag 或手动输入判断 prerelease，验证通过后解除 Draft 并写入完整正文，随后沿用原 CDN 地址改写。测试保持 Draft，跳过公开发布和 CDN。`latest.json` 由最终任务统一生成，更新说明使用同一份版本日志，签名字段使用最终安装器的 `.sig` 内容。

## 运行和验证

通过 Actions 中的 `Build & Test Common` 和 `Release` 查看运行记录。后台 `reina-batch` 配置完成后可运行批量 Release；可用 `gh workflow run release.yml --ref signpath-test -f tag_name=signpath-test` 手动触发，测试分支会忽略该输入，生成独立测试 tag。单 EXE 诊断入口名为 `SignPath Test (Windows x64)`。

测试分支可以增加输入 `-F signing_probe_only=true`，只执行四平台构建并收集 Windows 内层文件，不提交 SignPath 请求、不完成正式发布。此探测输入对正式分支不生效。签名第一轮完成后额外保存 `windows-signed-inner-<run_id>-<attempt>`，用于在后续打包或外层签名失败时诊断，里面没有更新私钥。

后续仅调试 Windows 签名或打包时，使用 `-f windows_only=true` 跳过不变的 Linux 构建。Windows 两架构的构建、两轮签名、重新打包、原生安装／卸载和最终更新资产验证仍完整执行；最终检查只要求 Windows 更新目标，不拼接旧运行的 Linux 产物。该选项仅对 `signpath-test` 生效，默认完整四平台测试，正式 Release 始终构建 Linux。便携包使用对应架构暂存包中已经校验过的资源。

若提交签名时出现 `Failed to retrieve GitHub App token`，先检查上面的 App 安装和仓库授权，再在原运行记录中选择 Re-run failed jobs。该错误发生在签名提交阶段，已上传的 unsigned Artifact 仍是未签名程序。

完整测试通过后下载 `windows-verified-<run_id>-<attempt>-<rust_target>` Artifact，其中包含便携 ZIP、MSI、NSIS、`.sig`、公钥和 `signature-report-win_<arch>.json`。报告和 Summary 记录源码提交、签名请求、证书信息、文件哈希及原生架构验证，可用于提交 SignPath 验证。单 EXE 诊断入口的历史产物仍使用 `signpath-test-portable`、`signpath-signed` 等后缀。

SignPath 返回的主程序会先上传为名称以 `signpath-signed` 结尾的 Artifact，即使后续验证失败，也能保留签名结果用于诊断；该单文件产物不包含完整便携版资源。

产物名称包含 `github.run_attempt`，同一运行的不同尝试分别保存，不会因为重跑时上传同名产物而冲突。下载时按架构选择当前运行中最新的有效产物，因此仅重跑失败任务时，也能读取此前成功任务的产物；不会混合下载同一架构的多个历史版本。GitHub 的 Re-run failed jobs 会从该 job 的第一步重新执行，不会从失败的签名步骤单独续跑。

workflow 要求主程序存在 Authenticode 签名。若签名因自签名测试证书不受信任而返回 `NotTrusted` 或 `UnknownError`，仅在临时 GitHub 托管 CI runner 的 `Cert:\LocalMachine\Root` 中导入该证书的公钥，再要求 Authenticode 验证结果为 `Valid`，最后移除本步骤添加的证书。托管 Windows runner 具备管理员权限；使用机器存储避免当前用户根证书存储的原生确认弹窗阻塞无人值守任务。其他错误或重新验证失败仍会使 job 失败，不会直接放行 `UnknownError`。

验证步骤在读取签名、导入证书、重新验证和清理证书时分别输出进度日志。单 EXE 诊断的验证步骤设置 3 分钟超时；完整流程的原生验证步骤设置 10 分钟超时，测试安装器各自设置 2 分钟超时；两轮官方签名 Action 分别显示提交、等待和下载进度，每轮最多等待 30 分钟，汇总签名任务最多运行 120 分钟。正式 Foundation 证书的人工批准在 SignPath UI 完成，请求批准后流程自动继续；两轮请求会先后出现。Tauri 默认会隐藏失败签名命令的具体输出，Windows Release 使用 `--verbose` 显示调试输出，签名诊断 Artifact 保存批次输入清单、请求 ID 和文件哈希，官方 Action 日志直接显示在对应签名步骤中。签名失败不自动重跑整个 `tauri build`；应先查看第一条错误再决定重试。GitHub CLI 的完整 job 日志要等 job 结束后才能读取；运行中可展开 Actions 网页上的具体步骤查看实时输出。

报告同时记录原始签名状态、验证状态及是否使用临时测试证书信任。本次验证不证明用户系统信任该证书，程序启动和具体功能仍需下载后验证。签名或验证阶段失败时仍保存 Rust 依赖缓存，避免后续测试重复冷编译。

单 EXE 诊断只验证主程序签名；完整流程覆盖安装包和便携版。正式发布仍需开通并验证正式签名策略与来源限制；更新 `.sig` 必须对应安装包最后一次修改后的字节。

参考：[SignPath GitHub 接入](https://docs.signpath.io/trusted-build-systems/github)、[产物结构](https://docs.signpath.io/artifact-configuration/syntax)、[测试证书](https://docs.signpath.io/managing-certificates)。

## 批量实验的验证边界

完整测试 [Release 38062268548](https://github.com/huoshen80/ReinaManager/actions/runs/38062268548) 使用提交 `c568d5079ac68dbfe41fc8169649cfe0f6453ac0`，四平台构建、两轮批量签名、真实安装模板重新打包、两个 Windows 架构的原生安装／卸载和最终更新资产验证均通过。内层请求为 `589f79fd-52cc-4761-b832-72986342a254`，安装器请求为 `6b3245b8-1a1f-41f4-90d2-bed608adc449`；两个架构共享这两个请求。测试 Release 保持 Draft，未执行公开发布或 CDN 改写，尚未验证生产证书信任或客户端联网升级。

显式编排版本 [Release 38065589770](https://github.com/huoshen80/ReinaManager/actions/runs/38065589770) 使用提交 `dc78f12b24a170b52839d1be60c979cd7ab0bf26`，仅 Windows 两架构构建、原生 SignPath Action 两轮签名、精简工具环境重新打包、便携包、原生安装／卸载及统一生成更新清单均通过。内层请求为 `fb85eb45-c3e4-4d78-bad8-34758c121719`，安装器请求为 `10424444-cf8b-44bd-98a2-0c2f2c646c90`。草稿正文保留当前版本完整日志和既有下载区格式，`latest.json` 更新说明与日志一致；这轮按要求跳过 Linux，正式发布和 CDN 仍未实际执行。

本地 NSIS 预验证改变主程序内容和长度后，预生成卸载器字节保持一致；哈希复用、变化拒绝、缓存篡改拒绝、资源交接完整性和最终安装器的 Tauri 更新签名已经做过本地验证。正式下载区与原模板逐字一致，完整十四个目标的文件名和默认安装类型与完整测试产物一致。`windows_only` 的最终资产检查使用真实产物验证过，同时确认默认完整模式拒绝缺少 Linux、正式模式拒绝跳过 Linux、Windows 模式拒绝缺少 ARM64 NSIS 更新目标。

Windows 暂存 Artifact 包含隐藏资源文件（例如 7-Zip 的 `.build-info`），避免两次打包的资源清单改变。交接时检查原始主程序和完整资源集的哈希。便携包只生成一次，验证 Artifact 和 Release 使用同一份 ZIP，最终报告核对实际上传文件的哈希。

两个请求是保留 NSIS 内外层完整签名、使用文件签名 API 时的实验目标。只签安装器外层不能代替内层签名；当前官方文档没有列出 NSIS 深度签名，因此不将所有未签安装包一次提交作为完整覆盖方案。
