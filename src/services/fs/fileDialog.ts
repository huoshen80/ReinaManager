import { basename, dirname } from "@tauri-apps/api/path";
import { open as openDirectory } from "@tauri-apps/plugin-dialog";
import i18next, { t } from "i18next";
import { snackbar } from "@/providers/snackBar";
import { fileService } from "@/services/invoke";
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

export const handleDroppedPath = async (
	droppedPath: string,
): Promise<string | null> => {
	try {
		const result = await fileService.resolveDroppedLocalPath(droppedPath);

		switch (result.kind) {
			case "executable":
			case "single_executable":
				return result.path;
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
				return handleExeFile(result.directory ?? droppedPath);
			case "invalid":
				snackbar.error(
					t(
						"components.AddModal.invalidFile",
						"请拖入有效的可执行文件（.exe/.bat/.cmd）或文件夹",
					),
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
				"请拖入有效的可执行文件（.exe/.bat/.cmd）或文件夹",
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
