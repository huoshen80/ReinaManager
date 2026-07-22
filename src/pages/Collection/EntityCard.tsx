/**
 * @file Collection EntityCard 组件
 * @description 收藏夹分组/分类卡片，支持删除和右键菜单
 * @module src/pages/Collection/EntityCard
 * @author ReinaManager
 * @copyright AGPL-3.0
 */

import DeleteIcon from "@mui/icons-material/Delete";
import FolderIcon from "@mui/icons-material/Folder";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { memo, useState } from "react";
import { AlertConfirmBox } from "@/components/AlertBox";

interface EntityCardProps {
	/** 实体信息 */
	entity: {
		id: string | number;
		name: string;
		count: number;
	};
	/** 点击卡片回调 */
	onClick: () => void;
	/** 悬停提示 */
	title?: string;
	/** 是否撑满父容器高度 */
	fillHeight?: boolean;
	/** 是否单行省略标题 */
	titleNoWrap?: boolean;
	/** 删除回调 */
	onDelete?: (id: string | number) => void;
	/** 右键菜单回调 */
	onContextMenu: (
		e: React.MouseEvent,
		id: string | number,
		name: string,
	) => void;
	/** 是否显示删除按钮 */
	showDelete?: boolean;
	/** 删除确认对话框标题 */
	deleteTitle: string;
	/** 删除确认对话框消息 */
	deleteMessage: string;
	/** 计数单位文本 */
	countLabel: string;
}

/**
 * 通用实体卡片组件
 * 用于分组和分类的统一展示
 */
export const EntityCard = memo<EntityCardProps>(
	({
		entity,
		onClick,
		title,
		fillHeight = false,
		titleNoWrap = false,
		onDelete,
		onContextMenu,
		showDelete = true,
		deleteTitle,
		deleteMessage,
		countLabel,
	}) => {
		const canDelete = Boolean(showDelete && onDelete);
		const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
		const [isDeleting, setIsDeleting] = useState(false);

		const handleDeleteClick = (e: React.MouseEvent) => {
			e.stopPropagation();
			setDeleteDialogOpen(true);
		};

		const handleConfirmDelete = async () => {
			if (!onDelete) return;
			setIsDeleting(true);
			try {
				await onDelete(entity.id);
			} finally {
				setIsDeleting(false);
				setDeleteDialogOpen(false);
			}
		};

		const handleContextMenu = (e: React.MouseEvent) => {
			e.preventDefault();
			onContextMenu(e, entity.id, entity.name);
		};

		return (
			<Box
				sx={{
					p: 1,
					position: "relative",
					...(fillHeight && { boxSizing: "border-box", height: "100%" }),
				}}
			>
				<Card
					onContextMenu={handleContextMenu}
					sx={fillHeight ? { height: "100%" } : undefined}
				>
					<CardActionArea
						onClick={onClick}
						title={title}
						sx={fillHeight ? { height: "100%" } : undefined}
					>
						<CardContent sx={fillHeight ? { height: "100%" } : undefined}>
							<Box display="flex" alignItems="center" gap={1} mb={1}>
								<FolderIcon color="primary" />
								<Typography
									variant="h6"
									component="div"
									noWrap={titleNoWrap}
									sx={titleNoWrap ? { minWidth: 0 } : undefined}
								>
									{entity.name}
								</Typography>
							</Box>
							<Typography variant="body2" color="text.secondary">
								{entity.count} {countLabel}
							</Typography>
						</CardContent>
					</CardActionArea>
					{canDelete && (
						<IconButton
							sx={{
								position: "absolute",
								top: 8,
								right: 8,
								zIndex: 2,
								"&:hover": {
									bgcolor: "error.light",
									color: "error.contrastText",
								},
							}}
							size="small"
							onClick={handleDeleteClick}
							disabled={isDeleting}
						>
							<DeleteIcon fontSize="small" />
						</IconButton>
					)}
				</Card>
				{canDelete && (
					<AlertConfirmBox
						open={deleteDialogOpen}
						setOpen={setDeleteDialogOpen}
						onConfirm={handleConfirmDelete}
						isLoading={isDeleting}
						title={deleteTitle}
						message={deleteMessage}
					/>
				)}
			</Box>
		);
	},
);

EntityCard.displayName = "EntityCard";
