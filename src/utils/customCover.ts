/**
 * @file 自定义封面工具
 * @description 处理自定义封面的选择、预览、上传和管理
 */

import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { basename, join } from "pathe";
import { fileService } from "@/services";
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
		const fileName = basename(imagePath);
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
		const targetPath = join(
			customCoverFolder,
			`cover_${gameId}_${versionedFileName}`,
		);

		// 删除该游戏的所有旧封面文件（通过模式匹配）
		try {
			await fileService.deleteGameCovers(gameId, customCoverFolder);
		} catch {
			// 如果删除失败（文件不存在等），继续执行
		}

		// 复制文件到目标位置
		await fileService.copyFile(imagePath, targetPath);

		// 返回版本化的文件标识符，存储到数据库
		return versionedFileName;
	} catch (error) {
		throw new Error(`上传图片失败: ${error}`);
	}
};

/**
 * 将本地文件路径转换为可用于 <img> 的 asset URL
 * 使用 Tauri 的 convertFileSrc，零内存开销，无需清理
 * @param filePath 本地文件绝对路径
 * @returns asset URL
 */
export const getAssetUrl = (filePath: string): string => {
	return convertFileSrc(filePath);
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
		const targetPath = join(
			customCoverFolder,
			`cover_${gameId}_${versionedFileName}`,
		);

		// 删除物理文件
		await fileService.deleteFile(targetPath);
	} catch (error) {
		throw new Error(`删除自定义封面失败: ${error}`);
	}
};
