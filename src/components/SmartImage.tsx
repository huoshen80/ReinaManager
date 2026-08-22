import { Box, type BoxProps } from "@mui/material";
import { forwardRef } from "react";
import { useImageFallback } from "@/hooks/common/useImageFallback";

export interface SmartImageProps
	extends Omit<BoxProps<"img">, "src" | "onError"> {
	src?: string | null;
	fallbackSrc?: string;
	onError?: () => void;
}

/**
 * 带有自动镜像降级与多候选重试能力的图片组件。
 * 默认使用 WebView2 原生网络加载，享受 Chromium 缓存；加载失败时自动切换下一个候选 URL。
 */
export const SmartImage = forwardRef<HTMLImageElement, SmartImageProps>(
	({ src, fallbackSrc = "/images/default.png", onError, ...props }, ref) => {
		const { src: activeSrc, onError: handleFallbackError } = useImageFallback(
			src,
			{ fallbackSrc, onError },
		);

		return (
			<Box
				component="img"
				ref={ref}
				src={activeSrc}
				onError={handleFallbackError}
				{...props}
			/>
		);
	},
);

SmartImage.displayName = "SmartImage";
