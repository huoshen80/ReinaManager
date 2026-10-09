const { createHash, createPublicKey, randomUUID, verify } = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function required(name) {
	const value = process.env[name];
	if (!value) throw new Error(`缺少 ${name}`);
	return value;
}

function selectArtifacts(artifacts, prefix, targets, attempt) {
	// 失败任务重跑时，成功的上游任务不会重跑；按架构选择本次运行已有的最新产物。
	return targets.map((target) => {
		const suffix = `-${target}`;
		const candidates = artifacts.flatMap((artifact) => {
			if (artifact.expired || !artifact.name.startsWith(prefix) || !artifact.name.endsWith(suffix)) return [];
			const value = artifact.name.slice(prefix.length, -suffix.length);
			if (!/^\d+$/.test(value) || Number(value) > attempt) return [];
			return [{ ...artifact, attempt: Number(value) }];
		}).sort((a, b) => b.attempt - a.attempt || b.id - a.id);
		if (!candidates.length) throw new Error(`缺少可用产物：${prefix}<attempt>${suffix}`);
		return candidates[0];
	});
}

function verifyUpdater(file, signatureFile, publicKey) {
	// Tauri 对 minisign 文本再做一层 Base64 编码；同时校验文件签名和可信注释。
	const keyLines = Buffer.from(publicKey.trim(), "base64").toString("utf8").trim().split(/\r?\n/);
	const sigLines = Buffer.from(fs.readFileSync(signatureFile, "utf8").trim(), "base64").toString("utf8").trim().split(/\r?\n/);
	const key = Buffer.from(keyLines[1] || "", "base64");
	const signature = Buffer.from(sigLines[1] || "", "base64");
	if (key.length !== 42 || signature.length !== 74 || !key.subarray(2, 10).equals(signature.subarray(2, 10))) {
		throw new Error("更新签名与测试公钥不匹配。");
	}
	const algorithm = signature.subarray(0, 2).toString("ascii");
	const bytes = fs.readFileSync(file);
	if (algorithm !== "ED" && algorithm !== "Ed") throw new Error("不支持的 minisign 算法。");
	const message = algorithm === "ED" ? createHash("blake2b512").update(bytes).digest() : bytes;
	const publicKeyObject = createPublicKey({
		key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), key.subarray(10)]),
		format: "der",
		type: "spki",
	});
	const trustedPrefix = "trusted comment: ";
	if (!sigLines[2]?.startsWith(trustedPrefix)) throw new Error("更新签名缺少可信注释。");
	const trustedComment = sigLines[2].slice(trustedPrefix.length);
	if (!verify(null, message, publicKeyObject, signature.subarray(10)) ||
		!verify(null, Buffer.concat([signature.subarray(10), Buffer.from(trustedComment)]), publicKeyObject, Buffer.from(sigLines[3] || "", "base64"))) {
		throw new Error("更新文件或签名已被修改，验签失败。");
	}
	return trustedComment;
}

function sha256(file) {
	return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function prepare() {
	const test = process.env.SIGNPATH_TEST_MODE === "true";
	if (test && process.env.GITHUB_REF !== "refs/heads/signpath-test") throw new Error("临时更新密钥仅用于测试分支。");
	const targets = {
		"x86_64-pc-windows-msvc": "win_x64",
		"aarch64-pc-windows-msvc": "win_arm64",
		"x86_64-unknown-linux-gnu": "linux_x64",
		"aarch64-unknown-linux-gnu": "linux_arm64",
	};
	const short = targets[required("RUST_TARGET")];
	if (!short) throw new Error("不支持的构建目标。");
	const output = path.join(required("GITHUB_WORKSPACE"), "signpath-output");
	fs.mkdirSync(path.join(output, "signing"), { recursive: true });
	const config = {};
	const base = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8"));
	let publicKey = base.plugins.updater.pubkey;
	const environment = [];
	if (test) {
		const key = path.join(required("RUNNER_TEMP"), "signpath-updater-test.key");
		const sharedPublicKey = process.env.SIGNPATH_TEST_UPDATER_PUBLIC_KEY;
		if (sharedPublicKey) {
			// 分阶段 Release 只共享测试公钥；私钥来自 GitHub Secret，不随构建产物传递。
			publicKey = sharedPublicKey.trim();
		} else {
			// 捕获生成器输出，不把私钥打印到日志，也不上传 runner 临时目录。
			const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
			const result = spawnSync(command, ["tauri", "signer", "generate", "--ci", "-p", "signpath-test-only", "-w", key], {
				encoding: "utf8", shell: process.platform === "win32", windowsHide: true,
		});
		if (result.status !== 0 || !fs.existsSync(`${key}.pub`)) throw new Error("生成临时更新密钥失败。");
		console.log(`::add-mask::${fs.readFileSync(key, "utf8").trim()}`);
		publicKey = fs.readFileSync(`${key}.pub`, "utf8").trim();
		environment.push(`TAURI_SIGNING_PRIVATE_KEY=${key}`, "TAURI_SIGNING_PRIVATE_KEY_PASSWORD=signpath-test-only");
		}
		config.identifier = "com.reinamanager.signpath-test";
		config.bundle = { createUpdaterArtifacts: true };
		config.plugins = { updater: {
			pubkey: publicKey,
			endpoints: [`https://github.com/${required("GITHUB_REPOSITORY")}/releases/download/${process.env.RELEASE_TAG || `signpath-test-${required("GITHUB_RUN_ID")}-${required("GITHUB_RUN_ATTEMPT")}`}/latest.json`],
		} };
	}
	if (short.startsWith("win_") && process.env.SIGNPATH_SIGNING_POLICY) {
		config.bundle = { ...config.bundle, windows: { signCommand: {
			cmd: process.env.SIGNPATH_PWSH_PATH || "pwsh", args: ["-NoProfile", "-File", path.join(__dirname, "signpath-test.ps1"), "-Mode", "Sign", "-FilePath", "%1"],
		} } };
	}
	// 分阶段打包期间不生成更新签名，等安装器外层签名完成后统一生成。
	if (["capture", "restore"].includes(process.env.SIGNPATH_PHASE)) config.bundle = { ...config.bundle, createUpdaterArtifacts: false };
	const configFile = path.join(required("RUNNER_TEMP"), `signpath-${short}.tauri.json`);
	fs.writeFileSync(configFile, JSON.stringify(config));
	fs.writeFileSync(path.join(output, `updater-public-key-${short}.txt`), publicKey);
	environment.push(`TAURI_CONFIG_ARGS=--config "${configFile}"`);
	fs.appendFileSync(required("GITHUB_ENV"), `${environment.join("\n")}\n`);
	console.log(`已准备 ${short} 配置；更新密钥：${test ? "临时测试密钥" : "正式配置"}，代码签名：${short.startsWith("win_") ? process.env.SIGNPATH_SIGNING_POLICY || "未启用" : "不适用"}`);
	return configFile;
}

const windowsTargets = ["x86_64-pc-windows-msvc", "aarch64-pc-windows-msvc"];

function stageDirectory(target = required("RUST_TARGET")) {
	if (!windowsTargets.includes(target)) throw new Error("未知 Windows 构建目标。");
	return path.join(required("GITHUB_WORKSPACE"), "signpath-output", "staging", target);
}

function resourceHashes(directory) {
	return fs.readdirSync(directory, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => {
		const file = path.join(entry.parentPath, entry.name);
		return { name: path.relative(directory, file), sha256: sha256(file) };
	}).sort((a, b) => a.name.localeCompare(b.name));
}

function loadStage(target) {
	const stage = stageDirectory(target);
	const workspace = required("GITHUB_WORKSPACE");
	const manifest = JSON.parse(fs.readFileSync(path.join(stage, "manifest.json"), "utf8"));
	const commit = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true });
	// Tauri 从 src-tauri 执行签名钩子，项目配置必须按工作区根目录定位。
	const publicKey = process.env.SIGNPATH_TEST_MODE === "true" ? required("SIGNPATH_TEST_UPDATER_PUBLIC_KEY").trim() : JSON.parse(fs.readFileSync(path.join(workspace, "src-tauri", "tauri.conf.json"), "utf8")).plugins.updater.pubkey;
	if (commit.status !== 0 || manifest.commit !== commit.stdout.trim() || manifest.repository !== required("GITHUB_REPOSITORY") || manifest.target !== target || manifest.version !== JSON.parse(fs.readFileSync(path.join(workspace, "package.json"), "utf8")).version || manifest.publicKey !== publicKey) {
		throw new Error("构建产物的源码、仓库、版本或目标不一致。");
	}
	if (sha256(path.join(stage, "ReinaManager.exe")) !== manifest.inner.find((entry) => entry.role === "portable-main")?.unsignedSha256 || JSON.stringify(resourceHashes(path.join(stage, "resources"))) !== JSON.stringify(manifest.resources)) {
		throw new Error("原始主程序或资源文件在交接时发生变化。");
	}
	return manifest;
}

function signingHook(file) {
	const stage = stageDirectory();
	const extension = path.extname(file).toLowerCase();
	// 安装器外层必须等内层签名并重新打包后，再汇总到第二轮。
	if (extension === ".msi" || file.includes(`${path.sep}bundle${path.sep}nsis${path.sep}`)) return;
	const hash = sha256(file);
	if (process.env.SIGNPATH_PHASE === "capture") {
		const directory = path.join(stage, "captured");
		fs.mkdirSync(directory, { recursive: true });
		const kind = path.basename(file) === "ReinaManager.exe" ? "main" : "uninstaller";
		fs.copyFileSync(file, path.join(directory, `${kind}-${hash}.exe`));
		console.log(`收集待签名 ${kind}：${hash}`);
		return;
	}
	const manifest = loadStage(required("RUST_TARGET"));
	const entry = manifest.inner.find((entry) => entry.unsignedSha256 === hash);
	if (!entry) throw new Error(`重新打包产生了未提交签名的内层文件：${file}，SHA-256：${hash}；停止，不新增请求。`);
	const signed = path.join(stage, "inner", entry.name);
	const report = JSON.parse(fs.readFileSync(path.join(stage, "signed-inner.json"), "utf8")).find((report) => report.role === entry.role);
	if (!report || sha256(signed) !== report.signedSha256) throw new Error("缓存签名文件被修改。");
	fs.copyFileSync(signed, file);
	console.log(`复用已签文件：${entry.role}，原始 SHA-256 一致。`);
}

function collectStage() {
	const target = required("RUST_TARGET");
	const stage = stageDirectory(target);
	const binary = path.join(required("GITHUB_WORKSPACE"), "src-tauri", "target", target, "release", "ReinaManager.exe");
	const original = fs.readFileSync(binary);
	const markerOffset = original.indexOf(Buffer.from("__TAURI_BUNDLE_TYPE_VAR_UNK"));
	if (markerOffset < 0) throw new Error("原始主程序缺少 Tauri 安装类型标记。");
	fs.mkdirSync(path.join(stage, "inner"), { recursive: true });
	const captured = fs.readdirSync(path.join(stage, "captured"));
	const inner = captured.map((name) => {
		const file = path.join(stage, "captured", name);
		const marker = fs.readFileSync(file).subarray(markerOffset, markerOffset + Buffer.byteLength("__TAURI_BUNDLE_TYPE_VAR_UNK")).toString("ascii");
		const role = name.startsWith("uninstaller-") ? "uninstaller" : marker === "__TAURI_BUNDLE_TYPE_VAR_MSI" ? "msi-main" : marker === "__TAURI_BUNDLE_TYPE_VAR_NSS" ? "nsis-main" : null;
		if (!role) throw new Error("收集到未知安装类型的主程序。");
		fs.copyFileSync(file, path.join(stage, "inner", `${role}.exe`));
		return { name: `${role}.exe`, role, unsignedSha256: sha256(file) };
	});
	fs.copyFileSync(binary, path.join(stage, "inner", "portable-main.exe"));
	inner.push({ name: "portable-main.exe", role: "portable-main", unsignedSha256: sha256(binary) });
	if (inner.length !== 4 || new Set(inner.map((entry) => entry.role)).size !== 4) throw new Error("必须收集两种安装主程序、便携主程序和唯一卸载器。");
	fs.copyFileSync(binary, path.join(stage, "ReinaManager.exe"));
	fs.cpSync(path.join(required("GITHUB_WORKSPACE"), "src-tauri", "target", "7zip"), path.join(stage, "resources"), { recursive: true });
	const commit = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true });
	if (commit.status !== 0) throw new Error("无法读取源码提交。");
	const short = target.startsWith("x86_64") ? "win_x64" : "win_arm64";
	const publicKey = fs.readFileSync(path.join(required("GITHUB_WORKSPACE"), "signpath-output", `updater-public-key-${short}.txt`), "utf8").trim();
	fs.writeFileSync(path.join(stage, "manifest.json"), JSON.stringify({ repository: required("GITHUB_REPOSITORY"), commit: commit.stdout.trim(), target, version: JSON.parse(fs.readFileSync("package.json", "utf8")).version, publicKey, inner, resources: resourceHashes(path.join(stage, "resources")) }, null, 2));
	console.log(`已收集 ${target} 的四个内层签名文件；未提交签名请求。`);
}

async function runTauri(args, env = process.env) {
	await new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [require.resolve(process.env.TAURI_CLI_MODULE || "@tauri-apps/cli/tauri.js"), ...args], { env, stdio: "inherit", windowsHide: true });
		child.on("error", reject);
		child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`Tauri ${args[0]} 失败，退出码：${code}`)));
	});
}

function batchFile(kind) {
	if (!["inner", "installers"].includes(kind)) throw new Error("未知批量签名阶段。");
	return path.join(required("GITHUB_WORKSPACE"), "signpath-output", "signing", `batch-${kind}.json`);
}

function prepareBatch(kind) {
	let entries;
	if (kind === "inner") {
		entries = windowsTargets.map(loadStage).flatMap((manifest) => {
			if (manifest.inner.length !== 4 || new Set(manifest.inner.map((entry) => entry.role)).size !== 4 || !["msi-main", "nsis-main", "portable-main", "uninstaller"].every((role) => manifest.inner.some((entry) => entry.role === role && entry.name === `${role}.exe`))) {
				throw new Error("内层签名集合不完整或包含未知文件。");
			}
			return manifest.inner.map((entry) => {
				const file = path.join(stageDirectory(manifest.target), "inner", entry.name);
				if (sha256(file) !== entry.unsignedSha256) throw new Error("待签名内层文件哈希不匹配。");
				return { file, name: `${manifest.target}/inner/${entry.name}`, role: entry.role, target: manifest.target };
			});
		});
	} else if (kind === "installers") {
		entries = windowsTargets.flatMap((target) => ["msi", "nsis"].map((format) => {
			const directory = path.join(required("GITHUB_WORKSPACE"), "src-tauri", "target", target, "release", "bundle", format);
			const extension = format === "msi" ? ".msi" : ".exe";
			const files = fs.readdirSync(directory).filter((name) => name.endsWith(extension));
			if (files.length !== 1) throw new Error(`预期唯一 ${target} ${format} 安装器。`);
			return { file: path.join(directory, files[0]), name: `${target}/installers/ReinaManager${extension}`, role: `${format}-installer`, target };
		}));
	}
	const report = batchFile(kind);
	const directory = path.join(required("GITHUB_WORKSPACE"), "signpath-output", `unsigned-${kind}`);
	for (const entry of entries) {
		entry.unsignedSha256 = sha256(entry.file);
		const file = path.join(directory, entry.name);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.copyFileSync(entry.file, file);
	}
	fs.mkdirSync(path.dirname(report), { recursive: true });
	fs.writeFileSync(report.replace(".json", "-inputs.json"), JSON.stringify(entries, null, 2));
	console.log(`已准备 ${entries.length} 个 ${kind} 文件，由工作流提交一个签名请求。`);
}

function acceptBatch(kind, signedDirectory) {
	const reportFile = batchFile(kind);
	const entries = JSON.parse(fs.readFileSync(reportFile.replace(".json", "-inputs.json"), "utf8"));
	const request = {
		policy: required("SIGNPATH_SIGNING_POLICY"),
		configuration: required("SIGNPATH_BATCH_ARTIFACT_CONFIGURATION_SLUG"),
		unsignedArtifactId: Number(required("SIGNPATH_UNSIGNED_ARTIFACT_ID")),
		signingRequestId: required("SIGNPATH_REQUEST_ID"),
		signingRequestUrl: required("SIGNPATH_REQUEST_URL"),
	};
	const files = entries.map((entry) => {
		const signed = path.join(signedDirectory, entry.name);
		if (sha256(entry.file) !== entry.unsignedSha256) throw new Error("待签名文件在提交后发生变化。");
		if (!fs.existsSync(signed) || sha256(signed) === entry.unsignedSha256) throw new Error(`签名结果缺少文件或未改变文件：${entry.name}`);
		fs.copyFileSync(signed, entry.file);
		return { ...request, file: path.relative(required("GITHUB_WORKSPACE"), entry.file), role: entry.role, target: entry.target, unsignedSha256: entry.unsignedSha256, signedSha256: sha256(entry.file) };
	});
	fs.writeFileSync(reportFile, JSON.stringify({ ...request, files }, null, 2));
	for (const target of windowsTargets) {
		if (kind === "inner") {
			fs.writeFileSync(path.join(stageDirectory(target), "signed-inner.json"), JSON.stringify(files.filter((file) => file.target === target), null, 2));
		} else {
			const inner = JSON.parse(fs.readFileSync(batchFile("inner"), "utf8")).files;
			const directory = path.join(path.dirname(reportFile), target);
			fs.mkdirSync(directory, { recursive: true });
			for (const file of [...inner, ...files].filter((file) => file.target === target)) fs.writeFileSync(path.join(directory, `${file.role}.json`), JSON.stringify(file, null, 2));
			process.env.RUST_TARGET = target;
			signingHook(path.join(required("GITHUB_WORKSPACE"), "src-tauri", "target", target, "release", "ReinaManager.exe"));
		}
	}
	console.log(`已接收 ${files.length} 个签名文件，请求：${request.signingRequestId}`);
}

async function repackage() {
	for (const target of windowsTargets) {
		loadStage(target);
		process.env.RUST_TARGET = target;
		process.env.SIGNPATH_PHASE = "restore";
		const config = prepare();
		const stage = stageDirectory(target);
		const release = path.join(required("GITHUB_WORKSPACE"), "src-tauri", "target", target, "release");
		fs.mkdirSync(release, { recursive: true });
		fs.copyFileSync(path.join(stage, "ReinaManager.exe"), path.join(release, "ReinaManager.exe"));
		fs.cpSync(path.join(stage, "resources"), path.join(required("GITHUB_WORKSPACE"), "src-tauri", "target", "7zip"), { recursive: true });
		// 只重新打包，不重新编译；保留 Tauri 对不同安装类型的标记。
		await runTauri(["bundle", "--verbose", "--target", target, "--config", config]);
	}
}

async function signBundles() {
	// 安装器外层签名完成后，才对最终文件字节生成更新签名。
	const key = required("TAURI_SIGNING_PRIVATE_KEY");
	const env = { ...process.env };
	if (fs.existsSync(key)) { env.TAURI_SIGNING_PRIVATE_KEY_PATH = key; delete env.TAURI_SIGNING_PRIVATE_KEY; }
	const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
	for (const target of windowsTargets) {
		for (const kind of ["msi", "nsis"]) {
			const directory = path.join(required("GITHUB_WORKSPACE"), "src-tauri", "target", target, "release", "bundle", kind);
			const files = fs.readdirSync(directory).filter((file) => file.endsWith(kind === "msi" ? ".msi" : ".exe"));
			if (files.length !== 1) throw new Error("最终安装器数量不正确。");
			await runTauri(["signer", "sign", "--app-version", version, path.join(directory, files[0])], env);
		}
	}
}

function updaterAssets(version) {
	const windowsOnly = process.env.SIGNPATH_WINDOWS_ONLY === "true";
	if (windowsOnly && process.env.SIGNPATH_TEST_MODE !== "true") throw new Error("仅测试分支允许跳过 Linux 发布验证。");
	const assets = [];
	for (const [arch, suffix] of [["x86_64", "x64"], ["aarch64", "arm64"]]) {
		const msi = `ReinaManager_${version}_${suffix}_en-US.msi`;
		// 保留原 Tauri Action 的默认 MSI 目标和独立 MSI／NSIS 更新目标。
		assets.push([`windows-${arch}`, msi], [`windows-${arch}-msi`, msi], [`windows-${arch}-nsis`, `ReinaManager_${version}_${suffix}-setup.exe`]);
		if (!windowsOnly) {
			const appImage = `ReinaManager_${version}_${arch === "x86_64" ? "amd64" : "aarch64"}.AppImage`;
			assets.push([`linux-${arch}`, appImage], [`linux-${arch}-appimage`, appImage],
				[`linux-${arch}-deb`, `ReinaManager_${version}_${arch === "x86_64" ? "amd64" : "arm64"}.deb`],
				[`linux-${arch}-rpm`, `ReinaManager-${version}-1.${arch}.rpm`]);
		}
	}
	return assets;
}

function generateUpdater(directory) {
	const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
	const platforms = Object.fromEntries(updaterAssets(version).map(([platform, filename]) => {
		if (!fs.existsSync(path.join(directory, filename))) throw new Error(`Release 缺少更新文件：${filename}`);
		return [platform, {
			url: `https://github.com/${required("GITHUB_REPOSITORY")}/releases/download/${required("RELEASE_TAG")}/${encodeURIComponent(filename)}`,
			signature: fs.readFileSync(path.join(directory, `${filename}.sig`), "utf8").trim(),
		}];
	}));
	const date = required("RELEASE_DATE");
	if (Number.isNaN(Date.parse(date))) throw new Error("无效的 Release 发布时间。");
	fs.writeFileSync(path.join(directory, "latest.json"), JSON.stringify({ version, notes: required("RELEASE_NOTES"), pub_date: date, platforms }, null, 2));
	console.log(`已统一生成更新清单：${Object.keys(platforms).length} 个平台目标。`);
}

function verifyRelease(directory) {
	const manifest = JSON.parse(fs.readFileSync(path.join(directory, "latest.json"), "utf8"));
	const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
	if (manifest.version !== version) throw new Error("更新清单版本不匹配。");
	if (process.env.SIGNPATH_BATCH_MODE === "true") {
		const reports = ["win_x64", "win_arm64"].map((short) => JSON.parse(fs.readFileSync(path.join(directory, `signature-report-${short}.json`), "utf8")));
		const requests = reports.map((report) => [...new Set(report.signing.map((entry) => entry.signingRequestId))].sort());
		if (requests.some((ids) => ids.length !== 2) || JSON.stringify(requests[0]) !== JSON.stringify(requests[1])) throw new Error("两个架构没有共享同一组两个签名请求。");
		for (const report of reports) {
			if (report.version !== version || report.repository !== required("GITHUB_REPOSITORY") || report.signing.length !== 6) throw new Error("签名报告与发布不一致。");
			for (const file of report.files) {
				if (sha256(path.join(directory, file.name)).toUpperCase() !== file.sha256.toUpperCase()) throw new Error(`Release 资产与签名验证报告不一致：${file.name}`);
			}
		}
		console.log(`两轮批量签名验证通过：两个架构共 ${requests[0].length} 个不同请求。`);
	}
	for (const [platform] of updaterAssets(version)) {
		if (!manifest.platforms[platform]) throw new Error(`更新清单缺少 ${platform}`);
	}
	const formalKey = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8")).plugins.updater.pubkey;
	for (const [platform, entry] of Object.entries(manifest.platforms)) {
		const match = platform.match(/^(windows|linux)-(x86_64|aarch64)(?:-|$)/);
		if (!match) throw new Error(`未知更新平台：${platform}`);
		const short = `${match[1] === "windows" ? "win" : "linux"}_${match[2] === "x86_64" ? "x64" : "arm64"}`;
		const url = new URL(entry.url);
		const expected = `https://github.com/${required("GITHUB_REPOSITORY")}/releases/download/${required("RELEASE_TAG")}/`;
		if (!url.href.startsWith(expected)) throw new Error(`更新清单引用了其他发布地址：${platform}`);
		const filename = decodeURIComponent(path.basename(url.pathname));
		const file = path.join(directory, filename);
		if (!fs.existsSync(file)) throw new Error(`Release 缺少更新文件：${filename}`);
		const keyFile = path.join(directory, `updater-public-key-${short}.txt`);
		const key = process.env.SIGNPATH_TEST_MODE === "true" ? fs.readFileSync(keyFile, "utf8") : formalKey;
		const signature = path.join(required("RUNNER_TEMP"), `release-${randomUUID()}.sig`);
		fs.writeFileSync(signature, entry.signature);
		try { verifyUpdater(file, signature, key); } finally { fs.unlinkSync(signature); }
		console.log(`Release 更新资产验证通过：${platform} -> ${filename}`);
	}
}

if (require.main === module) {
	const [mode, ...args] = process.argv.slice(2);
	Promise.resolve().then(() => {
		if (mode === "hook") return signingHook(path.resolve(args[0]));
		if (mode === "collect-stage") return collectStage();
		if (mode === "prepare-batch") return prepareBatch(args[0]);
		if (mode === "accept-batch") return acceptBatch(args[0], path.resolve(args[1]));
		if (mode === "repackage") return repackage();
		if (mode === "sign-bundles") return signBundles();
		if (mode === "generate-updater") return generateUpdater(path.resolve(args[0]));
		if (mode === "cli-version") {
			const lock = fs.readFileSync("pnpm-lock.yaml", "utf8");
			const version = lock.match(/\s+'@tauri-apps\/cli':\r?\n\s+specifier:[^\n]+\r?\n\s+version: ([^\s]+)/)?.[1];
			if (!version || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error("无法读取锁定的 Tauri CLI 版本。");
			console.log(version);
			return;
		}
		if (mode === "prepare") return prepare();
		if (mode === "verify-release") return verifyRelease(path.resolve(args[0]));
		if (mode === "verify-update") {
			const publicKey = fs.readFileSync(args[2], "utf8");
			verifyUpdater(args[0], args[1], publicKey);
			console.log(`更新签名验证通过：${path.basename(args[0])}`);
			// 确认损坏文件不会被接受，而不是仅检查 .sig 文件存在。
			const tampered = path.join(required("RUNNER_TEMP"), `tampered-${randomUUID()}`);
			fs.copyFileSync(args[0], tampered);
			fs.appendFileSync(tampered, "tampered");
			let rejected = false;
			try { verifyUpdater(tampered, args[1], publicKey); } catch { rejected = true; }
			fs.unlinkSync(tampered);
			if (!rejected) throw new Error("损坏文件未被更新验签拒绝。");
			return;
		}
		throw new Error("未知操作。");
	}).catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { verifyUpdater, selectArtifacts, updaterAssets, generateUpdater };
