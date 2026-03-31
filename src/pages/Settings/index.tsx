import {
	Box,
	Divider,
	InputLabel,
	Typography,
	Button,
} from "@mui/material";
import { PageContainer } from "@toolpad/core/PageContainer";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PathSettingsModal } from "@/components/PathSettingsModal";
import { useScrollRestore } from "@/hooks/common/useScrollRestore";
import { LanguageSelect, AutoStartSettings } from "./GeneralSettings";
import { AccountSettings } from "./AccountSettings";
import {
	DatabaseBackupSettings,
	TimeTrackingModeSettings,
} from "./DataSettings";
import { AdvancedSettings } from "./AdvancedSettings";
import { AboutSection } from "./AboutSection";
import { NsfwSettings, CardClickModeSettings } from "./PreferenceSettings";
import { VndbDataSettings } from "./VndbDataSettings";

/**
 * 设置页面主组件 - 严格还原原始布局与顺序
 */
export const Settings: React.FC = () => {
	const { t } = useTranslation();
	useScrollRestore("/settings", { containerSelector: "main" });
	const [pathSettingsModalOpen, setPathSettingsModalOpen] = useState(false);

	return (
		<PageContainer className="max-w-full">
			<Box
				className="settings-scroll-container"
				sx={{
					pr: 2,
					py: 4,
				}}
			>
				{/* 1. Bangumi Token 设置 */}
				<AccountSettings /> {/* AccountSettings 内部已按原顺序排列 BGM, VNDB, Kun, Sync */}
				<Divider sx={{ my: 3 }} />

				{/* 2. 语言设置 */}
				<LanguageSelect />
				<Divider sx={{ my: 3 }} />

				{/* 3. VNDB 数据设置 */}
				<VndbDataSettings />
				<Divider sx={{ my: 3 }} />

				{/* 4. NSFW 设置 */}
				<NsfwSettings />
				<Divider sx={{ my: 3 }} />

				{/* 5. 卡片点击模式设置 */}
				<CardClickModeSettings />
				<Divider sx={{ my: 3 }} />

				{/* 6. 自启动设置 */}
				<AutoStartSettings />
				<Divider sx={{ my: 3 }} />

				{/* 7. 日志级别设置 */}
				<AdvancedSettings /> {/* AdvancedSettings 内部含 LogLevel, CloseBtn, LinuxSettings, Dev */}
				<Divider sx={{ my: 3 }} />

				{/* 8. 路径设置入口 */}
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
				<Divider sx={{ my: 3 }} />

				{/* 9. 数据库备份与恢复 */}
				<DatabaseBackupSettings />
				<Divider sx={{ my: 3 }} />

				{/* 10. 计时模式设置 */}
				<TimeTrackingModeSettings />

				<Divider sx={{ my: 3 }} />

				{/* 11. 关于 */}
				<AboutSection />
				<Box sx={{ height: 40 }} />
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

export default Settings;
