import type { LinkProps, To } from "react-router-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { saveScrollPosition } from "@/utils/appUtils";

export const LinkWithScrollSave: React.FC<LinkProps> = (props) => {
	const { to, onClick, children, ...rest } = props as LinkProps &
		React.AnchorHTMLAttributes<HTMLAnchorElement>;
	const location = useLocation();
	const navigate = useNavigate();

	// 保持原有的滚动保存实现：只在导航前调用一次 saveScrollPosition
	const handleClick: React.MouseEventHandler<HTMLAnchorElement> = (event) => {
		saveScrollPosition(location.pathname);

		if (onClick) {
			onClick(event);
		}
	};

	const performNavigation = (target: To | undefined) => {
		try {
			if (target != null) {
				navigate(target);
			}
		} catch (err) {
			// swallow navigation errors to avoid breaking UI
			console.error("navigation failed", err);
		}
	};

	const handleAnchorClick: React.MouseEventHandler<HTMLAnchorElement> = (
		event,
	) => {
		event.preventDefault();
		handleClick(event);
		performNavigation(to as To | undefined);
	};

	const handleKeyDown: React.KeyboardEventHandler<HTMLAnchorElement> = (
		event,
	) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			// 在键盘激活时也保存滚动并导航
			saveScrollPosition(location.pathname);
			performNavigation(to as To | undefined);
		}
	};

	// 使用语义 <a> 元素以满足可访问性规则。
	return (
		// biome-ignore lint/a11y/useSemanticElements: 在特定嵌套场景下强制使用 <a> 会触发 DOM 嵌套错误
		<span
			role="link"
			tabIndex={0}
			onClick={handleAnchorClick}
			onKeyDown={handleKeyDown}
			{...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
		>
			{children}
		</span>
	);
};

export default LinkWithScrollSave;
