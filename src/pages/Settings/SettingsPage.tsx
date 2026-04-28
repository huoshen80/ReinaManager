import { Breadcrumbs, Link, Typography } from "@mui/material";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import InputLabel from "@mui/material/InputLabel";
import { PageContainer } from "@toolpad/core/PageContainer";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";
import { PathSettingsModal } from "@/components/PathSettingsModal";
import { useScrollRestore } from "@/hooks/common/useScrollRestore";
import { AboutSection } from "./AboutSettings";
import {
	BgmTokenSettings,
	CollectionSyncSettings,
	VndbTokenSettings,
} from "./AccountSettings";
import {
	DevSettings,
	MixedSearchSourceSettings,
	VndbDataSettings,
} from "./DataSourceSettings";
import {
	CardClickModeSettings,
	LanguageSelect,
	NsfwSettings,
} from "./GeneralSettings";
import { DatabaseBackupSettings } from "./MaintenanceSettings";
import {
	AutoStartSettings,
	CloseBtnSettings,
	LinuxLaunchCommandSettings,
	LogLevelSettings,
	TimeTrackingModeSettings,
} from "./SystemSettings";

type SettingsSection = {
	id: string;
	label: string;
	description: string;
	content: React.ReactNode;
};

type SettingsPageHeaderProps = {
	title?: string;
	breadcrumbs?: { title: string; path: string }[];
};

const SettingsPageHeader: React.FC<SettingsPageHeaderProps> = ({
	title,
	breadcrumbs = [],
}) => (
	<Box>
		<Breadcrumbs aria-label="breadcrumb">
			{breadcrumbs.map((item) => (
				<Link
					key={`${item.path}-${item.title}`}
					component={RouterLink}
					to={item.path}
					underline="hover"
					color="inherit"
				>
					{item.title}
				</Link>
			))}
		</Breadcrumbs>
		<Typography variant="h4" component="h1" className="mt-1">
			{title}
		</Typography>
	</Box>
);

/**
 * Settings 组件
 * 应用设置页面，组织各设置分区。
 */
export const Settings: React.FC = () => {
	const { t } = useTranslation();
	useScrollRestore("/settings");
	const [pathSettingsModalOpen, setPathSettingsModalOpen] = useState(false);
	const [activeSectionId, setActiveSectionId] = useState("account");
	const pageTitle = t("app.NAVIGATION.settings", "Settings");
	const breadcrumbs = useMemo(
		() => [
			{ title: t("app.NAVIGATION.home", "Home"), path: "/" },
			{ title: pageTitle, path: "/settings" },
		],
		[t, pageTitle],
	);

	const sections = useMemo<SettingsSection[]>(
		() => [
			{
				id: "account",
				label: t("pages.Settings.sections.account", "账号与同步"),
				description: t(
					"pages.Settings.sections.accountDescription",
					"管理数据源账号令牌和收藏同步行为。",
				),
				content: (
					<>
						<BgmTokenSettings />
						<Divider className="my-6" />
						<VndbTokenSettings />
						<Divider className="my-6" />
						<CollectionSyncSettings />
					</>
				),
			},
			{
				id: "data-source",
				label: t("pages.Settings.sections.dataSource", "数据源"),
				description: t(
					"pages.Settings.sections.dataSourceDescription",
					"配置搜索源、VNDB 数据处理和批量数据维护。",
				),
				content: (
					<>
						<MixedSearchSourceSettings />
						<Divider className="my-6" />
						<VndbDataSettings />
						<Divider className="my-6" />
						<DevSettings />
					</>
				),
			},
			{
				id: "display",
				label: t("pages.Settings.sections.display", "显示与交互"),
				description: t(
					"pages.Settings.sections.displayDescription",
					"调整语言、内容过滤和游戏卡片交互方式。",
				),
				content: (
					<>
						<LanguageSelect />
						<Divider className="my-6" />
						<NsfwSettings />
						<Divider className="my-6" />
						<CardClickModeSettings />
					</>
				),
			},
			{
				id: "system",
				label: t("pages.Settings.sections.system", "系统"),
				description: t(
					"pages.Settings.sections.systemDescription",
					"管理启动、日志、关闭行为和计时模式。",
				),
				content: (
					<>
						<AutoStartSettings />
						<Divider className="my-6" />
						<LogLevelSettings />
						<Divider className="my-6" />
						<CloseBtnSettings />
						<Divider className="my-6" />
						<TimeTrackingModeSettings />
						{import.meta.env.TAURI_ENV_PLATFORM === "linux" && (
							<>
								<Divider className="my-6" />
								<LinuxLaunchCommandSettings />
							</>
						)}
					</>
				),
			},
			{
				id: "storage",
				label: t("pages.Settings.sections.storage", "路径与备份"),
				description: t(
					"pages.Settings.sections.storageDescription",
					"配置本地路径，执行数据库备份和恢复。",
				),
				content: (
					<>
						<Box className="mb-6">
							<InputLabel className="font-semibold mb-4">
								{t("pages.Settings.pathSettings.title", "路径设置")}
							</InputLabel>
							<Button
								variant="outlined"
								onClick={() => setPathSettingsModalOpen(true)}
								className="px-4 py-2"
							>
								{t("pages.Settings.pathSettings.openModal", "打开路径设置")}
							</Button>
							<Typography
								variant="caption"
								color="text.secondary"
								className="block mt-2"
							>
								{t(
									"pages.Settings.pathSettings.note",
									"配置游戏存档备份、LE转区软件、Magpie软件、数据库备份等路径",
								)}
							</Typography>
						</Box>
						<Divider className="my-6" />
						<DatabaseBackupSettings />
					</>
				),
			},
			{
				id: "about",
				label: t("pages.Settings.sections.about", "关于"),
				description: t(
					"pages.Settings.sections.aboutDescription",
					"查看版本、更新状态、文档和反馈入口。",
				),
				content: <AboutSection />,
			},
		],
		[t],
	);

	useEffect(() => {
		const sectionElements = sections
			.map((section) => document.getElementById(section.id))
			.filter((element): element is HTMLElement => Boolean(element));

		const observer = new IntersectionObserver(
			(entries) => {
				const visibleEntry = entries
					.filter((entry) => entry.isIntersecting)
					.toSorted((a, b) => b.intersectionRatio - a.intersectionRatio)
					.at(0);

				if (visibleEntry) {
					setActiveSectionId(visibleEntry.target.id);
				}
			},
			{
				root: document.querySelector("main"),
				rootMargin: "-16px 0px -70% 0px",
				threshold: [0.1, 0.3, 0.6],
			},
		);

		for (const element of sectionElements) {
			observer.observe(element);
		}

		return () => observer.disconnect();
	}, [sections]);

	const handleSectionClick = (sectionId: string) => {
		document
			.getElementById(sectionId)
			?.scrollIntoView({ behavior: "smooth", block: "start" });
	};

	return (
		<PageContainer
			className="w-full max-w-full"
			title={pageTitle}
			breadcrumbs={breadcrumbs}
			slots={{ header: SettingsPageHeader }}
			sx={{ maxWidth: "100% !important" }}
		>
			<Box className="w-full">
				<Box className="grid w-full grid-cols-1 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)]">
					<nav
						className="sticky top-4 z-10 h-fit overflow-x-auto border-0 border-b border-solid border-[var(--mui-palette-divider)] bg-[var(--mui-palette-background-default)] py-3 lg:border-b-0 lg:border-r lg:py-5 lg:pr-4"
						aria-label={t("pages.Settings.navigation", "设置分类导航")}
					>
						<Box className="flex min-w-max gap-2 lg:min-w-0 lg:flex-col">
							{sections.map((section) => {
								const isActive = section.id === activeSectionId;

								return (
									<button
										key={section.id}
										type="button"
										onClick={() => handleSectionClick(section.id)}
										className={`rounded-md border-0 px-3 py-2 text-left text-sm transition-colors lg:w-full ${
											isActive
												? "bg-[var(--mui-palette-primary-main)] text-[var(--mui-palette-primary-contrastText)] font-semibold"
												: "bg-transparent text-[var(--mui-palette-text-primary)] hover:bg-[var(--mui-palette-action-hover)]"
										}`}
									>
										{section.label}
									</button>
								);
							})}
						</Box>
					</nav>

					<Box className="min-w-0 space-y-8 pt-5 lg:pl-6">
						{sections.map((section) => (
							<section
								key={section.id}
								id={section.id}
								className="scroll-mt-24 lg:scroll-mt-8 border-0 border-b border-solid border-[var(--mui-palette-divider)] pb-8 last:border-b-0 last:pb-0"
							>
								<Box className="mb-6">
									<Typography
										variant="h6"
										component="h2"
										className="font-semibold"
									>
										{section.label}
									</Typography>
									<Typography
										variant="body2"
										color="text.secondary"
										className="mt-1"
									>
										{section.description}
									</Typography>
								</Box>
								{section.content}
							</section>
						))}
					</Box>
				</Box>
			</Box>

			{/* 路径设置弹窗 */}
			<PathSettingsModal
				open={pathSettingsModalOpen}
				onClose={() => setPathSettingsModalOpen(false)}
				inSettingsPage={true}
			/>
		</PageContainer>
	);
};
