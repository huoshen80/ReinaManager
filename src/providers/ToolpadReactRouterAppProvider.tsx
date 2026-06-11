import { createTheme } from "@mui/material/styles";
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
	useMemo,
} from "react";
import {
	Link as ReactRouterLink,
	useLocation,
	useNavigate,
	useSearchParams,
} from "react-router-dom";
import { useStore } from "@/store/appStore";
import { saveScrollPosition } from "@/utils/scroll";

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

export const ToolpadReactRouterAppProvider = (props: AppProviderProps) => {
	const { pathname } = useLocation();
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();

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

	const themeColor = useStore((state) => state.themeColor);

	const theme = useMemo(() => {
		return createTheme({
			cssVariables: {
				colorSchemeSelector: "data-toolpad-color-scheme",
			},
			colorSchemes: {
				light: {
					palette: {
						primary: { main: themeColor },
					},
				},
				dark: {
					palette: {
						primary: { main: themeColor },
					},
				},
			},
		});
	}, [themeColor]);

	return <AppProvider router={router} theme={theme} {...props} />;
};

export default ToolpadReactRouterAppProvider;
