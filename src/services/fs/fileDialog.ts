import { basename, dirname } from "@tauri-apps/api/path";
import { open as openDirectory } from "@tauri-apps/plugin-dialog";
import i18next, { t } from "i18next";
import { extname, isAbsolute, join, normalize } from "pathe";
import { snackbar } from "@/providers/snackBar";
import { fileService } from "@/services/invoke";
import type { SteamLaunchTarget } from "@/services/invoke/fileService";
import type { GameData } from "@/types";
import { getUserErrorMessage } from "@/utils/errors";

export const handleOpenFolder = async (
	selectedGame: Pick<GameData, "localpath">,
) => {
	try {
		if (!selectedGame.localpath) {
			snackbar.error(
				i18next.t("components.LaunchModal.gamePathNotFound", "游戏路径未找到"),
			);
			return;
		}
		await fileService.openDirectory(selectedGame.localpath);
	} catch (error) {
		const errorMessage = getUserErrorMessage(error, i18next.t.bind(i18next));
		snackbar.error(
			`${i18next.t(
				"components.Snackbar.failedOpenGameFolder",
				"打开游戏文件夹失败",
			)}: ${errorMessage}`,
		);
		console.error("打开文件夹失败:", error);
	}
};

export interface ExecutablePathParts {
	localpath: string;
	executable: string;
}

export type LaunchFileSelection =
	| {
			launchType: "local";
			path: string;
	  }
	| {
			launchType: "steam";
			path: string;
			target: SteamLaunchTarget;
	  };

function stripWrappingQuotes(value: string): string {
	const trimmed = value.trim();
	return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
		? trimmed.slice(1, -1)
		: trimmed;
}

function normalizeComparablePath(path: string): string {
	const cleanPath = stripWrappingQuotes(path);
	const normalizedPath = normalize(cleanPath).replaceAll("\\", "/");
	const isWindowsPath =
		/^[a-z]:[\\/]/i.test(cleanPath) || /^[/\\]{2}/.test(cleanPath);
	return isWindowsPath ? normalizedPath.toLowerCase() : normalizedPath;
}

/** 生成可用于精确匹配的目录路径。Windows 路径按大小写不敏感处理。 */
export function normalizeDirectoryPath(
	localpath?: string | null,
): string | null {
	if (!localpath?.trim()) return null;

	const normalizedPath = normalizeComparablePath(localpath);
	if (normalizedPath === "/" || /^[a-z]:\/$/i.test(normalizedPath)) {
		return normalizedPath;
	}
	return normalizedPath.replace(/\/+$/, "");
}

/** 仅接收 normalizeDirectoryPath 的结果，Windows 路径已统一为小写。 */
function splitNormalizedDirectoryPath(path: string): string[] {
	const components = path.split("/").filter(Boolean);
	if (path.startsWith("//")) return ["//", ...components];
	if (path.startsWith("/")) return ["/", ...components];
	return components;
}

/** 判断路径是否等于根目录，或位于根目录内部。 */
export function isSameOrDescendantDirectoryPath(
	path?: string | null,
	root?: string | null,
): boolean {
	const normalizedPath = normalizeDirectoryPath(path);
	const normalizedRoot = normalizeDirectoryPath(root);
	if (!normalizedPath || !normalizedRoot) return false;

	const pathComponents = splitNormalizedDirectoryPath(normalizedPath);
	const rootComponents = splitNormalizedDirectoryPath(normalizedRoot);
	return (
		pathComponents.length >= rootComponents.length &&
		rootComponents.every(
			(component, index) => pathComponents[index] === component,
		)
	);
}

/** 生成可用于精确匹配的完整启动路径。Windows 路径按大小写不敏感处理。 */
export function normalizeFullExecutablePath(
	localpath?: string | null,
	executable?: string | null,
): string | null {
	if (!executable?.trim()) return null;

	const cleanExecutable = stripWrappingQuotes(executable);
	const cleanLocalPath = localpath?.trim()
		? stripWrappingQuotes(localpath)
		: undefined;
	const fullPath = isAbsolute(cleanExecutable)
		? cleanExecutable
		: cleanLocalPath
			? join(cleanLocalPath, cleanExecutable)
			: null;
	if (!fullPath) return null;

	return normalizeComparablePath(fullPath);
}

/** 将文件选择器返回的完整路径拆为游戏目录与文件名。 */
export async function splitExecutablePath(
	selectedPath: string,
): Promise<ExecutablePathParts> {
	return {
		localpath: await dirname(selectedPath),
		executable: await basename(selectedPath),
	};
}

export const handleFolder = async (defaultPath: string = "") => {
	const selectedPath = await openDirectory({
		multiple: false,
		directory: true,
		defaultPath: defaultPath,
		filters: [
			{
				name: t("utils.handleDirectory.folder", "文件夹"),
				extensions: ["*"],
			},
		],
	});
	if (selectedPath === null) return null;
	return selectedPath;
};

export const handleExeFile = async (defaultPath: string = "") => {
	const selectedPath = await openDirectory({
		multiple: false,
		directory: false,
		defaultPath: defaultPath,
		filters: [
			{
				name: t("utils.handleDirectory.executable", "可执行文件"),
				extensions: ["exe", "bat", "cmd"],
			},
			{
				name: t("utils.handleDirectory.allFiles", "所有文件"),
				extensions: ["*"],
			},
		],
	});
	if (selectedPath === null) return null;
	return selectedPath;
};

async function resolveLaunchFileSelection(
	selectedPath: string,
): Promise<LaunchFileSelection> {
	if (extname(selectedPath).toLowerCase() !== ".url") {
		return { launchType: "local", path: selectedPath };
	}

	const target = await fileService.resolveSteamShortcutFile(selectedPath);
	return {
		launchType: "steam",
		path: selectedPath,
		target,
	};
}

/** 选择本地启动程序或可被当前 Steam 库精确解析的 .url 快捷方式。 */
export const handleLaunchFile = async (
	defaultPath: string = "",
): Promise<LaunchFileSelection | null> => {
	const selectedPath = await openDirectory({
		multiple: false,
		directory: false,
		defaultPath,
		filters: [
			{
				name: t("utils.handleDirectory.launchFile", "启动文件"),
				extensions: ["exe", "bat", "cmd", "url"],
			},
		],
	});
	if (selectedPath === null) return null;

	return resolveLaunchFileSelection(selectedPath);
};

export const handleDroppedPath = async (
	droppedPath: string,
): Promise<LaunchFileSelection | null> => {
	try {
		if (extname(droppedPath).toLowerCase() === ".url") {
			return await resolveLaunchFileSelection(droppedPath);
		}

		const result = await fileService.resolveDroppedLocalPath(droppedPath);

		switch (result.kind) {
			case "executable":
			case "single_executable":
				return result.path ? { launchType: "local", path: result.path } : null;
			case "no_executable":
				snackbar.error(
					t("components.AddModal.emptyFolder", "该文件夹中没有找到可执行文件"),
				);
				return null;
			case "multiple_executables":
				snackbar.info(
					t(
						"components.AddModal.selectFromFolder",
						"文件夹中有多个可执行文件，请选择一个",
					),
				);
				{
					const selectedPath = await handleExeFile(
						result.directory ?? droppedPath,
					);
					return selectedPath
						? await resolveLaunchFileSelection(selectedPath)
						: null;
				}
			case "invalid":
				snackbar.error(
					t("components.AddModal.invalidFile", "请选择或拖拽启动文件或文件夹"),
				);
				return null;
			default:
				return null;
		}
	} catch (error) {
		console.error("处理拖拽路径失败:", error);
		snackbar.error(
			`${t(
				"components.AddModal.invalidFile",
				"请选择或拖拽启动文件或文件夹",
			)}: ${getUserErrorMessage(error, t)}`,
		);
		return null;
	}
};

/**
 * 从目录名中移除括号内容，提取搜索用的游戏名
 * 例如: "[社团名] 游戏名 (版本)" -> "游戏名"
 */
export function trimDirnameToSearchName(dirName: string): string {
	let result = "";
	let squareDepth = 0;
	let roundDepth = 0;
	let cornerDepth = 0;
	let fullwidthRoundDepth = 0;

	for (const ch of dirName) {
		switch (ch) {
			case "[":
				squareDepth++;
				break;
			case "]":
				squareDepth = Math.max(0, squareDepth - 1);
				break;
			case "(":
				roundDepth++;
				break;
			case ")":
				roundDepth = Math.max(0, roundDepth - 1);
				break;
			case "【":
				cornerDepth++;
				break;
			case "】":
				cornerDepth = Math.max(0, cornerDepth - 1);
				break;
			case "（":
				fullwidthRoundDepth++;
				break;
			case "）":
				fullwidthRoundDepth = Math.max(0, fullwidthRoundDepth - 1);
				break;
			default:
				if (
					squareDepth === 0 &&
					roundDepth === 0 &&
					cornerDepth === 0 &&
					fullwidthRoundDepth === 0
				) {
					result += ch;
				}
		}
	}

	const trimmed = result.replace(/\s+/g, " ").trim();
	return trimmed || dirName.trim();
}
