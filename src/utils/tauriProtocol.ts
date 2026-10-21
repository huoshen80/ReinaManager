import { convertFileSrc, isTauri } from "@tauri-apps/api/core";

const tauriPlatform = import.meta.env.TAURI_ENV_PLATFORM as string | undefined;
export const isWindowsPlatform =
	tauriPlatform === "windows" ||
	(!tauriPlatform && navigator.userAgent.includes("Windows"));

export function buildTauriProtocolUrl(
	protocol: string,
	path: string,
	params: URLSearchParams,
): string {
	// 协议格式由运行时决定，Linux CEF 与系统 WebView 的格式不同。
	const base = isTauri()
		? convertFileSrc("", protocol)
		: isWindowsPlatform
			? `http://${protocol}.localhost/`
			: `${protocol}://localhost/`;
	const url = new URL(base);
	// 只用转换结果的基址，避免 convertFileSrc 将路由分隔符和查询参数编码进文件名。
	url.pathname = path.startsWith("/") ? path : `/${path}`;
	url.search = params.toString();
	return url.toString();
}
