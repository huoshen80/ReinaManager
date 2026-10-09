# SignPath 测试签名

`.github/workflows/signpath-test.yml` 在 `signpath-test` 分支收到 push 时运行，只构建 Windows x64 主程序并提交给 `test-signing` 策略。签名完成后生成包含内置 7-Zip 和独立数据库目录的便携包，不创建 GitHub Release。

## GitHub 配置

先安装 [SignPath GitHub App](https://github.com/apps/signpath)，并授权访问 `huoshen80/ReinaManager`。可以选择 Only select repositories，只勾选本仓库。若已经安装，检查安装是否被暂停、授权仓库列表是否包含本仓库。签名连接器进行 GitHub App 校验时，API Token 不能替代此项授权。

SignPath 后台还需将 GitHub.com Trusted Build System 关联到当前项目。

在仓库的 Settings → Secrets and variables → Actions 中配置仓库级值：

| 类型 | 名称 | 内容 |
| --- | --- | --- |
| Secret | `SIGNPATH_API_TOKEN` | 有 `test-signing` 提交权限的 SignPath API Token |
| Variable | `SIGNPATH_ORGANIZATION_ID` | SignPath 组织 UUID |
| Variable | `SIGNPATH_PROJECT_SLUG` | SignPath 项目的实际 slug，不能用显示名称替代 |
| Variable，可选 | `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG` | 匹配下面产物结构的配置 slug；留空时使用项目默认配置 |
| Secret，可选 | `BGM_APP_SECRET` | Bangumi OAuth 所需的应用密钥；缺失时应用可以构建，但不能验证对应登录功能 |

测试 job 不引用 `TAURI_KEY` environment，避免该环境的受保护分支限制阻止测试。环境中的 Secrets 不会自动提供给本 workflow。主程序测试不生成自动更新 `.sig`，无需设置 Tauri 更新私钥。

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

仅把主程序交给 SignPath 签名，内置 7-Zip 等第三方资源在签名后加入便携包，沿用上游文件及许可证。

## 运行和验证

将测试 workflow 提交并推送到 `signpath-test` 后，通过 Actions 中的 `SignPath Test (Windows x64)` 查看运行记录。首次触发使用 push，不依赖默认分支中的手动运行入口。

若提交签名时出现 `Failed to retrieve GitHub App token`，先检查上面的 App 安装和仓库授权，再在原运行记录中选择 Re-run failed jobs。该错误发生在签名提交阶段，已上传的 unsigned Artifact 仍是未签名程序。

签名通过后下载名称以 `signpath-test-portable` 结尾的 Artifact，解压并运行 `ReinaManager.exe`。同包中的 `signature-report.json` 和 workflow Summary 记录源码提交、签名请求、证书信息和文件哈希，可用于提交 SignPath 验证。

SignPath 返回的主程序会先上传为名称以 `signpath-signed` 结尾的 Artifact，即使后续验证失败，也能保留签名结果用于诊断；该单文件产物不包含完整便携版资源。

产物名称包含 `github.run_attempt`，同一运行的不同尝试分别保存，不会因为重跑时上传同名产物而冲突。GitHub 的 Re-run failed jobs 会从该 job 的第一步重新执行，不会从失败的签名步骤单独续跑。

workflow 要求主程序存在 Authenticode 签名。若签名因自签名测试证书不受信任而返回 `NotTrusted` 或 `UnknownError`，仅在临时 CI runner 的当前用户根证书存储中导入该证书的公钥，再要求 Authenticode 验证结果为 `Valid`，最后移除本步骤添加的证书。其他错误或重新验证失败仍会使 job 失败，不会直接放行 `UnknownError`。

报告同时记录原始签名状态、验证状态及是否使用临时测试证书信任。本次验证不证明用户系统信任该证书，程序启动和具体功能仍需下载后验证。签名或验证阶段失败时仍保存 Rust 依赖缓存，避免后续测试重复冷编译。

本测试只验证主程序签名。正式发布还需处理安装包签名，并在安装包最后一次修改后重新生成 Tauri 更新 `.sig` 和 `latest.json` 中的签名。

参考：[SignPath GitHub 接入](https://docs.signpath.io/trusted-build-systems/github)、[产物结构](https://docs.signpath.io/artifact-configuration/syntax)、[测试证书](https://docs.signpath.io/managing-certificates)。
