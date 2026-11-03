import {
	Box,
	Button,
	Checkbox,
	Chip,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	LinearProgress,
	Stack,
	Tooltip,
	Typography,
} from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Virtuoso } from "react-virtuoso";
import {
	useAllGames,
	useApplyLibraryEnrichment,
} from "@/hooks/queries/useGames";
import { useAllSettings } from "@/hooks/queries/useSettings";
import { getRuntimeSourceAdapter } from "@/metadata/sourceRegistry";
import { snackbar } from "@/providers/snackBar";
import {
	buildLibraryEnrichmentUpdate,
	createLibraryEnrichmentItems,
	type LibraryEnrichmentItem,
	prepareLibraryEnrichment,
} from "@/services/librarySourceEnrichment";
import { getMetadataRequestContext } from "@/services/requestContext";
import { isSourceType } from "@/types";
import { getUserErrorMessage } from "@/utils/errors";

function canApply(item: LibraryEnrichmentItem) {
	return (
		item.completed &&
		!item.conflicts.length &&
		buildLibraryEnrichmentUpdate(item, item.game).upsert_sources?.some(
			(record) => record.data != null,
		)
	);
}

export default function LibraryEnrichmentDialog({
	onClose,
}: {
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const library = useAllGames();
	const settings = useAllSettings();
	const apply = useApplyLibraryEnrichment();
	const [items, setItems] = useState<LibraryEnrichmentItem[]>([]);
	const [selected, setSelected] = useState(new Set<number>());
	const [progress, setProgress] = useState<{
		stage: "primary" | "expansion";
		completed: number;
		total: number;
	} | null>(null);
	const [cancelling, setCancelling] = useState(false);
	const [hasApplied, setHasApplied] = useState(false);
	const initialized = useRef(false);
	const controller = useRef<AbortController>();
	const busy = progress !== null || apply.isPending;
	useEffect(() => {
		if (initialized.current || !library.data || !settings.data) return;
		initialized.current = true;
		const enabled = (
			getMetadataRequestContext().mixedEnabledSources ?? []
		).filter(
			(source) => source !== "bgm" || settings.data.bgm_auth?.access_token,
		);
		const candidates = createLibraryEnrichmentItems(library.data, enabled);
		setItems(candidates);
		setSelected(
			new Set(
				candidates
					.filter((item) => !item.conflicts.length)
					.map((item) => item.game.id),
			),
		);
	}, [library.data, settings.data]);
	useEffect(() => () => controller.current?.abort(), []);
	const visible = useMemo(
		() =>
			[...items].sort((a, b) => {
				const priority = (item: LibraryEnrichmentItem) =>
					item.conflicts.length
						? 0
						: item.error || item.failedSources.length
							? 1
							: 2;
				return priority(a) - priority(b);
			}),
		[items],
	);
	const applicable = items.filter(
		(item) => selected.has(item.game.id) && canApply(item),
	);
	const requestable = items.filter(
		(item) =>
			selected.has(item.game.id) &&
			!item.conflicts.length &&
			(!item.completed || item.error || item.failedSources.length),
	);
	const progressLabel = apply.isPending
		? t("libraryEnrichment.writing", "正在保存元数据")
		: progress?.stage === "primary"
			? t("libraryEnrichment.primary", "正在获取关联 ID")
			: t("libraryEnrichment.expansion", "正在获取关联元数据");
	const showError = (error: unknown) =>
		snackbar.error(
			getUserErrorMessage(error, t, t("errors.unknownError", "未知错误")),
		);
	const prepare = async () => {
		const runner = new AbortController();
		controller.current = runner;
		setProgress({ stage: "primary", completed: 0, total: requestable.length });
		try {
			const result = await prepareLibraryEnrichment(
				items,
				new Set(requestable.map((item) => item.game.id)),
				runner.signal,
				(stage, completed, total) => setProgress({ stage, completed, total }),
			);
			setItems(result);
			setSelected(
				(old) =>
					new Set(
						result
							.filter((item) => old.has(item.game.id) && !item.conflicts.length)
							.map((item) => item.game.id),
					),
			);
			const count = result.filter(
				(item) =>
					item.conflicts.length || item.error || item.failedSources.length,
			).length;
			if (count)
				snackbar.warning(
					t(
						"libraryEnrichment.warning",
						"{{count}} 项存在冲突或获取失败，已置顶。冲突项会跳过，可重新获取失败的元数据。",
						{ count },
					),
				);
		} catch (error) {
			showError(error);
		} finally {
			setProgress(null);
			setCancelling(false);
			controller.current = undefined;
		}
	};
	const save = async () => {
		try {
			const result = await apply.mutateAsync(applicable);
			const updated = new Map(result.games.map((game) => [game.id, game]));
			const checked = new Map(result.items.map((item) => [item.game.id, item]));
			setSelected(
				(old) =>
					new Set(
						[...old].filter((id) => {
							const item = checked.get(id);
							return (
								!item?.conflicts.length &&
								(!updated.has(id) || item?.failedSources.length || item?.error)
							);
						}),
					),
			);
			setItems((previous) =>
				previous.flatMap((item) => {
					const game = updated.get(item.game.id);
					if (game)
						return item.failedSources.length || item.error
							? [{ ...item, game, completed: false }]
							: [];
					return [checked.get(item.game.id) ?? item];
				}),
			);
			if (result.games.length) {
				setHasApplied(true);
				snackbar.success(
					t("libraryEnrichment.applied", "已补全 {{count}} 个游戏", {
						count: result.games.length,
					}),
				);
			}
			if (result.items.some((item) => item.conflicts.length))
				snackbar.warning(
					t(
						"libraryEnrichment.applyConflict",
						"部分条目的关联已变化，已跳过并标注冲突。",
					),
				);
		} catch (error) {
			showError(error);
		}
	};

	return (
		<Dialog
			open
			fullWidth
			maxWidth="lg"
			onClose={busy ? undefined : onClose}
			aria-labelledby="library-enrichment-title"
		>
			<DialogTitle id="library-enrichment-title">
				{t("libraryEnrichment.title", "补全关联元数据")}
			</DialogTitle>
			<DialogContent>
				<Stack spacing={2}>
					<Typography variant="body2" color="text.secondary">
						{t(
							"libraryEnrichment.description",
							"为已入库的 Kungal / Hikarinagi 游戏补全关联来源的元数据，保留已有内容。冲突项会标注并跳过。",
						)}
					</Typography>
					<Stack
						direction="row"
						spacing={1}
						alignItems="center"
						className="min-h-9"
					>
						<Button
							disabled={busy}
							onClick={() =>
								setSelected(
									new Set(
										items
											.filter((item) => !item.conflicts.length)
											.map((item) => item.game.id),
									),
								)
							}
						>
							{t("common.selectAll", "全选")}
						</Button>
						<Button disabled={busy} onClick={() => setSelected(new Set())}>
							{t("common.clear", "清空")}
						</Button>
						<Typography variant="body2" color="text.secondary">
							{t("libraryEnrichment.selected", "已选择 {{count}} / {{total}}", {
								count: items.filter((item) => selected.has(item.game.id))
									.length,
								total: items.length,
							})}
						</Typography>
					</Stack>
					<Box
						className="relative min-h-20 overflow-hidden rounded border border-solid border-[var(--mui-palette-divider)]"
						style={{
							height: `min(52vh, 480px, calc(${items.length || 2} * 5rem + 2px))`,
						}}
						aria-busy={busy}
					>
						<Box className={`h-full ${busy ? "invisible" : ""}`}>
							{library.isError || settings.isError ? (
								<Stack
									className="h-full items-center justify-center"
									spacing={2}
								>
									<Typography color="error">
										{t("libraryEnrichment.loadError", "读取游戏库失败")}
									</Typography>
									<Button
										onClick={() =>
											void Promise.all([library.refetch(), settings.refetch()])
										}
									>
										{t("common.retry", "重试")}
									</Button>
								</Stack>
							) : !items.length ? (
								<Box className="flex h-full items-center justify-center">
									<Typography color="text.secondary">
										{library.isLoading || settings.isLoading
											? t("common.loading", "加载中...")
											: hasApplied
												? t("libraryEnrichment.allCompleted", "已完成全部补全")
												: t("libraryEnrichment.empty", "没有可补全的游戏")}
									</Typography>
								</Box>
							) : (
								<Virtuoso
									data={visible}
									computeItemKey={(_, item) => item.game.id}
									style={{ height: "100%" }}
									itemContent={(_, item) => {
										const additions =
											buildLibraryEnrichmentUpdate(item, item.game)
												.upsert_sources ?? [];
										const ready = canApply(item);
										const hasFailure =
											!!item.error || item.failedSources.length > 0;
										const failed =
											!ready && (item.error || (item.completed && hasFailure));
										const label = item.conflicts.length
											? t("libraryEnrichment.conflict", "关联冲突")
											: ready
												? t("libraryEnrichment.ready", "待补全")
												: failed
													? t("libraryEnrichment.failed", "获取失败")
													: item.completed
														? t("libraryEnrichment.unchanged", "无需补全")
														: t("libraryEnrichment.pending", "待处理");
										const color = item.conflicts.length
											? "warning"
											: ready
												? hasFailure
													? "warning"
													: "success"
												: failed
													? "error"
													: "default";
										const sourceLabels = (sources: string[]) =>
											sources
												.map((source) =>
													isSourceType(source)
														? getRuntimeSourceAdapter(source).label
														: source,
												)
												.join("、");
										const details =
											item.conflicts.join("；") ||
											item.error ||
											(item.failedSources.length
												? t(
														"libraryEnrichment.failedSources",
														"获取失败：{{sources}}，可重新获取。",
														{
															sources: sourceLabels(item.failedSources),
														},
													)
												: "");
										const existing = item.game.sources
											.filter((record) => record.external_id)
											.map(
												(record) =>
													`${sourceLabels([record.source])} · ${record.external_id}`,
											)
											.join(" / ");
										const acquired = additions
											.filter((record) => record.data != null)
											.map((record) => record.source);
										const missing = item.missingSources.filter(
											(source) =>
												!item.game.sources.some(
													(record) =>
														record.source === source && record.data != null,
												),
										);
										const detailText = item.conflicts.length
											? details
											: [
													ready
														? t(
																"libraryEnrichment.additions",
																"已获取元数据：{{sources}}",
																{ sources: sourceLabels(acquired) },
															)
														: !item.completed && !hasFailure
															? missing.length
																? t(
																		"libraryEnrichment.missing",
																		"缺少元数据：{{sources}}",
																		{ sources: sourceLabels(missing) },
																	)
																: t(
																		"libraryEnrichment.checkAssociations",
																		"需要查询关联来源",
																	)
															: "",
													details,
												]
													.filter(Boolean)
													.join("；");
										return (
											<Box className="grid h-20 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-0 border-b border-solid border-[var(--mui-palette-divider)] px-3 py-2">
												<Checkbox
													checked={selected.has(item.game.id)}
													disabled={busy || !!item.conflicts.length}
													slotProps={{ input: { "aria-label": item.name } }}
													onChange={() =>
														setSelected((old) => {
															const next = new Set(old);
															if (next.has(item.game.id))
																next.delete(item.game.id);
															else next.add(item.game.id);
															return next;
														})
													}
												/>
												<Box className="min-w-0">
													<Typography noWrap variant="body2" title={item.name}>
														{item.name}
													</Typography>
													<Typography
														noWrap
														variant="caption"
														color="text.secondary"
														className="block"
														title={existing}
													>
														{existing}
													</Typography>
													<Typography
														noWrap
														variant="caption"
														color={
															color === "default"
																? "text.secondary"
																: `${color}.main`
														}
														className="block"
														title={detailText}
													>
														{detailText || "\u00a0"}
													</Typography>
												</Box>
												<Tooltip title={details}>
													<Chip size="small" color={color} label={label} />
												</Tooltip>
											</Box>
										);
									}}
								/>
							)}
						</Box>
						{busy && (
							<Box
								className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8"
								role="status"
							>
								<Typography>{progressLabel}</Typography>
								<Box className="w-full max-w-sm">
									<LinearProgress
										aria-label={progressLabel}
										variant={apply.isPending ? "indeterminate" : "determinate"}
										value={
											progress?.total
												? (progress.completed / progress.total) * 100
												: 0
										}
									/>
								</Box>
								{!apply.isPending && (
									<Typography variant="caption" color="text.secondary">
										{progress?.completed ?? 0} / {progress?.total ?? 0}
									</Typography>
								)}
							</Box>
						)}
					</Box>
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button
					disabled={apply.isPending || cancelling}
					onClick={
						progress
							? () => {
									setCancelling(true);
									controller.current?.abort();
								}
							: onClose
					}
				>
					{progress
						? t("libraryEnrichment.cancel", "取消任务")
						: t("common.close", "关闭")}
				</Button>
				<Button
					disabled={busy || !requestable.length}
					onClick={() => void prepare()}
				>
					{t("libraryEnrichment.fetch", "获取元数据")}
				</Button>
				<Button
					variant="contained"
					disabled={busy || !applicable.length}
					onClick={() => void save()}
				>
					{t("libraryEnrichment.apply", "补全所选（{{count}}）", {
						count: applicable.length,
					})}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
