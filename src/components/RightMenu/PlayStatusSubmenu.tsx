/**
 * @file PlayStatusSubmenu 组件
 * @description 游戏状态二级菜单组件，用于选择游戏状态（想玩、在玩、玩过、搁置、弃坑）
 * @module src/components/RightMenu/PlayStatusSubmenu
 */

import CancelIcon from "@mui/icons-material/Cancel";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import EmojiEventsOutlinedIcon from "@mui/icons-material/EmojiEventsOutlined";
import PauseCircleIcon from "@mui/icons-material/PauseCircle";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import {
	Box,
	ListItemIcon,
	ListItemText,
	MenuItem,
	Paper,
} from "@mui/material";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	ALL_PLAY_STATUSES,
	isPlayedStatus,
	PLAY_STATUS_I18N_KEYS,
	PlayStatus,
} from "@/types/collection";

/**
 * 获取游戏状态对应的图标组件（带颜色）
 * 想玩: 黄色, 在玩: 蓝色, 玩过: 绿色, 搁置: 浅红色, 弃坑: 红色
 */
const getPlayStatusIcon = (status: PlayStatus) => {
	switch (status) {
		case PlayStatus.WISH:
			return <StarBorderIcon fontSize="small" className="text-yellow-500" />;
		case PlayStatus.PLAYING:
			return <PlayCircleIcon fontSize="small" className="text-blue-500" />;
		case PlayStatus.PLAYED:
			return <CheckCircleIcon fontSize="small" className="text-green-500" />;
		case PlayStatus.ON_HOLD:
			return <PauseCircleIcon fontSize="small" className="text-red-400" />;
		case PlayStatus.DROPPED:
			return <CancelIcon fontSize="small" className="text-red-500" />;
		default:
			return <StarBorderIcon fontSize="small" className="text-yellow-500" />;
	}
};

interface PlayStatusSubmenuProps {
	/** 当前游戏状态 */
	currentStatus: number | undefined;
	/** 状态变更回调 */
	onStatusChange: (newStatus: PlayStatus) => void;
	/** 是否禁用 */
	disabled?: boolean;
	/** i18n key 前缀，用于适配不同场景的文案 */
	i18nPrefix?: "components.RightMenu" | "components.Toolbar";
	/** 图标大小，Toolbar 使用 small */
	iconSize?: "small" | "medium";
	/** 展开方向，Toolbar 向左展开 */
	expandDirection?: "left" | "right";
}

/**
 * 游戏状态二级菜单组件
 * hover 时展开二级菜单显示所有状态选项
 * 可同时用于 RightMenu 和 Toolbar
 */
export const PlayStatusSubmenu: React.FC<PlayStatusSubmenuProps> = ({
	currentStatus,
	onStatusChange,
	disabled = false,
	i18nPrefix = "components.RightMenu",
	iconSize = "medium",
	expandDirection = "right",
}) => {
	const { t } = useTranslation();
	const [submenuOpen, setSubmenuOpen] = useState(false);
	const menuItemRef = useRef<HTMLLIElement>(null);
	const submenuRef = useRef<HTMLDivElement>(null);
	const closeTimerRef = useRef<NodeJS.Timeout | null>(null);

	// 清除关闭定时器
	const clearCloseTimer = () => {
		if (closeTimerRef.current) {
			clearTimeout(closeTimerRef.current);
			closeTimerRef.current = null;
		}
	};

	// 鼠标进入主菜单项时打开二级菜单
	const handleMouseEnter = () => {
		if (!disabled) {
			clearCloseTimer();
			setSubmenuOpen(true);
		}
	};

	// 鼠标离开主菜单项时延迟关闭
	const handleMouseLeave = () => {
		clearCloseTimer();
		closeTimerRef.current = setTimeout(() => {
			setSubmenuOpen(false);
		}, 100);
	};

	// 鼠标进入子菜单时取消关闭
	const handleSubmenuMouseEnter = () => {
		clearCloseTimer();
	};

	// 鼠标离开子菜单时关闭
	const handleSubmenuMouseLeave = () => {
		clearCloseTimer();
		closeTimerRef.current = setTimeout(() => {
			setSubmenuOpen(false);
		}, 100);
	};

	// 点击状态选项
	const handleStatusClick = (status: PlayStatus) => {
		onStatusChange(status);
		setSubmenuOpen(false);
	};

	const isPlayed = isPlayedStatus(currentStatus);

	// 计算二级菜单位置
	const getSubmenuStyle = (): React.CSSProperties => {
		if (!menuItemRef.current) return {};

		const itemRect = menuItemRef.current.getBoundingClientRect();
		const submenuWidth = 120; // 最小宽度

		let left: number;
		if (expandDirection === "left") {
			// 向左展开：子菜单右边缘对齐主菜单左边缘
			left = itemRect.left - submenuWidth;
		} else {
			// 向右展开：子菜单左边缘对齐主菜单右边缘
			left = itemRect.right;
		}

		// 确保不超出视口左侧
		if (left < 0) {
			left = 0;
		}

		// 确保不超出视口右侧
		if (left + submenuWidth > window.innerWidth) {
			left = window.innerWidth - submenuWidth;
		}

		return {
			position: "fixed",
			top: itemRect.top,
			left,
			zIndex: 9999,
		};
	};

	return (
		<Box
			component="li"
			sx={{ position: "relative", listStyle: "none" }}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
		>
			<MenuItem ref={menuItemRef} disabled={disabled}>
				<ListItemIcon>
					{isPlayed ? (
						<EmojiEventsIcon fontSize={iconSize} className="text-yellow-500" />
					) : (
						<EmojiEventsOutlinedIcon fontSize={iconSize} />
					)}
				</ListItemIcon>
				<ListItemText primary={t(`${i18nPrefix}.changePlayStatus`)} />
				{expandDirection === "left" ? (
					<ChevronLeftIcon fontSize="small" sx={{ ml: 1 }} />
				) : (
					<ChevronRightIcon fontSize="small" sx={{ ml: 1 }} />
				)}
			</MenuItem>

			{/* 二级菜单 - 使用自定义 div + Paper 避免 MUI Menu 的焦点问题 */}
			<div
				role="menu"
				ref={submenuRef}
				style={{
					...getSubmenuStyle(),
					display: submenuOpen ? "block" : "none",
				}}
				onMouseEnter={handleSubmenuMouseEnter}
				onMouseLeave={handleSubmenuMouseLeave}
			>
				<Paper
					elevation={8}
					sx={{
						minWidth: 120,
						borderRadius: 2,
						py: 0.5,
					}}
				>
					{ALL_PLAY_STATUSES.map((status) => (
						<MenuItem
							key={status}
							onClick={() => handleStatusClick(status)}
							selected={currentStatus === status}
						>
							<ListItemIcon>{getPlayStatusIcon(status)}</ListItemIcon>
							<ListItemText primary={t(PLAY_STATUS_I18N_KEYS[status])} />
						</MenuItem>
					))}
				</Paper>
			</div>
		</Box>
	);
};

export default PlayStatusSubmenu;
