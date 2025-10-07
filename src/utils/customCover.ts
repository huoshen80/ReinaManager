/**
 * @file 自定义封面工具
 * @description 处理自定义封面的选择、预览、上传和管理
 */

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { getcustomCoverFolder } from "./index";

/**
 * 获取文件扩展名
 */
export const getFileExtension = (filename: string): string => {
	const lastDot = filename.lastIndexOf(".");
	return lastDot !== -1 ? filename.substring(lastDot + 1).toLowerCase() : "";
};

/**
 * 选择图片文件（仅选择，不上传）
 * @returns Promise<string | null> 选择的图片文件路径或null
 */
export const selectImageFile = async (): Promise<string | null> => {
	try {
		const selected = await open({
			title: "选择自定义封面",
			multiple: false,
			directory: false,
			filters: [
				{
					name: "图片文件",
					extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"],
				},
			],
		});

		if (!selected || Array.isArray(selected)) return null;

		return selected as string;
	} catch (error) {
		console.error("选择图片文件失败:", error);
		throw error;
	}
};

/**
 * 上传已选择的图片文件到应用目录
 * @param gameId 游戏ID
 * @param imagePath 已选择的图片文件路径
 * @returns 包含版本信息的文件标识符
 */
export const uploadSelectedImage = async (
	gameId: number,
	imagePath: string,
): Promise<string> => {
	try {
		const fileName = imagePath.split(/[/\\]/).pop() || "image";
		const extension = getFileExtension(fileName);

		// 获取应用资源目录（使用缓存的路径）
		const customCoverFolder = getcustomCoverFolder(gameId);
		if (!customCoverFolder) {
			throw new Error("资源目录路径未初始化");
		}

		// 生成版本化的文件标识符（扩展名_时间戳）
		const timestamp = Date.now();
		const versionedFileName = `${extension}_${timestamp}`;

		// 构建目标路径
		const targetPath = `${customCoverFolder}\\cover_${gameId}_${versionedFileName}`;

		// 删除该游戏的所有旧封面文件（通过模式匹配）
		try {
			await invoke<void>("delete_game_covers", {
				gameId: gameId,
				coversDir: customCoverFolder,
			});
		} catch {
			// 如果删除失败（文件不存在等），继续执行
		}

		// 复制文件到目标位置
		await invoke<void>("copy_file", {
			src: imagePath,
			dst: targetPath,
		});

		// 返回版本化的文件标识符，存储到数据库
		return versionedFileName;
	} catch (error) {
		throw new Error(`上传图片失败: ${error}`);
	}
};

/**
 * 从本地路径读取图片并返回一个可用于 <img> 的 blob URL（仅用于预览）
 * @param imagePath 本地图片绝对路径
 * @returns Promise<string> blob URL
 */
export const getPreviewUrlFromPath = async (
	imagePath: string,
): Promise<string> => {
	try {
		const result = await readFile(imagePath);

		// 根据扩展名确定 mimeType
		const fileName = imagePath.split(/[/\\]/).pop() || "";
		const ext = getFileExtension(fileName) || "png";
		const mime = `image/${ext === "jpg" ? "jpeg" : ext}`;

		// 将 Uint8Array 转为标准 ArrayBuffer 子段，构造 Blob 并创建对象 URL
		const arrayBuffer = result.buffer.slice(
			result.byteOffset,
			result.byteOffset + result.byteLength,
		);
		const blob = new Blob([arrayBuffer as ArrayBuffer], { type: mime });
		const url = URL.createObjectURL(blob);
		return url;
	} catch (error) {
		console.error("生成预览 URL 失败:", error);
		throw error;
	}
};

/**
 * 选择并复制自定义封面到应用目录（一步完成，用于兼容旧逻辑）
 * @param gameId 游戏ID
 * @returns 文件扩展名
 */
export const selectAndUploadCustomCover = async (
	gameId: number,
): Promise<string> => {
	try {
		// 先选择图片
		const imagePath = await selectImageFile();
		if (!imagePath) {
			throw new Error("未选择文件");
		}

		// 然后上传
		return await uploadSelectedImage(gameId, imagePath);
	} catch (error) {
		throw new Error(`选择并上传自定义封面失败: ${error}`);
	}
};

/**
 * 删除自定义封面文件和数据库记录
 * @param gameId 游戏ID
 * @param versionedFileName 版本化的文件标识符（如："jpg_1703123456789"）
 */
export const deleteCustomCoverFile = async (
	gameId: number,
	versionedFileName: string,
): Promise<void> => {
	try {
		// 获取资源目录路径
		const customCoverFolder = getcustomCoverFolder(gameId);
		if (!customCoverFolder) {
			throw new Error("资源目录路径未初始化");
		}

		// 构建完整的文件路径
		const targetPath = `${customCoverFolder}\\cover_${gameId}_${versionedFileName}`;

		// 删除物理文件
		await invoke<void>("delete_file", {
			filePath: targetPath,
		});
	} catch (error) {
		throw new Error(`删除自定义封面失败: ${error}`);
	}
};
