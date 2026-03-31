import ClearIcon from "@mui/icons-material/Clear";
import {
	Avatar,
	Box,
	Button,
	CircularProgress,
	Divider,
	IconButton,
	InputAdornment,
	InputLabel,
	Stack,
	Switch,
	TextField,
	Typography,
} from "@mui/material";
import { open as openurl } from "@tauri-apps/plugin-shell";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { login as kunLogin } from "@/api/kun";
import {
	useBgmCurrentUserProfile,
	useBgmToken,
	useKunCurrentUserProfile,
	useKunToken,
	useSetBgmToken,
	useSetKunToken,
	useSetVndbToken,
	useVndbCurrentUserProfile,
	useVndbToken,
	settingsKeys,
} from "@/hooks/queries/useSettings";
import { useQueryClient } from "@tanstack/react-query";
import { snackbar } from "@/providers/snackBar";
import { useStore } from "@/store/appStore";

/**
 * Bangumi 令牌设置组件
 */
const BgmTokenSettings = () => {
	const { t } = useTranslation();
	const { data: bgmToken = "" } = useBgmToken();
	const { data: bgmProfile, isLoading: isBgmProfileLoading } = useBgmCurrentUserProfile();
	const setBgmTokenMutation = useSetBgmToken();
	const [inputToken, setInputToken] = useState("");

	useEffect(() => {
		setInputToken(bgmToken);
	}, [bgmToken]);

	const handleSaveToken = async () => {
		try {
			await setBgmTokenMutation.mutateAsync(inputToken);
			snackbar.success(t("pages.Settings.bgmTokenSettings.saveSuccess", "BGM Token 保存成功"));
		} catch (error) {
			snackbar.error(t("pages.Settings.bgmTokenSettings.saveError", "BGM Token 保存失败"));
		}
	};

	return (
		<Box className="mb-8">
			<InputLabel className="font-semibold mb-4">{t("pages.Settings.bgmToken")}</InputLabel>
			{bgmToken && (
				<Box className="mb-4">
					{isBgmProfileLoading ? (
						<Typography variant="caption" color="text.secondary">{t("pages.Settings.bgmTokenSettings.loadingProfile")}</Typography>
					) : bgmProfile ? (
						<Stack direction="row" spacing={2} alignItems="center">
							<Avatar src={bgmProfile.avatar?.large} alt={bgmProfile.nickname || bgmProfile.username} />
							<Box>
								<Typography variant="body2" className="font-semibold">{bgmProfile.nickname || bgmProfile.username}</Typography>
								<Typography variant="caption" color="text.secondary">@{bgmProfile.username}</Typography>
							</Box>
						</Stack>
					) : (
						<Typography variant="caption" color="text.secondary">{t("pages.Settings.bgmTokenSettings.profileUnavailable")}</Typography>
					)}
				</Box>
			)}
			<Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
				<TextField
					placeholder={t("pages.Settings.tokenPlaceholder")}
					value={inputToken}
					onChange={(e) => setInputToken(e.target.value)}
					size="small"
					className="min-w-60"
					slotProps={{
						htmlInput: { style: { WebkitTextSecurity: "disc", textSecurity: "disc" } },
						input: {
							endAdornment: inputToken && (
								<InputAdornment position="end">
									<IconButton onClick={() => setInputToken("")} edge="end" size="small"><ClearIcon /></IconButton>
								</InputAdornment>
							),
						},
					}}
				/>
				<Button variant="contained" onClick={handleSaveToken} disabled={setBgmTokenMutation.isPending}>{t("pages.Settings.saveBtn")}</Button>
				<Button variant="outlined" onClick={() => openurl("https://next.bgm.tv/demo/access-token/create")}>{t("pages.Settings.getToken")}</Button>
			</Stack>
		</Box>
	);
};

/**
 * VNDB 令牌设置组件
 */
const VndbTokenSettings = () => {
	const { t } = useTranslation();
	const { data: vndbToken = "" } = useVndbToken();
	const { data: vndbProfile, isLoading: isVndbProfileLoading } = useVndbCurrentUserProfile();
	const setVndbTokenMutation = useSetVndbToken();
	const [inputToken, setInputToken] = useState("");

	useEffect(() => {
		setInputToken(vndbToken);
	}, [vndbToken]);

	const handleSaveToken = async () => {
		try {
			await setVndbTokenMutation.mutateAsync(inputToken);
			snackbar.success(t("pages.Settings.vndbTokenSettings.saveSuccess", "VNDB Token 保存成功"));
		} catch (error) {
			snackbar.error(t("pages.Settings.vndbTokenSettings.saveError", "VNDB Token 保存失败"));
		}
	};

	return (
		<Box className="mb-8">
			<InputLabel className="font-semibold mb-4">{t("pages.Settings.vndbToken", "VNDB Token")}</InputLabel>
			{vndbToken && (
				<Box className="mb-4">
					{isVndbProfileLoading ? (
						<Typography variant="caption" color="text.secondary">{t("pages.Settings.vndbTokenSettings.loadingProfile")}</Typography>
					) : vndbProfile ? (
						<Box>
							<Typography variant="body2" className="font-semibold">{vndbProfile.username}</Typography>
							<Typography variant="caption" color="text.secondary">ID: {vndbProfile.id}</Typography>
						</Box>
					) : (
						<Typography variant="caption" color="text.secondary">{t("pages.Settings.vndbTokenSettings.profileUnavailable")}</Typography>
					)}
				</Box>
			)}
			<Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
				<TextField
					placeholder="VNDB Token"
					value={inputToken}
					onChange={(e) => setInputToken(e.target.value)}
					size="small"
					className="min-w-60"
					slotProps={{
						htmlInput: { style: { WebkitTextSecurity: "disc", textSecurity: "disc" } },
						input: {
							endAdornment: inputToken && (
								<InputAdornment position="end">
									<IconButton onClick={() => setInputToken("")} edge="end" size="small"><ClearIcon /></IconButton>
								</InputAdornment>
							),
						},
					}}
				/>
				<Button variant="contained" onClick={handleSaveToken} disabled={setVndbTokenMutation.isPending}>{t("pages.Settings.saveBtn")}</Button>
				<Button variant="outlined" onClick={() => openurl("https://vndb.org/u/tokens")}>{t("pages.Settings.getToken")}</Button>
			</Stack>
		</Box>
	);
};

/**
 * Kungal 令牌与登录设置组件
 */
const KunTokenSettings = () => {
	const { t } = useTranslation();
	const { data: kunToken = "" } = useKunToken();
	const { data: kunProfile } = useKunCurrentUserProfile();
	const setKunTokenMutation = useSetKunToken();
	const queryClient = useQueryClient();
	const { setKunUserData } = useStore(
		useShallow((s) => ({
			setKunUserData: s.setKunUserData,
		}))
	);
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [isLoggingIn, setIsLoggingIn] = useState(false);

	const handleLogin = async () => {
		if (!username || !password) {
			snackbar.error(t("pages.Settings.kunTokenSettings.loginInputError"));
			return;
		}
		setIsLoggingIn(true);
		try {
			const loginResult = await kunLogin(username, password);
			if (loginResult.token) {
				// 1. 持久化 Token
				await setKunTokenMutation.mutateAsync(loginResult.token);

				// 2. 持久化与预热用户信息
				if (loginResult.name) {
					setKunUserData(loginResult);
					queryClient.setQueryData(settingsKeys.kunCurrentUserProfileByToken(loginResult.token), loginResult);
				}

				snackbar.success(t("pages.Settings.kunTokenSettings.loginSuccess"));
				setPassword("");
				setUsername("");
			} else {
				snackbar.error(t("pages.Settings.kunTokenSettings.loginError"));
			}
		} catch (error) {
			console.error("Kungal login failed:", error);
			snackbar.error(t("pages.Settings.kunTokenSettings.loginError"));
		} finally {
			setIsLoggingIn(false);
		}
	};

	const handleLogout = async () => {
		try {
			await setKunTokenMutation.mutateAsync("");
			snackbar.success(t("pages.Settings.kunTokenSettings.logoutSuccess", "Kungal 账户已退出"));
		} catch (error) {
			snackbar.error(t("pages.Settings.kunTokenSettings.logoutError", "退出登录失败"));
		}
	};

	return (
		<Box className="mb-8">
			<InputLabel className="font-semibold mb-4">{t("pages.Settings.kunToken")}</InputLabel>

			{kunToken && kunProfile ? (
				<Box className="max-w-md p-4 border border-divider rounded-lg bg-action-hover">
					<Stack direction="row" spacing={3} alignItems="center" justifyContent="space-between">
						<Stack direction="row" spacing={2} alignItems="center">
							<Avatar
								src={kunProfile.avatarMin || kunProfile.avatar}
								alt={kunProfile.name}
								sx={{ width: 56, height: 56 }}
							/>
							<Box>
								<Typography variant="body1" className="font-semibold">{kunProfile.name}</Typography>
								<Typography variant="caption" color="text.secondary">
									{t("pages.Settings.kunTokenSettings.moemoe", { count: kunProfile.moemoepoint || 0 })}
								</Typography>
								{kunProfile.isCheckIn && (
									<Typography variant="caption" color="success.main" display="block">
										✓ {t("pages.Settings.kunTokenSettings.checkedIn", "今日已签到")}
									</Typography>
								)}
							</Box>
						</Stack>
						<Button variant="outlined" color="error" size="small" onClick={handleLogout}>
							{t("pages.Settings.kunTokenSettings.logoutBtn", "退出登录")}
						</Button>
					</Stack>
				</Box>
			) : (
				<Stack direction="column" spacing={2} className="max-w-md">
					<Typography variant="body2" color="text.secondary" className="mb-2">
						{t("pages.Settings.kunTokenSettings.loginHint", "使用 Kungal 账号登录以同步收藏状态")}
					</Typography>
					<Stack direction="row" spacing={2}>
						<TextField
							label="Username/Email"
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							size="small"
							className="flex-grow"
						/>
						<TextField
							label="Password"
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							size="small"
							className="flex-grow"
						/>
					</Stack>
					<Button
						variant="contained"
						fullWidth
						onClick={handleLogin}
						disabled={isLoggingIn}
						startIcon={isLoggingIn && <CircularProgress size={20} color="inherit" />}
					>
						{isLoggingIn ? t("pages.Settings.kunTokenSettings.loggingIn") : t("pages.Settings.kunTokenSettings.loginBtn")}
					</Button>
				</Stack>
			)}
		</Box>
	);
};

/**
 * 账户与同步主组件
 */
export const AccountSettings = () => {
	const { t } = useTranslation();
	const {
		syncBgmCollection,
		setSyncBgmCollection,
		syncVndbCollection,
		setSyncVndbCollection,
		syncKunCollection,
		setSyncKunCollection,
	} = useStore(
		useShallow((s) => ({
			syncBgmCollection: s.syncBgmCollection,
			setSyncBgmCollection: s.setSyncBgmCollection,
			syncVndbCollection: s.syncVndbCollection,
			setSyncVndbCollection: s.setSyncVndbCollection,
			syncKunCollection: s.syncKunCollection,
			setSyncKunCollection: s.setSyncKunCollection,
		}))
	);

	return (
		<Box>
			<BgmTokenSettings />
			<Divider sx={{ my: 4 }} />
			<VndbTokenSettings />
			<Divider sx={{ my: 4 }} />
			<KunTokenSettings />
			<Divider sx={{ my: 4 }} />

			<Box className="mb-6">
				<InputLabel className="font-semibold mb-4">{t("pages.Settings.collectionSync.title")}</InputLabel>
				<Box className="pl-2 space-y-4">
					<Stack direction="row" alignItems="center" justifyContent="space-between" className="max-w-md">
						<Box>
							<Typography variant="body2">{t("pages.Settings.collectionSync.bgmTitle")}</Typography>
							<Typography variant="caption" color="text.secondary">{t("pages.Settings.collectionSync.bgmDescription")}</Typography>
						</Box>
						<Switch checked={syncBgmCollection} onChange={(e) => setSyncBgmCollection(e.target.checked)} color="primary" />
					</Stack>
					<Stack direction="row" alignItems="center" justifyContent="space-between" className="max-w-md">
						<Box>
							<Typography variant="body2">{t("pages.Settings.collectionSync.vndbTitle")}</Typography>
							<Typography variant="caption" color="text.secondary">{t("pages.Settings.collectionSync.vndbDescription")}</Typography>
						</Box>
						<Switch checked={syncVndbCollection} onChange={(e) => setSyncVndbCollection(e.target.checked)} color="primary" />
					</Stack>
					<Stack direction="row" alignItems="center" justifyContent="space-between" className="max-w-md">
						<Box>
							<Typography variant="body2">{t("pages.Settings.collectionSync.kunTitle")}</Typography>
							<Typography variant="caption" color="text.secondary">{t("pages.Settings.collectionSync.kunDescription")}</Typography>
						</Box>
						<Switch disabled checked={syncKunCollection} onChange={(e) => setSyncKunCollection(e.target.checked)} color="primary" />
					</Stack>
				</Box>
			</Box>
		</Box>
	);
};

