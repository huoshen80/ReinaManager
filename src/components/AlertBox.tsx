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
import Dialog, { type DialogProps } from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SmartImage } from "@/components/SmartImage";
import {
	getCandidateSourceData,
	getRuntimeSourceAdapter,
	REGISTERED_SOURCE_KEYS,
} from "@/metadata";
import type { GameMetadataDraft, SourceType } from "@/types";

interface ViewGameSourceItem {
	key: SourceType;
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
	maxWidth?: DialogProps["maxWidth"];
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
	gameDraft: GameMetadataDraft;
	open: boolean;
	setOpen: (value: boolean) => void;
	onConfirm: () => void;
	title: string;
	isLoading?: boolean;
	warningMessage?: string;
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
	maxWidth,
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
			maxWidth={maxWidth}
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
					{cancelText || t("components.AlertBox.cancel", "取消")}
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
						? t("components.AlertBox.processing", "处理中...")
						: confirmText || t("components.AlertBox.confirm", "确认")}
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
			title={title || t("components.AlertBox.deleteGameTitle", "删除游戏")}
			message={
				message ||
				t(
					"components.AlertBox.deleteGameMessage",
					"确定要删除该游戏吗？此操作将从库中移除该游戏，但不会删除游戏文件。",
				)
			}
			onConfirm={onConfirm}
			confirmText={
				confirmText || t("components.AlertBox.confirmDelete", "确认删除")
			}
			cancelText={t("components.AlertBox.cancel", "取消")}
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
	gameDraft,
	open,
	setOpen,
	onConfirm,
	title,
	isLoading = false,
	warningMessage,
}) => {
	const { t } = useTranslation();
	const viewGameSources: ViewGameSourceItem[] = [];

	REGISTERED_SOURCE_KEYS.forEach((source) => {
		const adapter = getRuntimeSourceAdapter(source);
		const data = getCandidateSourceData(gameDraft, source);
		if (data) {
			const display = adapter.toDisplayFields(data);
			viewGameSources.push({
				key: source,
				label: t("components.AlertBox.sourceData", "{{source}} 数据", {
					source: adapter.label,
				}),
				name: display.name_cn || display.name,
				image: display.image,
				alt: `${adapter.label} ${display.name ?? ""}`,
			});
		}
	});

	return (
		<AlertBox
			open={open}
			setOpen={setOpen}
			title={title}
			maxWidth={
				viewGameSources.length >= 3
					? "md"
					: viewGameSources.length === 1
						? "xs"
						: "sm"
			}
			message={
				<Box className="flex flex-col gap-3 w-full">
					{warningMessage && (
						<Typography variant="body2" color="warning.main">
							{warningMessage}
						</Typography>
					)}
					<Box className="flex items-start gap-4 w-fit max-w-full">
						{viewGameSources.map((source) => (
							<Box
								key={source.key}
								color="text.primary"
								className="w-48 max-w-full min-w-0 text-left"
							>
								<Typography variant="subtitle1" gutterBottom>
									{source.label}
								</Typography>
								<Typography
									variant="body2"
									className="mb-1"
									noWrap
									title={source.name}
								>
									{source.name}
								</Typography>
								<SmartImage
									src={source.image}
									alt={source.alt}
									className="block w-auto h-auto max-w-full max-h-64 rounded"
								/>
							</Box>
						))}
					</Box>
				</Box>
			}
			onConfirm={onConfirm}
			confirmText={t("components.AlertBox.confirm", "确认")}
			cancelText={t("components.AlertBox.cancel", "取消")}
			confirmColor="primary"
			confirmVariant="contained"
			autoCloseOnConfirm={false}
			isLoading={isLoading}
		/>
	);
};
