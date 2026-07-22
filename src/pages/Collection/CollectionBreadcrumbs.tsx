import FolderIcon from "@mui/icons-material/Folder";
import HomeIcon from "@mui/icons-material/Home";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

export type CollectionLevel = "groups" | "categories" | "games";

interface CollectionBreadcrumbsProps {
	level: CollectionLevel;
	groupName: string;
	categoryName: string;
	onNavigate: (level: "root" | "group") => void;
}

const BREADCRUMB_LINK_SX = {
	color: "inherit",
	"&:hover": { color: "primary.dark" },
} as const;

export function CollectionBreadcrumbs({
	level,
	groupName,
	categoryName,
	onNavigate,
}: CollectionBreadcrumbsProps) {
	const { t } = useTranslation();
	const groupLabel = t("pages.Collection.breadcrumb.group", "分组");

	return (
		<Box
			className="sticky top-0 z-10 pt-4 mb-2"
			sx={{ backgroundColor: "background.default", borderColor: "divider" }}
		>
			{level === "groups" ? (
				<Typography variant="h4">{groupLabel}</Typography>
			) : (
				<Breadcrumbs
					separator={<NavigateNextIcon fontSize="small" />}
					aria-label="breadcrumb"
				>
					<Link
						underline="hover"
						className="flex items-center cursor-pointer"
						sx={BREADCRUMB_LINK_SX}
						onClick={() => onNavigate("root")}
					>
						<HomeIcon className="mr-1" sx={{ fontSize: "inherit" }} />
						{groupLabel}
					</Link>
					{level === "games" ? (
						<Link
							underline="hover"
							className="flex items-center cursor-pointer"
							sx={BREADCRUMB_LINK_SX}
							onClick={() => onNavigate("group")}
						>
							<FolderIcon className="mr-1" sx={{ fontSize: "inherit" }} />
							{groupName}
						</Link>
					) : (
						<Typography
							className="flex items-center font-600"
							sx={{ color: "text.primary" }}
						>
							<FolderIcon className="mr-1" sx={{ fontSize: "inherit" }} />
							{groupName}
						</Typography>
					)}
					{level === "games" && (
						<Typography
							className="flex items-center font-600"
							sx={{ color: "text.primary" }}
						>
							{categoryName}
						</Typography>
					)}
				</Breadcrumbs>
			)}
		</Box>
	);
}
