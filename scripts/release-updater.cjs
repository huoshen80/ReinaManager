const fs = require("node:fs");
const path = require("node:path");
const { version } = require("../package.json");

const directory = path.resolve(process.argv[2]);
const repository = process.env.GITHUB_REPOSITORY;
const tag = process.env.RELEASE_TAG;
const platforms = {};

for (const [arch, suffix] of [
	["x86_64", "x64"],
	["aarch64", "arm64"],
]) {
	// 默认目标沿用 MSI／AppImage，同时保留各安装类型的独立目标。
	const assets = [
		[
			`ReinaManager_${version}_${suffix}_en-US.msi`,
			[`windows-${arch}`, `windows-${arch}-msi`],
		],
		[`ReinaManager_${version}_${suffix}-setup.exe`, [`windows-${arch}-nsis`]],
		[
			`ReinaManager_${version}_${arch === "x86_64" ? "amd64" : "aarch64"}.AppImage`,
			[`linux-${arch}`, `linux-${arch}-appimage`],
		],
		[
			`ReinaManager_${version}_${arch === "x86_64" ? "amd64" : "arm64"}.deb`,
			[`linux-${arch}-deb`],
		],
		[`ReinaManager-${version}-1.${arch}.rpm`, [`linux-${arch}-rpm`]],
	];
	for (const [filename, targets] of assets) {
		const entry = {
			url: `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(filename)}`,
			signature: fs
				.readFileSync(path.join(directory, `${filename}.sig`), "utf8")
				.trim(),
		};
		for (const target of targets) platforms[target] = entry;
	}
}

fs.writeFileSync(
	path.join(directory, "latest.json"),
	JSON.stringify(
		{
			version,
			notes: process.env.RELEASE_NOTES,
			pub_date: new Date().toISOString(),
			platforms,
		},
		null,
		2,
	),
);
console.log(`已生成更新清单：${Object.keys(platforms).length} 个平台目标。`);
