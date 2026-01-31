import { useCallback, useState } from "react";
import { getAssetUrl } from "@/utils/customCover";

/**
 * 图片预览 Hook
 *
 * 使用 Tauri 的 convertFileSrc 实现零内存开销的图片预览
 *
 * 主要功能：
 * 1. 管理选中的图片路径
 * 2. 同步转换为 asset URL（无需异步读取）
 * 3. 无需竞态条件处理（同步操作）
 * 4. 无需清理资源（无 blob URL）
 *
 * @returns 图片预览状态和操作方法
 */
export const useImagePreview = () => {
	// 选中的图片文件路径
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	// 预览用的 asset URL（通过 convertFileSrc 转换）
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);

	/**
	 * 清理预览状态
	 */
	const cleanup = useCallback(() => {
		setPreviewUrl(null);
		setSelectedPath(null);
	}, []);

	/**
	 * 选择图片并生成预览
	 *
	 * @param path 图片文件路径
	 */
	const selectImage = useCallback((path: string) => {
		setSelectedPath(path);
		// 直接转换路径为 asset URL，同步操作，无需 await
		setPreviewUrl(getAssetUrl(path));
	}, []);

	return {
		/** 当前选中的图片路径 */
		selectedPath,
		/** 预览 URL（通过 convertFileSrc 转换） */
		previewUrl,
		/** 选择图片并生成预览 */
		selectImage,
		/** 清理预览状态 */
		cleanup,
	};
};
