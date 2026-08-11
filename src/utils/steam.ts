const MAX_U64 = 18_446_744_073_709_551_615n;

/** 将 Steam 启动 ID 规范化为无前导零的十进制字符串。 */
export function normalizeSteamLaunchId(raw: string): string | undefined {
	const value = raw.trim();
	if (!/^\d+$/.test(value)) return undefined;

	const parsed = BigInt(value);
	if (parsed === 0n || parsed > MAX_U64) return undefined;
	return parsed.toString();
}

/** 统一展示 Steam 启动 ID，并在可用时附带本地路径。 */
export function formatSteamAppIdWithPath(
	steamLaunchId: string,
	localpath?: string | null,
): string {
	return localpath
		? `steam_appid: ${steamLaunchId} · ${localpath}`
		: `steam_appid: ${steamLaunchId}`;
}
