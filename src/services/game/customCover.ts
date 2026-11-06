/**
 * @file 自定义封面工具
 * @description 处理自定义封面的选择、预览、上传和管理
 */

import { open } from "@tauri-apps/plugin-dialog";

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
