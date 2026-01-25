/**
 * @file PathSettingsModal 路径设置弹窗组件
 * @description 统一的路径设置弹窗，包含游戏存档备份路径、LE转区软件路径、Magpie软件路径、数据库备份路径设置
 * @module src/components/PathSettingsModal/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要功能：
 * - 统一的路径设置弹窗
 * - 条件渲染：设置页面显示所有路径，非设置页面只显示LE和Magpie路径
 * - 集成路径选择、保存等功能
 *
 * 依赖：
 * - @mui/material
 * - @mui/icons-material
 * - @tauri-apps/api/dialog
 * - @/services/settingsService
 * - @/store
 * - react-i18next
 */

import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import SaveIcon from "@mui/icons-material/Save";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import InputLabel from "@mui/material/InputLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { settingsService } from "@/services";
import { handleGetFolder, moveBackupFolder } from "@/utils";

/**
 * 路径设置弹窗组件属性
 */
interface PathSettingsModalProps {
	open: boolean;
	onClose: () => void;
	/** 是否在设置页面显示，如果为false只显示LE和Magpie路径 */
	inSettingsPage?: boolean;
}

/**
 * 路径设置弹窗组件
 * @param {PathSettingsModalProps} props
 * @returns {JSX.Element}
 */
export const PathSettingsModal: React.FC<PathSettingsModalProps> = ({
	open,
	onClose,
	inSettingsPage = true,
}) => {
	const { t } = useTranslation();

	// 游戏存档备份路径状态
	const [savePath, setSavePath] = useState("");
	const [savePathOriginal, setSavePathOriginal] = useState("");
	const [savePathLoading, setSavePathLoading] = useState(false);

	// LE转区软件路径状态
	const [lePath, setLePath] = useState("");
	const [lePathOriginal, setLePathOriginal] = useState("");
	const [lePathLoading, setLePathLoading] = useState(false);

	// Magpie软件路径状态
	const [magpiePath, setMagpiePath] = useState("");
	const [magpiePathOriginal, setMagpiePathOriginal] = useState("");
	const [magpiePathLoading, setMagpiePathLoading] = useState(false);

	// 数据库备份路径状态
	const [dbBackupPath, setDbBackupPath] = useState("");
	const [dbBackupPathOriginal, setDbBackupPathOriginal] = useState("");
	const [dbBackupPathLoading, setDbBackupPathLoading] = useState(false);

	// 弹窗打开时加载数据
	useEffect(() => {
		const loadData = async () => {
			try {
				// 游戏存档备份路径
				if (inSettingsPage) {
					const currentSavePath = await settingsService.getSaveRootPath();
					setSavePath(currentSavePath);
					setSavePathOriginal(currentSavePath);
				}

				// LE转区软件路径
				const currentLePath = await settingsService.getLePath();
				setLePath(currentLePath);
				setLePathOriginal(currentLePath);

				// Magpie软件路径
				const currentMagpiePath = await settingsService.getMagpiePath();
				setMagpiePath(currentMagpiePath);
				setMagpiePathOriginal(currentMagpiePath);

				// 数据库备份路径
				if (inSettingsPage) {
					const currentDbBackupPath = await settingsService.getDbBackupPath();
					setDbBackupPath(currentDbBackupPath);
					setDbBackupPathOriginal(currentDbBackupPath);
				}
			} catch (error) {
				console.error("加载路径设置失败:", error);
			}
		};

		if (open) {
			loadData();
		}
	}, [open, inSettingsPage]);

	/**
	 * 选择文件夹的通用处理函数
	 */
	const handleSelectFolder = async (setter: (path: string) => void) => {
		try {
			const selectedPath = await handleGetFolder();
			if (selectedPath) {
				setter(selectedPath);
			}
		} catch (error) {
			console.error("选择文件夹失败:", error);
		}
	};

	/**
	 * 选择文件的通用处理函数
	 */
	const handleSelectFile = async (
		setter: (path: string) => void,
		fileTypes: string[],
	) => {
		try {
			const { open } = await import("@tauri-apps/plugin-dialog");
			const selectedPath = await open({
				multiple: false,
				filters: [
					{
						name: "Executable Files",
						extensions: fileTypes,
					},
				],
			});
			if (selectedPath && !Array.isArray(selectedPath)) {
				setter(selectedPath);
			}
		} catch (error) {
			console.error("选择文件失败:", error);
		}
	};

	/**
	 * 保存游戏存档备份路径
	 */
	const handleSaveSavePath = async () => {
		if (!savePath.trim()) return;

		try {
			setSavePathLoading(true);
			await settingsService.setSaveRootPath(savePath);

			// 如果路径发生了变化，需要移动备份文件夹
			if (savePathOriginal !== savePath || savePathOriginal !== "") {
				try {
					const moveResult = await moveBackupFolder(savePathOriginal, savePath);
					if (moveResult) {
						setSavePathOriginal(savePath);
					}
				} catch (moveError) {
					console.warn("移动备份文件夹失败:", moveError);
				}
			} else {
				setSavePathOriginal(savePath);
			}
		} catch (error) {
			console.error("保存游戏存档备份路径失败:", error);
		} finally {
			setSavePathLoading(false);
		}
	};

	/**
	 * 保存LE转区软件路径
	 */
	const handleSaveLePath = async () => {
		try {
			setLePathLoading(true);
			await settingsService.setLePath(lePath);
			setLePathOriginal(lePath);
		} catch (error) {
			console.error("保存LE转区软件路径失败:", error);
		} finally {
			setLePathLoading(false);
		}
	};

	/**
	 * 保存Magpie软件路径
	 */
	const handleSaveMagpiePath = async () => {
		try {
			setMagpiePathLoading(true);
			await settingsService.setMagpiePath(magpiePath);
			setMagpiePathOriginal(magpiePath);
		} catch (error) {
			console.error("保存Magpie软件路径失败:", error);
		} finally {
			setMagpiePathLoading(false);
		}
	};

	/**
	 * 保存数据库备份路径
	 */
	const handleSaveDbBackupPath = async () => {
		try {
			setDbBackupPathLoading(true);
			await settingsService.setDbBackupPath(dbBackupPath);
			setDbBackupPathOriginal(dbBackupPath);
		} catch (error) {
			console.error("保存数据库备份路径失败:", error);
		} finally {
			setDbBackupPathLoading(false);
		}
	};

	return (
		<Dialog
			open={open}
			onClose={onClose}
			maxWidth="md"
			fullWidth
			PaperProps={{
				sx: { minHeight: "60vh" },
			}}
		>
			<DialogTitle>
				{t("components.PathSettingsModal.title", "路径设置")}
			</DialogTitle>
			<DialogContent>
				<Box className="space-y-6">
					{/* 游戏存档备份路径设置 */}
					{inSettingsPage && (
						<Box>
							<InputLabel className="font-semibold mb-4">
								{t(
									"components.PathSettingsModal.savePath.title",
									"游戏存档备份路径",
								)}
							</InputLabel>
							<Stack
								direction="row"
								spacing={2}
								alignItems="center"
								className="mb-2"
							>
								<TextField
									label={t(
										"components.PathSettingsModal.savePath.pathLabel",
										"备份根目录路径",
									)}
									variant="outlined"
									value={savePath}
									onChange={(e) => setSavePath(e.target.value)}
									className="min-w-60 flex-grow"
									placeholder={t(
										"components.PathSettingsModal.savePath.pathPlaceholder",
										"留空使用默认路径",
									)}
									disabled={savePathLoading || !isTauri()}
								/>
								<Button
									variant="outlined"
									onClick={() => handleSelectFolder(setSavePath)}
									disabled={savePathLoading || !isTauri()}
									startIcon={<FolderOpenIcon />}
									className="px-4 py-2"
								>
									{t(
										"components.PathSettingsModal.savePath.selectBtn",
										"选择目录",
									)}
								</Button>
								<Button
									variant="contained"
									color="primary"
									onClick={handleSaveSavePath}
									disabled={
										savePathLoading ||
										savePath === savePathOriginal ||
										!isTauri()
									}
									startIcon={<SaveIcon />}
									className="px-4 py-2"
								>
									{savePathLoading
										? t("components.PathSettingsModal.saving", "保存中...")
										: t("components.PathSettingsModal.saveBtn", "保存")}
								</Button>
							</Stack>
							<Typography
								variant="caption"
								color="text.secondary"
								className="block mt-1"
							>
								{t(
									"components.PathSettingsModal.savePath.note",
									"设置游戏存档的备份根目录路径，留空将使用默认路径",
								)}
							</Typography>
						</Box>
					)}

					{/* LE转区软件路径设置 */}
					<Box>
						<InputLabel className="font-semibold mb-4">
							{t("components.PathSettingsModal.lePath.title", "LE转区软件路径")}
						</InputLabel>
						<Stack
							direction="row"
							spacing={2}
							alignItems="center"
							className="mb-2"
						>
							<TextField
								label={t(
									"components.PathSettingsModal.lePath.pathLabel",
									"LE转区软件路径",
								)}
								variant="outlined"
								value={lePath}
								onChange={(e) => setLePath(e.target.value)}
								className="min-w-60 flex-grow"
								placeholder={t(
									"components.PathSettingsModal.lePath.pathPlaceholder",
									"选择LE转区软件的可执行文件",
								)}
								disabled={lePathLoading || !isTauri()}
							/>
							<Button
								variant="outlined"
								onClick={() => handleSelectFile(setLePath, ["exe"])}
								disabled={lePathLoading || !isTauri()}
								startIcon={<FolderOpenIcon />}
								className="px-4 py-2"
							>
								{t("components.PathSettingsModal.lePath.selectBtn", "选择文件")}
							</Button>
							<Button
								variant="contained"
								color="primary"
								onClick={handleSaveLePath}
								disabled={
									lePathLoading || lePath === lePathOriginal || !isTauri()
								}
								startIcon={<SaveIcon />}
								className="px-4 py-2"
							>
								{lePathLoading
									? t("components.PathSettingsModal.saving", "保存中...")
									: t("components.PathSettingsModal.saveBtn", "保存")}
							</Button>
						</Stack>
						<Typography
							variant="caption"
							color="text.secondary"
							className="block mt-1"
						>
							{t(
								"components.PathSettingsModal.lePath.note",
								"设置LE转区软件的可执行文件路径，用于游戏启动时的转区功能",
							)}
						</Typography>
					</Box>

					{/* Magpie软件路径设置 */}
					<Box>
						<InputLabel className="font-semibold mb-4">
							{t(
								"components.PathSettingsModal.magpiePath.title",
								"Magpie软件路径",
							)}
						</InputLabel>
						<Stack
							direction="row"
							spacing={2}
							alignItems="center"
							className="mb-2"
						>
							<TextField
								label={t(
									"components.PathSettingsModal.magpiePath.pathLabel",
									"Magpie软件路径",
								)}
								variant="outlined"
								value={magpiePath}
								onChange={(e) => setMagpiePath(e.target.value)}
								className="min-w-60 flex-grow"
								placeholder={t(
									"components.PathSettingsModal.magpiePath.pathPlaceholder",
									"选择Magpie软件的可执行文件",
								)}
								disabled={magpiePathLoading || !isTauri()}
							/>
							<Button
								variant="outlined"
								onClick={() => handleSelectFile(setMagpiePath, ["exe"])}
								disabled={magpiePathLoading || !isTauri()}
								startIcon={<FolderOpenIcon />}
								className="px-4 py-2"
							>
								{t(
									"components.PathSettingsModal.magpiePath.selectBtn",
									"选择文件",
								)}
							</Button>
							<Button
								variant="contained"
								color="primary"
								onClick={handleSaveMagpiePath}
								disabled={
									magpiePathLoading ||
									magpiePath === magpiePathOriginal ||
									!isTauri()
								}
								startIcon={<SaveIcon />}
								className="px-4 py-2"
							>
								{magpiePathLoading
									? t("components.PathSettingsModal.saving", "保存中...")
									: t("components.PathSettingsModal.saveBtn", "保存")}
							</Button>
						</Stack>
						<Typography
							variant="caption"
							color="text.secondary"
							className="block mt-1"
						>
							{t(
								"components.PathSettingsModal.magpiePath.note",
								"设置Magpie软件的可执行文件路径，用于游戏画面的放大功能",
							)}
						</Typography>
					</Box>

					{/* 数据库备份路径设置 */}
					{inSettingsPage && (
						<Box>
							<InputLabel className="font-semibold mb-4">
								{t(
									"components.PathSettingsModal.dbBackupPath.title",
									"数据库备份路径",
								)}
							</InputLabel>
							<Stack
								direction="row"
								spacing={2}
								alignItems="center"
								className="mb-2"
							>
								<TextField
									label={t(
										"components.PathSettingsModal.dbBackupPath.pathLabel",
										"备份保存路径",
									)}
									variant="outlined"
									value={dbBackupPath}
									onChange={(e) => setDbBackupPath(e.target.value)}
									className="min-w-60 flex-grow"
									placeholder={t(
										"components.PathSettingsModal.dbBackupPath.pathPlaceholder",
										"留空使用默认路径",
									)}
									disabled={dbBackupPathLoading || !isTauri()}
								/>
								<Button
									variant="outlined"
									onClick={() => handleSelectFolder(setDbBackupPath)}
									disabled={dbBackupPathLoading || !isTauri()}
									startIcon={<FolderOpenIcon />}
									className="px-4 py-2"
								>
									{t(
										"components.PathSettingsModal.dbBackupPath.selectBtn",
										"选择目录",
									)}
								</Button>
								<Button
									variant="contained"
									color="primary"
									onClick={handleSaveDbBackupPath}
									disabled={
										dbBackupPathLoading ||
										dbBackupPath === dbBackupPathOriginal ||
										!isTauri()
									}
									startIcon={<SaveIcon />}
									className="px-4 py-2"
								>
									{dbBackupPathLoading
										? t("components.PathSettingsModal.saving", "保存中...")
										: t("components.PathSettingsModal.saveBtn", "保存")}
								</Button>
							</Stack>
							<Typography
								variant="caption"
								color="text.secondary"
								className="block mt-1"
							>
								{t(
									"components.PathSettingsModal.dbBackupPath.note",
									"设置数据库备份文件的保存路径，留空将使用默认路径（AppData/data/backups），或便携模式下的程序目录",
								)}
							</Typography>
						</Box>
					)}
				</Box>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose}>
					{t("components.PathSettingsModal.close", "关闭")}
				</Button>
			</DialogActions>
		</Dialog>
	);
};
