"""为实验包装入实际 CEF 发行文件，避开 alpha CLI 对旧版 ANGLE 文件的硬编码。"""

import hashlib
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path


def run(*args: str) -> None:
    subprocess.run(args, check=True)


def main() -> None:
    project = Path(__file__).resolve().parent.parent
    config = json.loads((project / "src-tauri/tauri.conf.json").read_text())
    product = config["productName"]
    binary = config["mainBinaryName"]
    bundle_dir = project / "src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/deb"
    packages = list(bundle_dir.glob("*.deb"))
    distributions = list((project / ".cef-cache").glob("*/cef_linux_x86_64/libcef.so"))
    if len(packages) != 1 or len(distributions) != 1:
        raise RuntimeError(f"应只有一个基础 deb 和 CEF 发行目录: {packages}, {distributions}")
    cef = distributions[0].parent
    required = [
        "libcef.so", "icudtl.dat", "v8_context_snapshot.bin", "resources.pak",
        "chrome_100_percent.pak", "chrome_200_percent.pak", "chrome-sandbox",
        "libvk_swiftshader.so", "libvulkan.so.1", "vk_swiftshader_icd.json",
        "locales/en-US.pak", "CREDITS.html",
    ]
    for name in required:
        if not (cef / name).is_file():
            raise RuntimeError(f"CEF 发行包缺少必需文件: {cef / name}")

    with tempfile.TemporaryDirectory(prefix="reina-cef-deb-") as temporary:
        root = Path(temporary) / "root"
        run("dpkg-deb", "--raw-extract", str(packages[0]), str(root))
        destination = root / "usr/share" / product
        destination.mkdir(parents=True, exist_ok=True)
        executable = root / "usr/bin" / binary
        shutil.move(executable, destination / binary)
        executable.symlink_to(Path("../share") / product / binary)

        # 和官方布局一致：程序与 Chromium 资源同级，7-Zip 保持 Tauri 的资源目录。
        files = {cef / name for name in required if "/" not in name}
        for pattern in ("*.so", "*.so.*", "*.pak", "*.dat", "*.bin"):
            files.update(cef.glob(pattern))
        for source in sorted(files):
            target = destination / source.name
            shutil.copy2(source, target)
            if ".so" in source.name:
                run("strip", str(target))
        shutil.copytree(cef / "locales", destination / "locales")
        (destination / "chrome-sandbox").chmod(0o4755)

        # 添加 Chromium 的动态依赖，避免构建机已安装的库掩盖用户安装时的缺项。
        control_path = root / "DEBIAN/control"
        control = control_path.read_text()
        additional = [
            "libnss3", "libnspr4", "libasound2t64", "libatk1.0-0t64",
            "libatk-bridge2.0-0t64", "libcups2t64", "libdrm2", "libgbm1",
            "libx11-6", "libxcb1", "libxcomposite1", "libxdamage1", "libxext6",
            "libxfixes3", "libxrandr2", "libxkbcommon0",
        ]
        match = re.search(r"^Depends: (.*)$", control, re.MULTILINE)
        depends = match.group(1).split(", ") if match else []
        depends.extend(name for name in additional if name not in depends)
        line = f"Depends: {', '.join(depends)}"
        control = re.sub(r"^Depends: .*$", line, control, flags=re.MULTILINE) if match else control + line + "\n"
        size = sum(path.lstat().st_size for path in root.rglob("*") if path.is_file()) // 1024
        control = re.sub(r"^Installed-Size: .*$", f"Installed-Size: {size}", control, flags=re.MULTILINE)
        control_path.write_text(control)
        with (root / "DEBIAN/md5sums").open("w") as hashes:
            for path in sorted(root.rglob("*")):
                if not path.is_file() or path.is_symlink() or path.is_relative_to(root / "DEBIAN"):
                    continue
                with path.open("rb") as stream:
                    digest = hashlib.file_digest(stream, "md5").hexdigest()
                hashes.write(f"{digest}  {path.relative_to(root)}\n")
        output = Path(temporary) / "preview.deb"
        run("dpkg-deb", "--build", "--root-owner-group", "-Zgzip", "-z3", str(root), str(output))
        shutil.copy2(output, packages[0])
    print(f"CEF 实验安装包已生成: {packages[0]}")


if __name__ == "__main__":
    main()
