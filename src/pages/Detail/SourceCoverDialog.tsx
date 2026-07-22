import RestartAltIcon from "@mui/icons-material/RestartAlt";
import {
	Box,
	Button,
	ButtonBase,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Stack,
	Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { useProxyImageUrlResolver } from "@/hooks/common/useProxyImageUrlResolver";
import { getRuntimeSourceAdapter } from "@/metadata";
import type { SourceImageOption } from "@/metadata/data/sourceImage";
import type { SourceType } from "@/types";

interface SourceCoverDialogProps {
	open: boolean;
	options: SourceImageOption[];
	currentSource: SourceType | null;
	hasCustomCover: boolean;
	disabled: boolean;
	onClose: () => void;
	onSelect: (source: SourceType) => void;
	onReset: () => void;
}

const getSourceLabel = (source: SourceType): string =>
	getRuntimeSourceAdapter(source).label;

export function SourceCoverDialog({
	open,
	options,
	currentSource,
	hasCustomCover,
	disabled,
	onClose,
	onSelect,
	onReset,
}: SourceCoverDialogProps) {
	const { t } = useTranslation();
	const resolveImageUrl = useProxyImageUrlResolver();
	const sourceCoverAutoRule = options
		.map((option) => getSourceLabel(option.source))
		.join(" > ");
	const statusText = currentSource
		? t(
				"pages.Detail.GameInfoEdit.sourceCoverSelected",
				"数据源封面：{{source}}",
				{ source: getSourceLabel(currentSource) },
			)
		: t("pages.Detail.GameInfoEdit.sourceCoverAuto", "数据源封面：自动");

	return (
		<Dialog
			open={open}
			onClose={onClose}
			PaperProps={{ className: "w-fit min-w-75 max-w-[calc(100vw-32px)]" }}
		>
			<DialogTitle>
				{t(
					"pages.Detail.GameInfoEdit.sourceCoverDialogTitle",
					"选择数据源封面",
				)}
			</DialogTitle>
			<DialogContent>
				<Stack spacing={2}>
					<Typography variant="body2" color="textSecondary">
						{statusText}
					</Typography>
					<Typography variant="caption" color="textSecondary">
						{t(
							"pages.Detail.GameInfoEdit.sourceCoverAutoRule",
							"自动规则：{{rule}}",
							{ rule: sourceCoverAutoRule },
						)}
					</Typography>
					{hasCustomCover && (
						<Typography variant="caption" color="warning.main">
							{t(
								"pages.Detail.GameInfoEdit.sourceCoverCustomCoverNotice",
								"当前本地自定义封面优先显示，移除后才会显示数据源封面。",
							)}
						</Typography>
					)}
					<Box className="flex max-w-[calc(100vw-64px)] justify-center gap-1.5 overflow-x-auto">
						{options.map((option) => {
							const selected = currentSource === option.source;
							return (
								<ButtonBase
									key={option.source}
									onClick={() => onSelect(option.source)}
									disabled={disabled}
									className="block w-30 flex-none overflow-hidden rounded text-left"
									sx={{
										border: 2,
										borderStyle: "solid",
										borderColor: selected ? "primary.main" : "divider",
										backgroundColor: selected
											? "action.selected"
											: "transparent",
									}}
								>
									<Box
										component="img"
										src={resolveImageUrl(option.image)}
										alt={getSourceLabel(option.source)}
										className="block w-full aspect-[3/4] object-cover"
										sx={{ bgcolor: "action.hover" }}
									/>
									<Box className="p-1">
										<Typography variant="caption" component="div">
											{getSourceLabel(option.source)}
										</Typography>
										{selected && (
											<Typography
												variant="caption"
												component="div"
												color="primary"
											>
												{t(
													"pages.Detail.GameInfoEdit.sourceCoverSelectedBadge",
													"已选择",
												)}
											</Typography>
										)}
									</Box>
								</ButtonBase>
							);
						})}
					</Box>
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose} disabled={disabled}>
					{t("pages.Detail.GameInfoEdit.closeSourceCoverDialog", "关闭")}
				</Button>
				<Button
					onClick={onReset}
					disabled={disabled}
					startIcon={<RestartAltIcon />}
				>
					{t("pages.Detail.GameInfoEdit.resetSourceCover", "重置为自动")}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
