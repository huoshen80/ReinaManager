import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import ClearIcon from "@mui/icons-material/Clear";
import LoginIcon from "@mui/icons-material/Login";
import {
	Accordion,
	AccordionDetails,
	AccordionSummary,
	Avatar,
	Chip,
	CircularProgress,
	IconButton,
	InputAdornment,
	Switch,
	Typography,
} from "@mui/material";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { open as openurl } from "@tauri-apps/plugin-shell";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { useProxyImageUrlResolver } from "@/hooks/common/useProxyImageUrlResolver";
import { useBgmAuthController } from "@/hooks/features/useBgmAuthController";
import {
	useAllSettings,
	useUpdateSettings,
	useVndbCurrentUserProfile,
} from "@/hooks/queries/useSettings";
import { getBgmAvatarUrl } from "@/metadata/api/bgm";
import { snackbar } from "@/providers/snackBar";
import { useStore } from "@/store/appStore";
import type { BgmAuth } from "@/types";
import { SettingsGroup, SettingsItem } from "./SettingsLayout";

// ==================== BGM Token 设置 ====================

type BgmAccountActionsProps = {
	showCompleteButton: boolean;
	isCompletingAuth: boolean;
	onCompleteAuth: () => void;
	onLogout: () => void;
};

const BgmAccountActions = ({
	showCompleteButton,
	isCompletingAuth,
	onCompleteAuth,
	onLogout,
}: BgmAccountActionsProps) => {
	const { t } = useTranslation();

	return (
		<Stack direction="row" spacing={1} alignItems="center">
			{showCompleteButton && (
				<Button
					variant="outlined"
					size="small"
					onClick={onCompleteAuth}
					disabled={isCompletingAuth}
				>
					{isCompletingAuth
						? t(
								"pages.Settings.bgmTokenSettings.queryingTokenStatus",
								"正在查询 Token 状态...",
							)
						: t(
								"pages.Settings.bgmTokenSettings.queryTokenStatus",
								"查询 Token 状态",
							)}
				</Button>
			)}
			<Button variant="outlined" color="error" size="small" onClick={onLogout}>
				{t("pages.Settings.bgmTokenSettings.logout", "退出登录")}
			</Button>
		</Stack>
	);
};

type BgmAccountSummaryProps = {
	bgmAuth?: BgmAuth | null;
	isCompletingAuth: boolean;
	onCompleteAuth: () => void;
	onLogout: () => void;
};

const BgmAccountSummary = ({
	bgmAuth,
	isCompletingAuth,
	onCompleteAuth,
	onLogout,
}: BgmAccountSummaryProps) => {
	const { t } = useTranslation();
	const resolveImageUrl = useProxyImageUrlResolver();
	if (!bgmAuth?.access_token) return null;

	const isOAuth = Boolean(bgmAuth.refresh_token);
	const expiresAt = bgmAuth.expires_at ?? null;
	const expiresDate = expiresAt
		? new Date(expiresAt * 1000).toLocaleString()
		: null;
	const isExpired = expiresAt ? Date.now() / 1000 >= expiresAt : false;
	const username = bgmAuth.username ?? "";
	const displayName = bgmAuth.nickname || username;
	const shouldShowCompleteButton =
		!isOAuth && (bgmAuth.expires_at == null || !bgmAuth.username);
	const actions = (
		<BgmAccountActions
			showCompleteButton={shouldShowCompleteButton}
			isCompletingAuth={isCompletingAuth}
			onCompleteAuth={onCompleteAuth}
			onLogout={onLogout}
		/>
	);

	return (
		<Box className="mb-4">
			{username ? (
				<Stack direction="row" spacing={2} alignItems="flex-start">
					<Avatar
						src={resolveImageUrl(getBgmAvatarUrl(username))}
						alt={displayName}
						sx={{ width: 48, height: 48 }}
					/>
					<Box className="min-w-0 flex-1">
						<Stack
							direction="row"
							spacing={1}
							alignItems="center"
							flexWrap="wrap"
						>
							<Typography variant="body1" className="font-semibold">
								{displayName}
							</Typography>
							<Typography variant="caption" color="text.secondary">
								@{username}
							</Typography>
							<Chip
								label={isOAuth ? "OAuth" : "Access Token"}
								size="small"
								color={isOAuth ? "success" : "default"}
								variant="outlined"
							/>
						</Stack>
						<Typography
							variant="caption"
							color={isExpired ? "error.main" : "text.secondary"}
							className="block mt-1"
						>
							{expiresDate
								? t(
										"pages.Settings.bgmTokenSettings.tokenExpiresAt",
										"Token 有效期至: {{date}}",
										{ date: expiresDate },
									)
								: t(
										"pages.Settings.bgmTokenSettings.tokenExpiryUnknown",
										"Token 有效期未知",
									)}
						</Typography>
					</Box>
					{actions}
				</Stack>
			) : (
				<Stack spacing={1} alignItems="flex-start">
					<Typography variant="caption" color="text.secondary">
						{t(
							"pages.Settings.bgmTokenSettings.profileUnavailable",
							"暂无用户信息，请尝试下方按钮以获取用户信息。",
						)}
					</Typography>
					{actions}
				</Stack>
			)}
		</Box>
	);
};

type BgmOAuthLoginButtonProps = {
	isLoading: boolean;
	onLogin: () => void;
};

const BgmOAuthLoginButton = ({
	isLoading,
	onLogin,
}: BgmOAuthLoginButtonProps) => {
	const { t } = useTranslation();

	return (
		<Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
			<Button
				variant="contained"
				color="primary"
				startIcon={<LoginIcon />}
				onClick={onLogin}
				disabled={isLoading}
			>
				{isLoading
					? t(
							"pages.Settings.bgmTokenSettings.oauthWaiting",
							"请在浏览器中完成授权...",
						)
					: t("pages.Settings.bgmTokenSettings.oauthLogin", "OAuth 快捷登录")}
			</Button>
		</Stack>
	);
};

type BgmTokenLoginPanelProps = {
	inputToken: string;
	isSavingToken: boolean;
	onInputTokenChange: (value: string) => void;
	onCommitToken: () => void;
	onClearToken: () => void;
	onOpenTokenPage: () => void;
};

const BgmTokenLoginPanel = ({
	inputToken,
	isSavingToken,
	onInputTokenChange,
	onCommitToken,
	onClearToken,
	onOpenTokenPage,
}: BgmTokenLoginPanelProps) => {
	const { t } = useTranslation();

	return (
		<Box>
			<Accordion>
				<AccordionSummary expandIcon={<ArrowDropDownIcon />}>
					<Typography variant="body2">
						{t(
							"pages.Settings.bgmTokenSettings.tokenLogin",
							"Access Token 登录",
						)}
					</Typography>
				</AccordionSummary>
				<AccordionDetails>
					<Stack spacing={1.5}>
						<TextField
							autoComplete="off"
							placeholder={t(
								"pages.Settings.tokenPlaceholder",
								"请填写你的BGM TOKEN",
							)}
							value={inputToken}
							onChange={(e) => onInputTokenChange(e.target.value)}
							onBlur={onCommitToken}
							onKeyDown={(event) => {
								if (event.key === "Enter" && !event.nativeEvent.isComposing) {
									event.preventDefault();
									(event.target as HTMLInputElement).blur();
								}
							}}
							variant="outlined"
							size="small"
							fullWidth
							disabled={isSavingToken}
							slotProps={{
								htmlInput: {
									style: {
										WebkitTextSecurity: "disc",
										textSecurity: "disc",
									},
								},
								input: {
									endAdornment: isSavingToken ? (
										<InputAdornment position="end">
											<CircularProgress size={18} />
										</InputAdornment>
									) : inputToken ? (
										<InputAdornment position="end">
											<IconButton
												onClick={onClearToken}
												onMouseDown={(event) => event.preventDefault()}
												edge="end"
												size="small"
												aria-label={t(
													"pages.Settings.bgmTokenSettings.clearToken",
													"清除令牌",
												)}
											>
												<ClearIcon />
											</IconButton>
										</InputAdornment>
									) : null,
								},
							}}
						/>
						<Box>
							<Button
								variant="outlined"
								color="primary"
								onMouseDown={(event) => event.preventDefault()}
								onClick={onOpenTokenPage}
								size="small"
							>
								{t("pages.Settings.getToken", "获取令牌")}
							</Button>
						</Box>
					</Stack>
				</AccordionDetails>
			</Accordion>
		</Box>
	);
};

export const BgmTokenSettings = () => {
	const { t } = useTranslation();
	const {
		bgmAuth,
		inputToken,
		isOAuthLoading,
		isCompletingAuth,
		isSavingToken,
		setInputToken,
		handleOpenTokenPage,
		handleSaveToken,
		handleClearToken,
		handleOAuthLogin,
		handleCompleteAuth,
		handleLogout,
	} = useBgmAuthController();

	return (
		<SettingsGroup title={t("pages.Settings.bgmToken", "BGM 令牌")}>
			<Box className="space-y-5">
				<SettingsItem
					stacked
					title={t("pages.Settings.bgmTokenSettings.userInfo", "用户信息")}
				>
					<BgmAccountSummary
						bgmAuth={bgmAuth}
						isCompletingAuth={isCompletingAuth}
						onCompleteAuth={handleCompleteAuth}
						onLogout={handleLogout}
					/>
					{!bgmAuth?.access_token && (
						<Typography variant="caption" color="text.secondary">
							{t(
								"pages.Settings.bgmTokenSettings.profileUnavailable",
								"暂无用户信息，请尝试下方按钮以获取用户信息。",
							)}
						</Typography>
					)}
				</SettingsItem>

				<SettingsItem
					stacked
					title={t("pages.Settings.bgmTokenSettings.loginMethods", "登录方式")}
					description={t(
						"pages.Settings.bgmTokenSettings.loginMethodsHint",
						"请任选一种登录方式，推荐 OAuth 快捷登录。",
					)}
				>
					<Stack spacing={2}>
						<BgmOAuthLoginButton
							isLoading={isOAuthLoading}
							onLogin={handleOAuthLogin}
						/>
						<BgmTokenLoginPanel
							inputToken={inputToken}
							isSavingToken={isSavingToken}
							onInputTokenChange={setInputToken}
							onCommitToken={handleSaveToken}
							onClearToken={handleClearToken}
							onOpenTokenPage={handleOpenTokenPage}
						/>
					</Stack>
				</SettingsItem>
			</Box>
		</SettingsGroup>
	);
};

// ==================== VNDB Token 设置 ====================

export const VndbTokenSettings = () => {
	const { t } = useTranslation();
	const { data: settings } = useAllSettings();
	const vndbToken = settings?.vndb_token ?? "";
	const { data: vndbProfile, isLoading: isVndbProfileLoading } =
		useVndbCurrentUserProfile();
	const updateSettingsMutation = useUpdateSettings();
	const [inputToken, setInputToken] = useState("");

	useEffect(() => {
		setInputToken(vndbToken);
	}, [vndbToken]);

	const handleOpen = () => {
		openurl("https://vndb.org/u/tokens");
	};

	const handleSaveToken = async () => {
		const nextToken = inputToken.trim();
		if (nextToken === vndbToken || updateSettingsMutation.isPending) return;

		try {
			await updateSettingsMutation.mutateAsync({
				vndbToken: nextToken,
			});
			setInputToken(nextToken);
			snackbar.success(
				t(
					"pages.Settings.vndbTokenSettings.saveSuccess",
					"VNDB Token 保存成功",
				),
			);
		} catch (error) {
			console.error(error);
			snackbar.error(
				t("pages.Settings.vndbTokenSettings.saveError", "VNDB Token 保存失败"),
			);
		}
	};

	const handleClearToken = async () => {
		setInputToken("");
		if (!vndbToken || updateSettingsMutation.isPending) return;

		try {
			await updateSettingsMutation.mutateAsync({ vndbToken: "" });
		} catch (error) {
			console.error(error);
			setInputToken(vndbToken);
			snackbar.error(
				t("pages.Settings.vndbTokenSettings.saveError", "VNDB Token 保存失败"),
			);
		}
	};

	return (
		<SettingsGroup title={t("pages.Settings.vndbToken", "VNDB 令牌")}>
			{vndbToken && (
				<Box>
					{isVndbProfileLoading ? (
						<Typography variant="caption" color="text.secondary">
							{t(
								"pages.Settings.vndbTokenSettings.loadingProfile",
								"正在获取当前 VNDB 账号信息...",
							)}
						</Typography>
					) : vndbProfile ? (
						<Box>
							<Typography variant="body2" className="font-semibold">
								{vndbProfile.username}
							</Typography>
							<Typography variant="caption" color="text.secondary">
								{t(
									"pages.Settings.vndbTokenSettings.userId",
									"用户 ID: {{id}}",
									{ id: vndbProfile.id },
								)}
							</Typography>
							<Typography
								variant="caption"
								color="text.secondary"
								className="block"
							>
								{t(
									"pages.Settings.vndbTokenSettings.permissions",
									"权限: {{permissions}}",
									{
										permissions: vndbProfile.permissions.join(", ") || "none",
									},
								)}
							</Typography>
						</Box>
					) : (
						<Typography variant="caption" color="text.secondary">
							{t(
								"pages.Settings.vndbTokenSettings.profileUnavailable",
								"当前 VNDB Token 无法获取用户信息，请检查令牌或权限是否有效。",
							)}
						</Typography>
					)}
				</Box>
			)}

			<Stack spacing={1.5}>
				<TextField
					autoComplete="off"
					placeholder={t(
						"pages.Settings.vndbTokenPlaceholder",
						"请填写你的 VNDB Token",
					)}
					value={inputToken}
					onChange={(e) => setInputToken(e.target.value)}
					onBlur={handleSaveToken}
					onKeyDown={(event) => {
						if (event.key === "Enter" && !event.nativeEvent.isComposing) {
							event.preventDefault();
							(event.target as HTMLInputElement).blur();
						}
						if (event.key === "Escape") {
							event.preventDefault();
							setInputToken(vndbToken);
						}
					}}
					variant="outlined"
					size="small"
					fullWidth
					disabled={updateSettingsMutation.isPending}
					slotProps={{
						htmlInput: {
							style: {
								WebkitTextSecurity: "disc",
								textSecurity: "disc",
							},
						},
						input: {
							endAdornment: updateSettingsMutation.isPending ? (
								<InputAdornment position="end">
									<CircularProgress size={18} />
								</InputAdornment>
							) : inputToken ? (
								<InputAdornment position="end">
									<IconButton
										onClick={handleClearToken}
										onMouseDown={(event) => event.preventDefault()}
										edge="end"
										size="small"
										aria-label={t(
											"pages.Settings.vndbTokenSettings.clearToken",
											"清除令牌",
										)}
									>
										<ClearIcon />
									</IconButton>
								</InputAdornment>
							) : null,
						},
					}}
				/>
				<Box>
					<Button
						variant="outlined"
						color="primary"
						onMouseDown={(event) => event.preventDefault()}
						onClick={handleOpen}
						size="small"
					>
						{t("pages.Settings.getToken", "获取令牌")}
					</Button>
				</Box>
			</Stack>
		</SettingsGroup>
	);
};

// ==================== 收藏同步设置 ====================

export const CollectionSyncSettings = () => {
	const { t } = useTranslation();
	const {
		syncBgmCollection,
		setSyncBgmCollection,
		syncVndbCollection,
		setSyncVndbCollection,
	} = useStore(
		useShallow((s) => ({
			syncBgmCollection: s.syncBgmCollection,
			setSyncBgmCollection: s.setSyncBgmCollection,
			syncVndbCollection: s.syncVndbCollection,
			setSyncVndbCollection: s.setSyncVndbCollection,
		})),
	);

	return (
		<SettingsGroup
			title={t("pages.Settings.collectionSync.title", "收藏状态同步")}
		>
			<SettingsItem
				title={t(
					"pages.Settings.collectionSync.bgmTitle",
					"启用 Bangumi 收藏同步",
				)}
				description={t(
					"pages.Settings.collectionSync.bgmDescription",
					"添加游戏时尝试读取 BGM 收藏状态，本地修改状态时同步回 BGM。",
				)}
			>
				<Switch
					checked={syncBgmCollection}
					onChange={(e) => setSyncBgmCollection(e.target.checked)}
					color="primary"
				/>
			</SettingsItem>
			<SettingsItem
				title={t(
					"pages.Settings.collectionSync.vndbTitle",
					"启用 VNDB 收藏同步",
				)}
				description={t(
					"pages.Settings.collectionSync.vndbDescription",
					"添加游戏时尝试读取 VNDB 收藏状态，本地修改状态时同步回 VNDB。",
				)}
			>
				<Switch
					checked={syncVndbCollection}
					onChange={(e) => setSyncVndbCollection(e.target.checked)}
					color="primary"
				/>
			</SettingsItem>
		</SettingsGroup>
	);
};
