param(
    [Parameter(Mandatory)][ValidateSet('Sign', 'Collect', 'Validate')][string]$Mode,
    [string]$FilePath,
    [string]$AssetsDirectory
)

$ErrorActionPreference = 'Stop'
$repository = Split-Path -Parent $PSScriptRoot
$sourceCommit = (& git -C $repository rev-parse HEAD).Trim()
$helper = Join-Path $PSScriptRoot 'signpath-sign.cjs'
$output = Join-Path $repository 'signpath-output'
$architecture = switch ($env:RUST_TARGET) {
    'x86_64-pc-windows-msvc' { @{ short = 'win_x64'; platform = 'x86_64'; machine = 0x8664 } }
    'aarch64-pc-windows-msvc' { @{ short = 'win_arm64'; platform = 'aarch64'; machine = 0xAA64 } }
    default { throw "不支持的 Windows 测试目标：$env:RUST_TARGET" }
}
$publicKeyName = "updater-public-key-$($architecture.short).txt"
$reportName = "signature-report-$($architecture.short).json"
$signingDirectory = if ($env:SIGNPATH_BATCH_MODE -eq 'true') { Join-Path "$output/signing" $env:RUST_TARGET } else { "$output/signing" }

function Test-SignedFile([string]$Path) {
    Write-Host "读取 Authenticode 签名：$Path"
    $signature = Get-AuthenticodeSignature -LiteralPath $Path
    if ($null -eq $signature.SignerCertificate -or $signature.SignatureType -ne 'Authenticode') {
        throw "文件没有 Authenticode 签名：$Path"
    }
    $initialStatus = $signature.Status.ToString()
    $added = $false
    $root = "Cert:\LocalMachine\Root\$($signature.SignerCertificate.Thumbprint)"
    try {
        if ($initialStatus -ne 'Valid') {
            if ($env:SIGNPATH_SIGNING_POLICY -ne 'test-signing' -or
                $initialStatus -notin @('NotTrusted', 'UnknownError') -or
                $signature.SignerCertificate.Subject -ne $signature.SignerCertificate.Issuer) {
                throw "签名验证失败：$initialStatus，$($signature.StatusMessage)"
            }
            if (-not (Test-Path -LiteralPath $root)) {
                $certificate = Join-Path $env:RUNNER_TEMP "signpath-$($signature.SignerCertificate.Thumbprint).cer"
                Export-Certificate -Cert $signature.SignerCertificate -FilePath $certificate -Type CERT | Out-Null
                Write-Host '在临时托管 runner 中导入测试证书公钥。'
                Import-Certificate -FilePath $certificate -CertStoreLocation 'Cert:\LocalMachine\Root' | Out-Null
                $added = $true
            }
            $signature = Get-AuthenticodeSignature -LiteralPath $Path
        }
        if ($signature.Status.ToString() -ne 'Valid') { throw "重新验签失败：$($signature.StatusMessage)" }
        Write-Host "签名验证通过：$Path"
        return [ordered]@{
            initialStatus = $initialStatus
            status = 'Valid'
            certificateSubject = $signature.SignerCertificate.Subject
            certificateThumbprint = $signature.SignerCertificate.Thumbprint
            temporaryTestCertificateTrust = $added
        }
    } finally {
        if ($added) {
            Write-Host '移除本次验证添加的测试证书。'
            Remove-Item -LiteralPath $root
        }
    }
}

function Invoke-TestInstaller([string]$Program, [string[]]$Arguments) {
    $process = Start-Process -FilePath $Program -ArgumentList $Arguments -PassThru -WindowStyle Hidden
    if (-not $process.WaitForExit(120000)) {
        $process.Kill()
        throw "测试安装器超过 2 分钟：$Program"
    }
    if ($process.ExitCode -notin @(0, 3010)) { throw "测试安装器失败，退出码 $($process.ExitCode)：$Program" }
}

function Test-PeArchitecture([string]$Path) {
    $bytes = [IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -lt 64 -or $bytes[0] -ne 0x4D -or $bytes[1] -ne 0x5A) { throw "无效 PE 文件：$Path" }
    $offset = [BitConverter]::ToUInt32($bytes, 0x3C)
    if ($offset + 6 -gt $bytes.Length -or [BitConverter]::ToUInt32($bytes, $offset) -ne 0x00004550) { throw "无效 PE 头：$Path" }
    $machine = [BitConverter]::ToUInt16($bytes, $offset + 4)
    if ($machine -ne $architecture.machine) { throw "文件架构不符合 $($architecture.short)：$Path" }
    Write-Host "文件架构验证通过：$($architecture.short)，$Path"
}

switch ($Mode) {
    'Sign' {
        $file = (Resolve-Path -LiteralPath $FilePath).Path
        $extension = [IO.Path]::GetExtension($file).ToLowerInvariant()
        # Tauri 还会尝试签名 NSIS 插件和 7-Zip 资源，保留这些第三方文件的原始签名与内容。
        if ($extension -eq '.dll' -or $file -match '[\\/]tools[\\/]7zip[\\/]' -or [IO.Path]::GetFileName($file) -eq '7z.exe') {
            Write-Host "保留第三方组件，不使用本项目证书签名：$file"
            exit 0
        }
        if ($extension -ne '.msi' -and (Get-Item -LiteralPath $file).VersionInfo.ProductName -ne 'ReinaManager') {
            throw "拒绝签名非 ReinaManager 产品：$file"
        }
        if ($env:SIGNPATH_PHASE -in @('capture', 'restore')) {
            & node $helper hook $file
            if ($LASTEXITCODE -ne 0) { throw "批量签名钩子失败：$file" }
            # 外层安装器在第二轮统一签名；恢复阶段要求每个内层文件立即通过验签。
            if ($env:SIGNPATH_PHASE -eq 'restore' -and $extension -ne '.msi' -and $file -notmatch '[\\/]bundle[\\/]nsis[\\/]') {
                $null = Test-SignedFile $file
            }
            exit 0
        }
        throw '签名钩子必须明确指定 capture 或 restore 阶段。'
    }
    'Collect' {
        $version = (Get-Content -LiteralPath (Join-Path $repository 'package.json') -Raw | ConvertFrom-Json).version
        $targetRoot = Join-Path $repository "src-tauri/target/$env:RUST_TARGET/release"
        $assets = if ($env:SIGNPATH_BATCH_MODE -eq 'true') { Join-Path "$output/assets" $env:RUST_TARGET } else { Join-Path $output 'assets' }
        New-Item -ItemType Directory -Path $assets -Force | Out-Null
        foreach ($kind in @('msi', 'nsis')) {
            $extension = if ($kind -eq 'msi') { '*.msi' } else { '*.exe' }
            $installers = @(Get-ChildItem -LiteralPath "$targetRoot/bundle/$kind" -Filter $extension)
            if ($installers.Count -ne 1) { throw "预期恰好一个 $kind 安装器。" }
            $installer = $installers[0]
            if ($env:SIGNPATH_SIGNING_POLICY) { $null = Test-SignedFile $installer.FullName }
            & node $helper verify-update $installer.FullName "$($installer.FullName).sig" "$output/$publicKeyName"
            if ($LASTEXITCODE -ne 0) { throw "$kind 更新签名验证失败。" }
            Copy-Item -LiteralPath $installer.FullName -Destination $assets
            Copy-Item -LiteralPath "$($installer.FullName).sig" -Destination $assets
        }
        # 验证与发布使用同一份 ZIP，避免重新压缩后报告哈希与上传资产不同。
        $portableZip = Join-Path $targetRoot "ReinaManager_${version}_$($architecture.short)-portable.zip"
        if (-not (Test-Path -LiteralPath $portableZip -PathType Leaf)) { throw '缺少已生成的便携包。' }
        Copy-Item -LiteralPath $portableZip -Destination $assets
        Copy-Item -LiteralPath "$output/$publicKeyName" -Destination $assets
        $signing = @(Get-ChildItem -LiteralPath $signingDirectory -Filter '*.json' | ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json })
        $requests = @($signing.signingRequestId | Sort-Object -Unique)
        if ($env:SIGNPATH_BATCH_MODE -eq 'true' -and ($signing.Count -ne 6 -or $requests.Count -ne 2)) { throw '批量实验要求每架构六个签名文件、两个共享请求。' }
        $files = @(Get-ChildItem -LiteralPath $assets -File | ForEach-Object { @{ name = $_.Name; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash } })
        @{ repository = $env:GITHUB_REPOSITORY; commit = $sourceCommit; version = $version; target = $env:RUST_TARGET; testOnly = ($env:SIGNPATH_TEST_MODE -eq 'true'); signing = $signing; signingRequestCount = $requests.Count; files = $files } |
            ConvertTo-Json -Depth 10 | Set-Content -LiteralPath "$assets/$reportName" -Encoding utf8
        "### Windows $($architecture.short) 签名验证`n`n- 签名策略：$env:SIGNPATH_SIGNING_POLICY`n- MSI、NSIS 更新签名：通过，损坏文件已拒绝`n- 签名文件：$($signing.Count)，不同请求：$($requests.Count)（批量模式两个架构共享）`n- 安装包内层验证：由对应架构的 Windows job 执行" >> $env:GITHUB_STEP_SUMMARY
    }
    'Validate' {
        $assets = (Resolve-Path -LiteralPath $AssetsDirectory).Path
        $report = Get-Content -LiteralPath "$assets/$reportName" -Raw | ConvertFrom-Json -AsHashtable
        if ($report.target -ne $env:RUST_TARGET -or $report.commit -ne $sourceCommit) { throw '待验证产物的目标或提交不一致。' }
        $expectedHost = if ($architecture.platform -eq 'aarch64') { 'Arm64' } else { 'X64' }
        if ([Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString() -ne $expectedHost) { throw '必须在与产物匹配的 Windows 架构上验证。' }
        foreach ($entry in $report.files) {
            if ((Get-FileHash -LiteralPath (Join-Path $assets $entry.name) -Algorithm SHA256).Hash -ne $entry.sha256) { throw "产物哈希不一致：$($entry.name)" }
        }
        $msi = @(Get-ChildItem -LiteralPath $assets -Filter '*.msi')
        $nsis = @(Get-ChildItem -LiteralPath $assets -Filter '*.exe')
        $portableZip = @(Get-ChildItem -LiteralPath $assets -Filter '*-portable.zip')
        if ($msi.Count -ne 1 -or $nsis.Count -ne 1 -or $portableZip.Count -ne 1) { throw '缺少唯一的 MSI、NSIS 或便携包。' }
        foreach ($installer in @($msi[0], $nsis[0])) {
            & node $helper verify-update $installer.FullName "$($installer.FullName).sig" "$assets/$publicKeyName"
            if ($LASTEXITCODE -ne 0) { throw '最终安装器更新签名验证失败。' }
        }
        $portable = Join-Path $env:RUNNER_TEMP ('signpath-portable-' + [guid]::NewGuid())
        Expand-Archive -LiteralPath $portableZip[0].FullName -DestinationPath $portable
        foreach ($relative in @('ReinaManager.exe', 'tools/7zip/7z.exe', 'tools/7zip/7z.dll', 'tools/7zip/Codecs/zstd.dll')) { Test-PeArchitecture (Join-Path $portable $relative) }
        $msiExtract = Join-Path $env:RUNNER_TEMP ('signpath-msi-' + [guid]::NewGuid())
        Write-Host '使用 MSI 管理安装提取主程序。'
        Invoke-TestInstaller 'msiexec.exe' @('/a', "`"$($msi[0].FullName)`"", '/qn', "TARGETDIR=`"$msiExtract`"")
        $msiPrograms = @(Get-ChildItem -LiteralPath $msiExtract -Filter 'ReinaManager.exe' -Recurse)
        if ($msiPrograms.Count -ne 1) { throw 'MSI 中未找到唯一主程序。' }
        $nsisExtract = Join-Path $env:RUNNER_TEMP ('signpath-nsis-' + [guid]::NewGuid())
        New-Item -ItemType Directory -Path "$nsisExtract/resources/data" -Force | Out-Null
        Copy-Item -LiteralPath "$portable/ReinaManager.exe" -Destination "$nsisExtract/ReinaManager.exe"
        Write-Host '在匹配架构的 Windows 上执行 NSIS 便携更新分支。'
        Invoke-TestInstaller $nsis[0].FullName @('/REINAPORTABLE', '/UPDATE', '/S', "/D=$nsisExtract")
        $signedHashes = @($report.signing | ForEach-Object { $_.signedSha256.ToUpperInvariant() })
        $verified = @()
        foreach ($entry in @(@{ kind = 'msi'; path = $msiPrograms[0].FullName }, @{ kind = 'nsis'; path = "$nsisExtract/ReinaManager.exe" }, @{ kind = 'portable'; path = "$portable/ReinaManager.exe" })) {
            Test-PeArchitecture $entry.path
            $hash = (Get-FileHash -LiteralPath $entry.path -Algorithm SHA256).Hash
            $validation = $null
            if ($env:SIGNPATH_SIGNING_POLICY) {
                $validation = Test-SignedFile $entry.path
                if ($hash -notin $signedHashes) { throw "$($entry.kind) 主程序与 SignPath 返回文件不一致。" }
                if ($env:SIGNPATH_BATCH_MODE -eq 'true' -and $hash -ne ($report.signing | Where-Object role -eq "$($entry.kind)-main").signedSha256.ToUpperInvariant()) { throw '安装类型主程序与对应签名记录不一致。' }
            }
            $verified += @{ kind = $entry.kind; sha256 = $hash; authenticode = $validation }
        }
        $nsisInstall = Join-Path $env:RUNNER_TEMP ('signpath-install-' + [guid]::NewGuid())
        Write-Host '验证 NSIS 标准静默安装及卸载程序，不传启动应用的 /R 参数。'
        Invoke-TestInstaller $nsis[0].FullName @('/S', "/D=$nsisInstall")
        try {
            Test-PeArchitecture "$nsisInstall/ReinaManager.exe"
            if ($env:SIGNPATH_SIGNING_POLICY) {
                $null = Test-SignedFile "$nsisInstall/ReinaManager.exe"
                $installedHash = (Get-FileHash -LiteralPath "$nsisInstall/ReinaManager.exe" -Algorithm SHA256).Hash
                if ($installedHash -notin $signedHashes) { throw 'NSIS 标准安装主程序与 SignPath 返回文件不一致。' }
            }
            $uninstaller = Join-Path $nsisInstall 'uninstall.exe'
            if (-not (Test-Path -LiteralPath $uninstaller)) { throw '标准安装后缺少 NSIS 卸载程序。' }
            $hash = (Get-FileHash -LiteralPath $uninstaller -Algorithm SHA256).Hash
            $validation = $null
            if ($env:SIGNPATH_SIGNING_POLICY) {
                $validation = Test-SignedFile $uninstaller
                if ($hash -notin $signedHashes) { throw 'NSIS 卸载程序与 SignPath 返回文件不一致。' }
            }
            $verified += @{ kind = 'nsis-uninstaller'; sha256 = $hash; authenticode = $validation }
        } finally {
            if (Test-Path -LiteralPath "$nsisInstall/uninstall.exe") {
                # 从安装目录外执行并禁用卸载器自行复制，确保等待的是实际卸载进程。
                $uninstallCopy = Join-Path $env:RUNNER_TEMP ('signpath-uninstall-' + [guid]::NewGuid() + '.exe')
                Copy-Item -LiteralPath "$nsisInstall/uninstall.exe" -Destination $uninstallCopy
                Invoke-TestInstaller $uninstallCopy @('/S', "_?=$nsisInstall")
            }
        }
        if (Test-Path -LiteralPath "$nsisInstall/ReinaManager.exe") { throw 'NSIS 静默卸载后仍残留主程序。' }
        $report.nativeHost = $expectedHost
        $report.verifiedApplications = $verified
        $report.nsisInstallAndUninstall = 'passed'
        $report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath "$assets/$reportName" -Encoding utf8
        "### Windows $($architecture.short) 原生验证`n`n- 宿主：$expectedHost`n- MSI、NSIS、便携版：主程序架构与内容验证通过`n- NSIS：标准安装、卸载器、静默卸载通过`n- 7-Zip 与 Zstd：架构验证通过`n- 更新签名：通过，损坏文件已拒绝`n- 客户端联网自动更新和应用功能：尚未验证" >> $env:GITHUB_STEP_SUMMARY
    }
}
