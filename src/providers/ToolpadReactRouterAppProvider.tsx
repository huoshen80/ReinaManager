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
} from "react-router";
import { saveScrollPosition } from "@/utils/appUtils";

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

	return <AppProvider router={router} {...props} />;
};

export default ToolpadReactRouterAppProvider;
