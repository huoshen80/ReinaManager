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
} from "@/hooks/queries/useSettings";
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
	const { data: kunProfile, isLoading: isKunProfileLoading } = useKunCurrentUserProfile();
	const setKunTokenMutation = useSetKunToken();
	const [inputToken, setInputToken] = useState("");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [isLoggingIn, setIsLoggingIn] = useState(false);

	useEffect(() => {
		setInputToken(kunToken);
	}, [kunToken]);

	const handleSaveToken = async () => {
		try {
			await setKunTokenMutation.mutateAsync(inputToken);
			snackbar.success(t("pages.Settings.kunTokenSettings.saveSuccess", "Kungal Token 保存成功"));
		} catch (error) {
			snackbar.error(t("pages.Settings.kunTokenSettings.saveError", "Kungal Token 保存失败"));
		}
	};

	const handleLogin = async () => {
		if (!username || !password) {
			snackbar.error(t("pages.Settings.kunTokenSettings.loginInputError"));
			return;
		}
		setIsLoggingIn(true);
		try {
			const response = await kunLogin(username, password);
			if (response.token) {
				await setKunTokenMutation.mutateAsync(response.token);
				snackbar.success(t("pages.Settings.kunTokenSettings.loginSuccess"));
				setPassword("");
			}
		} catch (error) {
			snackbar.error(t("pages.Settings.kunTokenSettings.loginError"));
		} finally {
			setIsLoggingIn(false);
		}
	};

	return (
		<Box className="mb-8">
			<InputLabel className="font-semibold mb-4">{t("pages.Settings.kunToken")}</InputLabel>
			{kunToken && (
				<Box className="mb-4">
					{isKunProfileLoading ? (
						<Typography variant="caption" color="text.secondary">{t("pages.Settings.kunTokenSettings.loadingProfile")}</Typography>
					) : kunProfile ? (
						<Stack direction="row" spacing={2} alignItems="center">
							<Avatar src={kunProfile.avatar} alt={kunProfile.name} />
							<Box>
								<Typography variant="body2" className="font-semibold">{kunProfile.name}</Typography>
								<Typography variant="caption" color="text.secondary">{t("pages.Settings.kunTokenSettings.moemoe", { count: kunProfile.moemoe })}</Typography>
							</Box>
						</Stack>
					) : (
						<Typography variant="caption" color="text.secondary">{t("pages.Settings.kunTokenSettings.profileUnavailable")}</Typography>
					)}
				</Box>
			)}
			<Stack direction="column" spacing={2} className="max-w-md">
				<Stack direction="row" spacing={2}>
					<TextField
						placeholder={t("pages.Settings.kunToken")}
						value={inputToken}
						onChange={(e) => setInputToken(e.target.value)}
						size="small"
						className="flex-grow"
						slotProps={{ htmlInput: { style: { WebkitTextSecurity: "disc", textSecurity: "disc" } } }}
					/>
					<Button variant="contained" onClick={handleSaveToken} disabled={setKunTokenMutation.isPending}>{t("pages.Settings.saveBtn")}</Button>
				</Stack>
				<Divider sx={{ my: 1 }}>{t("pages.Settings.kunTokenSettings.orLogin")}</Divider>
				<Stack direction="row" spacing={2}>
					<TextField label="Username/Email" value={username} onChange={(e) => setUsername(e.target.value)} size="small" className="flex-grow" />
					<TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} size="small" className="flex-grow" />
				</Stack>
				<Button
					variant="outlined"
					fullWidth
					onClick={handleLogin}
					disabled={isLoggingIn}
					startIcon={isLoggingIn && <CircularProgress size={20} />}
				>
					{t("pages.Settings.kunTokenSettings.loginBtn")}
				</Button>
			</Stack>
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
						<Switch checked={syncKunCollection} onChange={(e) => setSyncKunCollection(e.target.checked)} color="primary" />
					</Stack>
				</Box>
			</Box>
		</Box>
	);
};

