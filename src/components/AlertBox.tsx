/**
 * @file AlertBox 组件
 * @description 通用弹窗提示组件，支持普通确认/取消弹窗和带加载状态的删除确认弹窗，适用于全局提示、删除确认等场景，支持国际化。
 * @module src/components/AlertBox/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - AlertBox：通用提示框组件
 * - AlertConfirmBox：带加载状态的确认弹窗（支持删除、恢复等操作）
 *
 * 依赖：
 * - @mui/material
 * - react-i18next
 */

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { GameCandidateData } from "@/types";

interface ViewGameSourceItem {
	key: "bgm_data" | "vndb_data" | "ymgal_data" | "kun_data";
	label: string;
	name: string | undefined;
	image?: string;
	alt: string;
}

/**
 * 通用提示框属性类型
 */
interface AlertBoxProps {
	open: boolean;
	setOpen: (value: boolean) => void;
	title?: string;
	message?: ReactNode; // 修改类型以支持 JSX 元素
	onConfirm: () => void;
	confirmText?: string;
	cancelText?: string;
	confirmColor?: "primary" | "error" | "success" | "info" | "warning";
	confirmVariant?: "text" | "outlined" | "contained";
	autoCloseOnConfirm?: boolean; // 确认后是否自动关闭
	isLoading?: boolean; // 新增属性：加载状态
	customMessage?: string; // 新增属性：自定义消息
	// 可选的第三个功能按钮
	extraButtonText?: string;
	extraButtonColor?: "primary" | "error" | "success" | "info" | "warning";
	extraButtonVariant?: "text" | "outlined" | "contained";
	onExtraButtonClick?: () => void;
	showExtraButton?: boolean;
}

/**
 * 确认提示框专用属性类型（支持删除、恢复等操作）
 */
interface AlertConfirmBoxProps {
	open: boolean;
	setOpen: (value: boolean) => void;
	onConfirm: () => void;
	isLoading?: boolean; // 添加加载状态
	message?: string; // 自定义消息
	title?: string; // 自定义标题
	confirmText?: string; // 自定义确认按钮文本
	confirmColor?: "primary" | "error" | "success" | "info" | "warning"; // 自定义确认按钮颜色
}

// 定义 ViewGameBoxProps 接口
interface ViewGameBoxProps {
	fullgame: GameCandidateData;
	open: boolean;
	setOpen: (value: boolean) => void;
	onConfirm: () => void;
	title: string;
	isLoading?: boolean;
}

/**
 * 通用提示框组件
 *
 * @param {AlertBoxProps} props 组件属性
 * @returns {JSX.Element} 通用弹窗
 */
export function AlertBox({
	open,
	setOpen,
	title,
	message,
	onConfirm,
	confirmText,
	cancelText,
	confirmColor = "primary",
	confirmVariant = "text",
	autoCloseOnConfirm = true,
	isLoading = false,
	// 可选的第三个功能按钮
	extraButtonText,
	extraButtonColor = "primary",
	extraButtonVariant = "outlined",
	onExtraButtonClick,
	showExtraButton = false,
}: AlertBoxProps) {
	const { t } = useTranslation();

	/**
	 * 关闭弹窗
	 */
	const handleClose = () => {
		if (!isLoading) {
			setOpen(false);
		}
	};

	/**
	 * 确认操作
	 */
	const handleConfirm = () => {
		onConfirm();
		if (autoCloseOnConfirm && !isLoading) {
			setOpen(false);
		}
	};

	return (
		<Dialog
			open={open}
			onClose={handleClose}
			aria-labelledby="alert-dialog-title"
			aria-describedby="alert-dialog-description"
		>
			{title && <DialogTitle id="alert-dialog-title">{title}</DialogTitle>}
			{message && (
				<DialogContent>
					<DialogContentText component="div" id="alert-dialog-description">
						{message}
					</DialogContentText>
				</DialogContent>
			)}
			<DialogActions>
				<Button onClick={handleClose} disabled={isLoading}>
					{cancelText || t("components.AlertBox.cancel")}
				</Button>
				{showExtraButton && extraButtonText && onExtraButtonClick && (
					<Button
						onClick={onExtraButtonClick}
						color={extraButtonColor}
						variant={extraButtonVariant}
						disabled={isLoading}
					>
						{extraButtonText}
					</Button>
				)}
				<Button
					onClick={handleConfirm}
					color={confirmColor}
					variant={confirmVariant}
					autoFocus
					disabled={isLoading}
					startIcon={
						isLoading ? (
							<CircularProgress size={16} color="inherit" />
						) : undefined
					}
				>
					{isLoading
						? t("components.AlertBox.processing")
						: confirmText || t("components.AlertBox.confirm")}
				</Button>
			</DialogActions>
		</Dialog>
	);
}

/**
 * 确认提示框组件，带加载状态（支持删除、恢复等操作）
 *
 * @param {AlertConfirmBoxProps} props 组件属性
 * @returns {JSX.Element} 确认弹窗
 */
export const AlertConfirmBox: React.FC<AlertConfirmBoxProps> = ({
	open,
	setOpen,
	onConfirm,
	isLoading = false,
	message,
	title,
	confirmText,
	confirmColor = "error",
}) => {
	const { t } = useTranslation();

	return (
		<AlertBox
			open={open}
			setOpen={setOpen}
			title={title || t("components.AlertBox.deleteGameTitle")}
			message={message || t("components.AlertBox.deleteGameMessage")}
			onConfirm={onConfirm}
			confirmText={confirmText || t("components.AlertBox.confirmDelete")}
			cancelText={t("components.AlertBox.cancel")}
			confirmColor={confirmColor}
			confirmVariant="contained"
			autoCloseOnConfirm={false} // 不自动关闭，由父组件控制
			isLoading={isLoading} // 传递加载状态
		/>
	);
};

/**
 * 更新游戏信息提示框组件
 *
 * @param {Object} props 组件属性
 * @param {{ name: string; image: string }} props.game 游戏信息
 * @param {boolean} props.open 控制弹窗打开状态
 * @param {(value: boolean) => void} props.setOpen 设置弹窗打开状态的函数
 * @param {() => void} props.onConfirm 确认操作函数
 * @returns {JSX.Element} 更新游戏信息弹窗
 */
export const ViewGameBox: React.FC<ViewGameBoxProps> = ({
	fullgame,
	open,
	setOpen,
	onConfirm,
	title,
	isLoading = false,
}) => {
	const { t } = useTranslation();
	// 1. 定义配置项
	const sourceConfigs = [
		{
			id: "bgm_data",
			labelKey: "bgmData",
			fallback: "BGM 数据",
			prefix: "BGM",
		},
		{
			id: "vndb_data",
			labelKey: "vndbData",
			fallback: "VNDB 数据",
			prefix: "VNDB",
		},
		{
			id: "ymgal_data",
			labelKey: "ymgalData",
			fallback: "YMGal 数据",
			prefix: "YMGal",
		},
		{
			id: "kun_data",
			labelKey: "kunData",
			fallback: "Kungal 数据",
			prefix: "Kungal",
		},
	] as const;

	// 2. 遍历并执行逻辑
	const viewGameSources: ViewGameSourceItem[] = [];

	sourceConfigs.forEach(({ id, labelKey, fallback, prefix }) => {
		const data = fullgame[id]; // 获取对应的属性数据
		if (data) {
			viewGameSources.push({
				key: id,
				label: t(`components.AlertBox.${labelKey}`, fallback),
				name: data.name,
				image: data.image,
				alt: `${prefix} ${data.name}`,
			});
		}
	});

	// 根据 showExtraButton 切换标题：有查看更多按钮时表示添加流程，否则为更新流程
	return (
		<AlertBox
			open={open}
			setOpen={setOpen}
			title={title}
			message={
				<Box className="flex gap-2 items-start w-full">
					{viewGameSources.map((source) => (
						<Box key={source.key} className="text-left">
							<Typography variant="subtitle1" gutterBottom>
								{source.label}
							</Typography>
							<Typography variant="body2" className="mb-1">
								{t("components.AlertBox.gameName")}: {source.name}
							</Typography>
							{source.image && (
								<img
									src={source.image}
									alt={source.alt}
									className="w-full h-auto max-h-64 object-contain rounded"
								/>
							)}
						</Box>
					))}
				</Box>
			}
			onConfirm={onConfirm}
			confirmText={t("components.AlertBox.confirm")}
			cancelText={t("components.AlertBox.cancel")}
			confirmColor="primary"
			confirmVariant="contained"
			isLoading={isLoading}
		/>
	);
};
