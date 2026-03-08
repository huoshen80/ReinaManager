/**
 * @file InputDialog 通用输入对话框
 * @description 提供统一的输入对话框组件，用于添加分组、分类等需要用户输入的场景
 * @module src/components/CommonDialog/InputDialog
 * @author ReinaManager
 * @copyright AGPL-3.0
 */

import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface InputDialogProps {
	open: boolean;
	onClose: () => void;
	onConfirm: (value: string) => Promise<void>;
	title: string;
	label: string;
	placeholder?: string;
	defaultValue?: string;
}

export const InputDialog: React.FC<InputDialogProps> = ({
	open,
	onClose,
	onConfirm,
	title,
	label,
	placeholder,
	defaultValue = "",
}) => {
	const { t } = useTranslation();
	const [value, setValue] = useState(defaultValue);
	const [isProcessing, setIsProcessing] = useState(false);

	const handleConfirm = async () => {
		const trimmedValue = value.trim();
		if (!trimmedValue) return;

		setIsProcessing(true);
		try {
			await onConfirm(trimmedValue);
			setValue("");
			onClose();
		} catch (error) {
			console.error("操作失败:", error);
		} finally {
			setIsProcessing(false);
		}
	};

	const handleClose = () => {
		if (!isProcessing) {
			setValue("");
			onClose();
		}
	};

	return (
		<Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
			<DialogTitle>
				<Box display="flex" alignItems="center" justifyContent="space-between">
					<Typography variant="h6">{title}</Typography>
					<IconButton
						onClick={handleClose}
						size="small"
						disabled={isProcessing}
					>
						<CloseIcon />
					</IconButton>
				</Box>
			</DialogTitle>
			<DialogContent>
				<TextField
					autoFocus
					fullWidth
					label={label}
					placeholder={placeholder}
					value={value}
					onChange={(e) => setValue(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && value.trim()) {
							handleConfirm();
						}
					}}
					disabled={isProcessing}
					sx={{ mt: 1 }}
				/>
			</DialogContent>
			<DialogActions>
				<Button onClick={handleClose} disabled={isProcessing}>
					{t("common.cancel")}
				</Button>
				<Button
					onClick={handleConfirm}
					variant="contained"
					disabled={!value.trim() || isProcessing}
				>
					{isProcessing ? t("common.saving") : t("common.confirm")}
				</Button>
			</DialogActions>
		</Dialog>
	);
};
