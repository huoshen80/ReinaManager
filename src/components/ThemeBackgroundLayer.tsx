import { GlobalStyles } from "@mui/material";
import Box from "@mui/material/Box";
import { useColorScheme } from "@mui/material/styles";
import { useMemo } from "react";
import { useAllSettings } from "@/hooks/queries/useSettings";
import { buildTauriProtocolUrl } from "@/utils/tauriProtocol";

export const ThemeBackgroundLayer = () => {
	const { data: settings } = useAllSettings();
	const { mode, systemMode } = useColorScheme();
	const resolvedMode =
		mode === "dark" || (mode === "system" && systemMode === "dark")
			? "dark"
			: "light";

	const visible = useMemo(() => {
		if (!settings?.theme_background_path) return false;
		return (
			settings.theme_apply_scope === "all" ||
			settings.theme_apply_scope === resolvedMode
		);
	}, [resolvedMode, settings]);

	if (!visible || !settings?.theme_background_path) return null;

	const imageUrl = buildTauriProtocolUrl(
		"reina-theme",
		"/asset",
		new URLSearchParams({ path: settings.theme_background_path }),
	);
	const opacity = Math.max(
		0,
		Math.min(1, settings.theme_overlay_opacity ?? 0.35),
	);
	const blur = Math.max(0, Math.min(40, settings.theme_blur ?? 0));

	return (
		<>
			<GlobalStyles
				styles={{
					"html, body, #root, main": {
						backgroundColor: "transparent !important",
					},
					".MuiAppBar-root, .MuiDrawer-paper": {
						backgroundColor:
							"color-mix(in srgb, var(--mui-palette-background-paper) 88%, transparent) !important",
						backdropFilter: "blur(12px)",
					},
					".MuiPaper-root, .MuiCard-root": {
						backgroundColor:
							"color-mix(in srgb, var(--mui-palette-background-paper) 90%, transparent)",
					},
				}}
			/>
			<Box
			aria-hidden="true"
			sx={{
				position: "fixed",
				inset: 0,
				zIndex: 0,
				pointerEvents: "none",
				overflow: "hidden",
				backgroundColor: "var(--mui-palette-background-default)",
			}}
		>
			<Box
				component="img"
				src={imageUrl}
				alt=""
				sx={{
					position: "absolute",
					inset: blur ? -blur : 0,
					width: blur ? `calc(100% + ${blur * 2}px)` : "100%",
					height: blur ? `calc(100% + ${blur * 2}px)` : "100%",
					objectFit: settings.theme_background_size ?? "cover",
					filter: blur ? `blur(${blur}px)` : undefined,
					userSelect: "none",
				}}
			/>
			<Box
				sx={{
					position: "absolute",
					inset: 0,
					backgroundColor: `rgba(0, 0, 0, ${opacity})`,
				}}
			/>
			</Box>
		</>
	);
};
