import { createTheme } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";
import {
	AppProvider,
	type AppProviderProps,
	type Router,
} from "@toolpad/core/AppProvider";
import {
	type AnchorHTMLAttributes,
	forwardRef,
	type MouseEventHandler,
	useCallback,
	useEffect,
	useMemo,
} from "react";
import {
	Link as ReactRouterLink,
	useLocation,
	useNavigate,
	useSearchParams,
} from "react-router-dom";
import { saveScrollPosition } from "@/hooks/common/useScrollRestore";
import { useAllSettings } from "@/hooks/queries/useSettings";
import { reinaTheme } from "@/providers/reinaTheme";
import { themeService } from "@/services/invoke";
import type { ThemePalette } from "@/types";
import { applyMuiCssVariables, toMuiThemeOptions } from "@/utils/themeMui";

interface ToolpadLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
	href: string;
	history?: "auto" | "push" | "replace";
}

const ToolpadLink = forwardRef<HTMLAnchorElement, ToolpadLinkProps>(
	({ href, history, onClick, ...rest }, ref) => {
		const location = useLocation();

		const handleClick: MouseEventHandler<HTMLAnchorElement> = useCallback(
			(event) => {
				onClick?.(event);

				if (!event.defaultPrevented) {
					saveScrollPosition(location.pathname);
				}
			},
			[location.pathname, onClick],
		);

		return (
			<ReactRouterLink
				ref={ref}
				to={href}
				replace={history === "replace"}
				onClick={handleClick}
				{...rest}
			/>
		);
	},
);

ToolpadLink.displayName = "ToolpadLink";

const createPrimaryPalette = (main: string) =>
	createTheme({ palette: { primary: { main } } }).palette.primary;

const colorChannel = (color: string) => {
	const normalized = color.startsWith("#") ? color.slice(1) : color;
	if (normalized.length !== 6) return undefined;
	const value = Number.parseInt(normalized, 16);
	if (!Number.isFinite(value)) return undefined;
	return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
};

export const ToolpadReactRouterAppProvider = (props: AppProviderProps) => {
	const { pathname } = useLocation();
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const { data: settings } = useAllSettings();
	const { data: packages = [] } = useQuery({
		queryKey: ["theme-packages"],
		queryFn: () => themeService.listPackages(),
	});
	const activeMuiConfig = useMemo(() => {
		const activeId = settings?.active_theme_package_id;
		if (!activeId) return undefined;
		return packages.find((packageInfo) => packageInfo.id === activeId)?.mui;
	}, [packages, settings?.active_theme_package_id]);

	const theme = useMemo(() => {
		const toPalette = (palette?: ThemePalette | null) => {
			if (!palette) return undefined;
			return {
				primary: palette.primary ? { main: palette.primary } : undefined,
				secondary: palette.secondary ? { main: palette.secondary } : undefined,
				background: {
					default: palette.backgroundDefault ?? undefined,
					paper: palette.backgroundPaper ?? undefined,
				},
				text: {
					primary: palette.textPrimary ?? undefined,
					secondary: palette.textSecondary ?? undefined,
				},
				divider: palette.divider ?? undefined,
			};
		};
		const accent = settings?.theme_accent_color ?? "#7c4dff";
		const baseLight = toPalette(settings?.custom_theme_light_palette);
		const baseDark = toPalette(settings?.custom_theme_dark_palette);
		const primary = createPrimaryPalette(accent);
		return createTheme(reinaTheme, {
			colorSchemes: {
				light: { palette: { ...baseLight, primary } },
				dark: { palette: { ...baseDark, primary } },
			},
			...toMuiThemeOptions(activeMuiConfig),
		});
	}, [settings, activeMuiConfig]);

	useEffect(() => {
		applyMuiCssVariables(activeMuiConfig);
	}, [activeMuiConfig]);

	useEffect(() => {
		const primary = createPrimaryPalette(
			settings?.theme_accent_color ?? "#7c4dff",
		);
		const root = document.documentElement;
		const values = {
			main: primary.main,
			light: primary.light,
			dark: primary.dark,
			contrastText: primary.contrastText,
		};
		for (const [key, value] of Object.entries(values)) {
			root.style.setProperty(`--mui-palette-primary-${key}`, value);
			const channel = colorChannel(value);
			if (channel) {
				root.style.setProperty(`--mui-palette-primary-${key}Channel`, channel);
			}
		}
	}, [settings?.theme_accent_color]);

	const navigateImpl = useCallback<Router["navigate"]>(
		(url, { history = "auto" } = {}) => {
			if (history === "auto" || history === "push") {
				navigate(url);
				return;
			}

			if (history === "replace") {
				navigate(url, { replace: true });
				return;
			}

			throw new Error(`Invalid history option: ${history}`);
		},
		[navigate],
	);

	const router = useMemo<Router>(
		() => ({
			pathname,
			searchParams,
			navigate: navigateImpl,
			Link: ToolpadLink,
		}),
		[pathname, searchParams, navigateImpl],
	);

	return <AppProvider router={router} theme={theme} {...props} />;
};

export default ToolpadReactRouterAppProvider;
