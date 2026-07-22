const tauriPlatform = import.meta.env.TAURI_ENV_PLATFORM as string | undefined;
const isWindows =
	tauriPlatform === "windows" ||
	(!tauriPlatform && navigator.userAgent.includes("Windows"));

export function buildTauriProtocolUrl(
	protocol: string,
	path: string,
	params: URLSearchParams,
): string {
	const base = isWindows
		? `http://${protocol}.localhost`
		: `${protocol}://localhost`;
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	const query = params.toString();
	return `${base}${normalizedPath}${query ? `?${query}` : ""}`;
}
