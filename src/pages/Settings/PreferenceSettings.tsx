import {
	Box,
	FormControlLabel,
	InputLabel,
	Radio,
	RadioGroup,
	Switch,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "@/store/appStore";

/**
 * NSFW 设置组件
 */
export const NsfwSettings = () => {
	const { t } = useTranslation();
	const { nsfwFilter, setNsfwFilter, nsfwCoverReplace, setNsfwCoverReplace } = useStore(
		useShallow((s) => ({
			nsfwFilter: s.nsfwFilter,
			setNsfwFilter: s.setNsfwFilter,
			nsfwCoverReplace: s.nsfwCoverReplace,
			setNsfwCoverReplace: s.setNsfwCoverReplace,
		}))
	);

	return (
		<Box className="mb-6">
			<InputLabel className="font-semibold mb-4">{t("pages.Settings.nsfw.title")}</InputLabel>
			<Box className="pl-2">
				<FormControlLabel
					control={<Switch checked={nsfwFilter} onChange={(e) => setNsfwFilter(e.target.checked)} color="primary" />}
					label={t("pages.Settings.nsfw.filter")}
				/>
				<FormControlLabel
					control={<Switch checked={nsfwCoverReplace} onChange={(e) => setNsfwCoverReplace(e.target.checked)} color="primary" />}
					label={t("pages.Settings.nsfw.coverReplace")}
				/>
			</Box>
		</Box>
	);
};

/**
 * 卡片点击模式设置组件
 */
export const CardClickModeSettings = () => {
	const { t } = useTranslation();
	const { cardClickMode, setCardClickMode, doubleClickLaunch, setDoubleClickLaunch } = useStore(
		useShallow((s) => ({
			cardClickMode: s.cardClickMode,
			setCardClickMode: s.setCardClickMode,
			doubleClickLaunch: s.doubleClickLaunch,
			setDoubleClickLaunch: s.setDoubleClickLaunch,
		}))
	);

	return (
		<Box className="mb-6">
			<InputLabel className="font-semibold mb-4">{t("pages.Settings.cardClickMode.title")}</InputLabel>
			<Box className="pl-2">
				<RadioGroup value={cardClickMode} onChange={(e) => setCardClickMode(e.target.value as any)}>
					<FormControlLabel value="navigate" control={<Radio color="primary" />} label={t("pages.Settings.cardClickMode.navigate")} />
					<FormControlLabel value="select" control={<Radio color="primary" />} label={t("pages.Settings.cardClickMode.select")} />
				</RadioGroup>
				<FormControlLabel
					control={<Switch checked={doubleClickLaunch} onChange={(e) => setDoubleClickLaunch(e.target.checked)} color="primary" />}
					label={t("pages.Settings.cardClickMode.doubleClickLaunch")}
				/>
			</Box>
		</Box>
	);
};
