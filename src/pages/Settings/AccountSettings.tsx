import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import CancelIcon from "@mui/icons-material/Cancel";
import ClearIcon from "@mui/icons-material/Clear";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import LoginIcon from "@mui/icons-material/Login";
import SyncIcon from "@mui/icons-material/Sync";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import {
	Accordion,
	AccordionDetails,
	AccordionSummary,
	Avatar,
	Chip,
	CircularProgress,
	Divider,
	IconButton,
	InputAdornment,
	Paper,
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
import {
	useAllSettings,
	useUpdateSettings,
	useVndbCurrentUserProfile,
} from "@/hooks/queries/useSettings";
import { getBgmAvatarUrl } from "@/metadata/api/bgm";
import type { HikarinagiUserProfile } from "@/metadata/api/hikarinagi";
import { snackbar } from "@/providers/snackBar";
import { hasHikarinagiScope } from "@/services/oauth/hikarinagiAuthSession";
import { useStore } from "@/store/appStore";
import type { BgmAuth, HikarinagiAuth } from "@/types";
import { useBgmAuthController } from "./useBgmAuthController";
import { useHikarinagiAuthController } from "./useHikarinagiAuthController";

// ==================== 品牌字标 组件 ====================

/** Bangumi 官方字标 */
const BgmWordmarkSVG = () => (
	<Box
		component="img"
		src="/images/bangumi-wordmark.png"
		alt="Bangumi"
		sx={{ height: 24, width: "auto", objectFit: "contain" }}
	/>
);

/** Hikarinagi 官方字标 */
const HikarinagiWordmarkSVG = () => (
	<Box
		component="img"
		src="/images/hikarinagi-wordmark.svg"
		alt="Hikarinagi"
		sx={{
			height: 22,
			width: "auto",
			objectFit: "contain",
			filter: (theme) =>
				theme.palette.mode === "dark" ? "brightness(0) invert(1)" : "none",
		}}
	/>
);

/** VNDB 官方字标 */
const VndbWordmarkSVG = () => (
	<Box
		component="img"
		src="/images/vndb-wordmark.svg"
		alt="VNDB"
		sx={{
			height: 18,
			width: "auto",
			objectFit: "contain",
			filter: (theme) =>
				theme.palette.mode === "dark" ? "brightness(0) invert(1)" : "none",
		}}
	/>
);

// ==================== BGM 账号与同步板块 ====================

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
		<Box className="mb-2">
			{username ? (
				<Stack direction="row" spacing={2} alignItems="flex-start">
					<Avatar
						src={resolveImageUrl(getBgmAvatarUrl(username))}
						alt={displayName}
						sx={{ width: 44, height: 44 }}
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
				actions
			)}
		</Box>
	);
};

export const BgmProviderSection = () => {
	const { t } = useTranslation();
	const {
		bgmAuth,
		isSettingsLoading,
		inputToken,
		isOAuthLoading,
		isCompletingAuth,
		isSavingToken,
		setInputToken,
		handleOpenTokenPage,
		handleSaveToken,
		handleClearToken,
		handleOAuthLogin,
		handleCancelOAuth,
		handleCompleteAuth,
		handleLogout,
	} = useBgmAuthController();

	const { syncBgmCollection, setSyncBgmCollection, openCloudCollectionImport } =
		useStore(
			useShallow((s) => ({
				syncBgmCollection: s.syncBgmCollection,
				setSyncBgmCollection: s.setSyncBgmCollection,
				openCloudCollectionImport: s.openCloudCollectionImport,
			})),
		);

	const isConnected = Boolean(bgmAuth?.access_token);

	useEffect(() => {
		if (!isSettingsLoading && !isConnected && syncBgmCollection) {
			setSyncBgmCollection(false);
		}
	}, [isConnected, isSettingsLoading, setSyncBgmCollection, syncBgmCollection]);

	return (
		<Paper
			variant="outlined"
			sx={{
				p: 2.5,
				borderRadius: 1,
				borderColor: "divider",
			}}
		>
			{/* 头部字标 */}
			<Stack
				direction="row"
				justifyContent="space-between"
				alignItems="center"
				className="mb-2"
			>
				<BgmWordmarkSVG />
				{!isConnected && (
					<Chip label="未登录" size="small" variant="outlined" />
				)}
			</Stack>

			{/* 平台功能描述 */}
			<Typography variant="body2" color="text.secondary" className="mb-4">
				{t(
					"pages.Settings.bgmTokenSettings.description",
					"使用 Bangumi 账号登录以读取元数据、游玩状态和推送评价。",
				)}
			</Typography>

			{/* 登录与账号状态 */}
			<Box className="space-y-4">
				{isConnected ? (
					<BgmAccountSummary
						bgmAuth={bgmAuth}
						isCompletingAuth={isCompletingAuth}
						onCompleteAuth={handleCompleteAuth}
						onLogout={handleLogout}
					/>
				) : (
					<Stack spacing={2} alignItems="flex-start">
						{/* 登录方式提示 */}
						<Typography variant="caption" color="text.secondary">
							{t(
								"pages.Settings.bgmTokenSettings.loginMethodsHint",
								"请任选一种登录方式，推荐 OAuth 快捷登录。",
							)}
						</Typography>

						<Stack direction="row" spacing={2} alignItems="center">
							<Button
								variant="contained"
								color={isOAuthLoading ? "warning" : "primary"}
								startIcon={isOAuthLoading ? <CancelIcon /> : <LoginIcon />}
								onClick={isOAuthLoading ? handleCancelOAuth : handleOAuthLogin}
							>
								{isOAuthLoading
									? t(
											"pages.Settings.bgmTokenSettings.oauthCancel",
											"取消 BGM OAuth 登录",
										)
									: t(
											"pages.Settings.bgmTokenSettings.oauthLogin",
											"OAuth 快捷登录",
										)}
							</Button>
						</Stack>

						<Accordion
							elevation={0}
							sx={{
								width: "100%",
								border: "1px solid",
								borderColor: "divider",
								"&:before": { display: "none" },
								borderRadius: 1,
							}}
						>
							<AccordionSummary expandIcon={<ArrowDropDownIcon />}>
								<Stack direction="row" spacing={1} alignItems="center">
									<VpnKeyIcon fontSize="small" color="action" />
									<Typography variant="body2">
										{t(
											"pages.Settings.bgmTokenSettings.tokenLogin",
											"使用 Access Token 登录",
										)}
									</Typography>
								</Stack>
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
										onChange={(e) => setInputToken(e.target.value)}
										onBlur={handleSaveToken}
										onKeyDown={(event) => {
											if (
												event.key === "Enter" &&
												!event.nativeEvent.isComposing
											) {
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
															onClick={handleClearToken}
															edge="end"
															size="small"
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
											onClick={handleOpenTokenPage}
											size="small"
										>
											{t("pages.Settings.getToken", "获取令牌")}
										</Button>
									</Box>
								</Stack>
							</AccordionDetails>
						</Accordion>
					</Stack>
				)}
			</Box>
			{isConnected && (
				<Button
					variant="outlined"
					size="small"
					startIcon={<CloudDownloadIcon />}
					onClick={() => openCloudCollectionImport("bgm")}
					className="mt-3"
				>
					{t("pages.Settings.importCloudCollection", "导入云端收藏")}
				</Button>
			)}

			<Divider className="my-4" />

			{/* 同步设置控制 */}
			<Stack direction="row" justifyContent="space-between" alignItems="center">
				<Box>
					<Stack direction="row" spacing={1} alignItems="center">
						<SyncIcon fontSize="small" color="action" />
						<Typography variant="subtitle2" className="font-semibold">
							{t("pages.Settings.collectionSync.bgmTitle", "Bangumi 收藏同步")}
						</Typography>
					</Stack>
					<Typography variant="caption" color="text.secondary">
						{t(
							"pages.Settings.collectionSync.bgmDescription",
							"添加游戏时自动读取 BGM 状态，修改时实时同步回 BGM。",
						)}
					</Typography>
				</Box>
				<Switch
					checked={isConnected && syncBgmCollection}
					onChange={(e) => setSyncBgmCollection(e.target.checked)}
					disabled={isSettingsLoading || !isConnected}
					color="primary"
				/>
			</Stack>
		</Paper>
	);
};

export const BgmTokenSettings = BgmProviderSection;

// ==================== Hikarinagi 账号与同步板块 ====================

type HikarinagiAccountSummaryProps = {
	auth?: HikarinagiAuth | null;
	profile?: HikarinagiUserProfile | null;
	onLogout: () => void;
};

const HikarinagiAccountSummary = ({
	auth,
	profile,
	onLogout,
}: HikarinagiAccountSummaryProps) => {
	const { t } = useTranslation();
	const resolveImageUrl = useProxyImageUrlResolver();
	if (!auth?.access_token) return null;

	const expiresAt = auth.expires_at ?? null;
	const expiresDate = expiresAt
		? new Date(expiresAt * 1000).toLocaleString()
		: null;
	const isExpired = expiresAt ? Date.now() / 1000 >= expiresAt : false;
	const displayName = auth.name || `#${auth.user_id ?? "?"}`;

	return (
		<Stack direction="row" spacing={2} alignItems="flex-start" className="mb-2">
			<Avatar
				src={resolveImageUrl(profile?.avatar?.src)}
				alt={displayName}
				sx={{ width: 44, height: 44 }}
			>
				{displayName.slice(0, 1).toUpperCase()}
			</Avatar>
			<Box className="min-w-0 flex-1">
				<Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
					<Typography variant="body1" className="font-semibold">
						{displayName}
					</Typography>
					<Chip label="OAuth" size="small" color="primary" variant="outlined" />
				</Stack>
				{auth.user_id != null && (
					<Typography
						variant="caption"
						color="text.secondary"
						className="block"
					>
						{t("pages.Settings.hikarinagiAuth.userId", "用户 ID: {{id}}", {
							id: auth.user_id,
						})}
					</Typography>
				)}
				<Typography
					variant="caption"
					color={isExpired ? "error.main" : "text.secondary"}
					className="block mt-1"
				>
					{expiresDate
						? t(
								"pages.Settings.hikarinagiAuth.tokenExpiresAt",
								"Token 有效期至: {{date}}",
								{ date: expiresDate },
							)
						: t(
								"pages.Settings.hikarinagiAuth.tokenExpiryUnknown",
								"Token 有效期未知",
							)}
				</Typography>
			</Box>
			<Button variant="outlined" color="error" size="small" onClick={onLogout}>
				{t("pages.Settings.hikarinagiAuth.logout", "退出登录")}
			</Button>
		</Stack>
	);
};

export const HikarinagiProviderSection = () => {
	const { t } = useTranslation();
	const {
		hikarinagiAuth,
		hikarinagiProfile,
		isSettingsLoading,
		isOAuthLoading,
		isSaving,
		handleOAuthLogin,
		handleCancelOAuth,
		handleLogout,
	} = useHikarinagiAuthController();

	const {
		syncHikarinagiCollection,
		setSyncHikarinagiCollection,
		openCloudCollectionImport,
	} = useStore(
		useShallow((s) => ({
			syncHikarinagiCollection: s.syncHikarinagiCollection,
			setSyncHikarinagiCollection: s.setSyncHikarinagiCollection,
			openCloudCollectionImport: s.openCloudCollectionImport,
		})),
	);

	const isConnected = Boolean(hikarinagiAuth?.access_token);

	useEffect(() => {
		if (!isSettingsLoading && !isConnected && syncHikarinagiCollection) {
			setSyncHikarinagiCollection(false);
		}
	}, [
		isConnected,
		isSettingsLoading,
		setSyncHikarinagiCollection,
		syncHikarinagiCollection,
	]);

	return (
		<Paper
			variant="outlined"
			sx={{
				p: 2.5,
				borderRadius: 1,
				borderColor: "divider",
			}}
		>
			{/* 头部字标 */}
			<Stack
				direction="row"
				justifyContent="space-between"
				alignItems="center"
				className="mb-2"
			>
				<HikarinagiWordmarkSVG />
				{!isConnected && (
					<Chip label="未登录" size="small" variant="outlined" />
				)}
			</Stack>

			{/* 平台功能描述 */}
			<Typography variant="body2" color="text.secondary" className="mb-4">
				{t(
					"pages.Settings.hikarinagiAuth.description",
					"使用 Hikarinagi OAuth 登录以读取元数据、游玩状态和推送评价。",
				)}
			</Typography>

			{/* 账号及授权操作 */}
			<Box className="space-y-4">
				{isConnected ? (
					<HikarinagiAccountSummary
						auth={hikarinagiAuth}
						profile={hikarinagiProfile}
						onLogout={handleLogout}
					/>
				) : (
					<Stack spacing={2} alignItems="flex-start">
						<Button
							variant="contained"
							color={isOAuthLoading ? "warning" : "primary"}
							startIcon={
								isSaving ? (
									<CircularProgress size={18} />
								) : isOAuthLoading ? (
									<CancelIcon />
								) : (
									<LoginIcon />
								)
							}
							onClick={isOAuthLoading ? handleCancelOAuth : handleOAuthLogin}
							disabled={isSaving}
						>
							{isOAuthLoading
								? t(
										"pages.Settings.hikarinagiAuth.oauthCancel",
										"取消 Hikarinagi OAuth 登录",
									)
								: t(
										"pages.Settings.hikarinagiAuth.oauthLogin",
										"OAuth 快捷登录",
									)}
						</Button>
					</Stack>
				)}
			</Box>
			{isConnected && (
				<Stack direction="row" spacing={1} className="mt-3">
					{hasHikarinagiScope(hikarinagiAuth, "catalog:full") ? (
						<Button
							variant="outlined"
							size="small"
							startIcon={<CloudDownloadIcon />}
							onClick={() => openCloudCollectionImport("hikarinagi")}
						>
							{t("pages.Settings.importCloudCollection", "导入云端收藏")}
						</Button>
					) : (
						<Button
							variant="outlined"
							size="small"
							onClick={handleOAuthLogin}
							disabled={isOAuthLoading || isSaving}
						>
							{t(
								"pages.Settings.hikarinagiAuth.upgradePermission",
								"更新授权以导入完整收藏",
							)}
						</Button>
					)}
				</Stack>
			)}

			<Divider className="my-4" />

			{/* 同步设置控制 */}
			<Stack direction="row" justifyContent="space-between" alignItems="center">
				<Box>
					<Stack direction="row" spacing={1} alignItems="center">
						<SyncIcon fontSize="small" color="action" />
						<Typography variant="subtitle2" className="font-semibold">
							{t(
								"pages.Settings.collectionSync.hikarinagiTitle",
								"Hikarinagi 游玩状态同步",
							)}
						</Typography>
					</Stack>
					<Typography variant="caption" color="text.secondary">
						{t(
							"pages.Settings.collectionSync.hikarinagiDescription",
							"添加游戏时自动读取 Hikarinagi 游玩状态，本地修改状态实时同步。",
						)}
					</Typography>
				</Box>
				<Switch
					checked={isConnected && syncHikarinagiCollection}
					onChange={(e) => setSyncHikarinagiCollection(e.target.checked)}
					disabled={isSettingsLoading || !isConnected}
					color="primary"
				/>
			</Stack>
		</Paper>
	);
};

export const HikarinagiAuthSettings = HikarinagiProviderSection;

// ==================== VNDB 账号与同步板块 ====================

export const VndbProviderSection = () => {
	const { t } = useTranslation();
	const { data: settings, isLoading: isSettingsLoading } = useAllSettings();
	const vndbToken = settings?.vndb_token ?? "";
	const { data: vndbProfile, isLoading: isVndbProfileLoading } =
		useVndbCurrentUserProfile();
	const updateSettingsMutation = useUpdateSettings();
	const [inputToken, setInputToken] = useState("");

	const {
		syncVndbCollection,
		setSyncVndbCollection,
		openCloudCollectionImport,
	} = useStore(
		useShallow((s) => ({
			syncVndbCollection: s.syncVndbCollection,
			setSyncVndbCollection: s.setSyncVndbCollection,
			openCloudCollectionImport: s.openCloudCollectionImport,
		})),
	);

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

	const hasVndbToken = Boolean(vndbToken);
	const isConnected = Boolean(hasVndbToken && vndbProfile);

	useEffect(() => {
		if (!isSettingsLoading && !hasVndbToken && syncVndbCollection) {
			setSyncVndbCollection(false);
		}
	}, [
		hasVndbToken,
		isSettingsLoading,
		setSyncVndbCollection,
		syncVndbCollection,
	]);

	return (
		<Paper
			variant="outlined"
			sx={{
				p: 2.5,
				borderRadius: 1,
				borderColor: "divider",
			}}
		>
			{/* 头部字标 */}
			<Stack
				direction="row"
				justifyContent="space-between"
				alignItems="center"
				className="mb-2"
			>
				<VndbWordmarkSVG />
				{!isConnected && (
					<Chip label="未登录" size="small" variant="outlined" />
				)}
			</Stack>

			{/* 平台功能描述 */}
			<Typography variant="body2" color="text.secondary" className="mb-4">
				{t(
					"pages.Settings.vndbTokenSettings.description",
					"使用 VNDB Token 登录以读取游玩状态和推送评价。",
				)}
			</Typography>

			{/* 账号 Profile 及 Token 设置 */}
			<Box className="space-y-4">
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
							<Typography variant="caption" color="error">
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
											edge="end"
											size="small"
										>
											<ClearIcon />
										</IconButton>
									</InputAdornment>
								) : null,
							},
						}}
					/>
					{!hasVndbToken && (
						<Box>
							<Button
								variant="outlined"
								color="primary"
								onClick={handleOpen}
								size="small"
							>
								{t("pages.Settings.getToken", "获取令牌")}
							</Button>
						</Box>
					)}
				</Stack>
			</Box>
			{isConnected && vndbProfile?.permissions.includes("listread") && (
				<Button
					variant="outlined"
					size="small"
					startIcon={<CloudDownloadIcon />}
					onClick={() => openCloudCollectionImport("vndb")}
					className="mt-3"
				>
					{t("pages.Settings.importCloudCollection", "导入云端收藏")}
				</Button>
			)}

			<Divider className="my-4" />

			{/* 同步设置控制 */}
			<Stack direction="row" justifyContent="space-between" alignItems="center">
				<Box>
					<Stack direction="row" spacing={1} alignItems="center">
						<SyncIcon fontSize="small" color="action" />
						<Typography variant="subtitle2" className="font-semibold">
							{t("pages.Settings.collectionSync.vndbTitle", "VNDB 收藏同步")}
						</Typography>
					</Stack>
					<Typography variant="caption" color="text.secondary">
						{t(
							"pages.Settings.collectionSync.vndbDescription",
							"添加游戏时自动读取 VNDB 收藏状态，修改时实时同步回 BGM。",
						)}
					</Typography>
				</Box>
				<Switch
					checked={hasVndbToken && syncVndbCollection}
					onChange={(e) => setSyncVndbCollection(e.target.checked)}
					disabled={isSettingsLoading || !hasVndbToken}
					color="primary"
				/>
			</Stack>
		</Paper>
	);
};

export const VndbTokenSettings = VndbProviderSection;

// 保留 CollectionSyncSettings 供旧界面防报错导出
export const CollectionSyncSettings = () => null;

// ==================== 对外主封装组件：AccountSettings (每个板块独立 Paper 卡片) ====================

export const AccountSettings = () => {
	return (
		<Stack spacing={2.5}>
			<BgmProviderSection />
			<HikarinagiProviderSection />
			<VndbProviderSection />
		</Stack>
	);
};

export const AccountAndSyncSettings = AccountSettings;

export default AccountSettings;
