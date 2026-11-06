import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import {
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	IconButton,
	Switch,
	Tab,
	Tabs,
	Typography,
} from "@mui/material";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	getDisplayPreferences,
	SOURCE_PRIORITY_FIELDS,
	type SourcePriorityField,
} from "@/metadata/data/displayPreferences";
import { getRuntimeSourceAdapter } from "@/metadata/sourceRegistry";
import { useStore } from "@/store/appStore";
import type { SourceType } from "@/types";
import { SettingsGroup, SettingsItem } from "./SettingsLayout";

const sourceLabel = (source: SourceType) =>
	getRuntimeSourceAdapter(source).label;

function SortableSource({
	source,
	index,
}: {
	source: SourceType;
	index: number;
}) {
	const { t } = useTranslation();
	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: source });
	return (
		<Box
			component="li"
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			className={`relative flex items-center gap-3 rounded-lg border border-solid border-[var(--mui-palette-divider)] bg-[var(--mui-palette-background-paper)] px-3 py-1.5 ${isDragging ? "z-10 shadow-lg" : ""}`}
		>
			<Typography color="text.secondary" className="w-5 text-center">
				{index + 1}
			</Typography>
			<Typography className="min-w-0 flex-1">{sourceLabel(source)}</Typography>
			<IconButton
				ref={setActivatorNodeRef}
				{...attributes}
				{...listeners}
				className="touch-none cursor-grab active:cursor-grabbing"
				aria-label={t(
					"pages.Settings.displayPreferences.dragSource",
					"拖动 {{source}} 调整顺序",
					{ source: sourceLabel(source) },
				)}
			>
				<DragIndicatorIcon />
			</IconButton>
		</Box>
	);
}

function DisplayPreferenceDialog({ onClose }: { onClose: () => void }) {
	const { t } = useTranslation();
	// 每次打开取最新偏好；拖动、切换和恢复默认只修改弹窗草稿。
	const [draft, setDraft] = useState(() => {
		const { sourcePriorityOverrides, preferOriginalName } = useStore.getState();
		return {
			sourcePriorityOverrides: { ...sourcePriorityOverrides },
			preferOriginalName,
		};
	});
	const [field, setField] = useState<SourcePriorityField>("title");
	const dragging = useRef(false);
	const preferences = getDisplayPreferences(draft);
	const order = preferences.priorities[field];
	const labels: Record<SourcePriorityField, string> = {
		title: t("pages.Settings.displayPreferences.title", "名称来源顺序"),
		summary: t("pages.Settings.displayPreferences.summary", "简介来源顺序"),
		developer: t(
			"pages.Settings.displayPreferences.developer",
			"开发商来源顺序",
		),
	};
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);
	const save = () => {
		useStore
			.getState()
			.setDisplayPreferences(
				draft.sourcePriorityOverrides,
				draft.preferOriginalName,
			);
		onClose();
	};
	const reorder = ({ active, over }: DragEndEvent) => {
		dragging.current = false;
		if (!over || active.id === over.id) return;
		const from = order.indexOf(active.id as SourceType);
		const to = order.indexOf(over.id as SourceType);
		if (from < 0 || to < 0) return;
		setDraft((current) => ({
			...current,
			sourcePriorityOverrides: {
				...current.sourcePriorityOverrides,
				[field]: arrayMove([...order], from, to),
			},
		}));
	};

	return (
		<Dialog
			open
			onClose={() => {
				// Escape 先取消键盘拖动，避免同一次按键也关闭整个弹窗。
				if (!dragging.current) onClose();
			}}
			fullWidth
			maxWidth="sm"
			aria-labelledby="display-preferences-title"
		>
			<DialogTitle id="display-preferences-title">
				{t("pages.Settings.displayPreferences.heading", "游戏资料显示")}
			</DialogTitle>
			<DialogContent dividers>
				<Typography variant="body2" color="text.secondary" className="mb-4">
					{t(
						"pages.Settings.displayPreferences.description",
						"Mixed 游戏按顺序选择已有资料，缺失时使用下一来源。单游戏的自定义内容优先。",
					)}
				</Typography>
				<SettingsItem
					title={t(
						"pages.Settings.displayPreferences.preferOriginalName",
						"原名优先",
					)}
					description={t(
						"pages.Settings.displayPreferences.preferOriginalNameDescription",
						"开启后优先显示原名，缺失时使用中文名；关闭时沿用界面语言规则。自定义名称始终优先。",
					)}
				>
					<Switch
						checked={draft.preferOriginalName}
						slotProps={{
							input: {
								"aria-label": t(
									"pages.Settings.displayPreferences.preferOriginalName",
									"原名优先",
								),
							},
						}}
						onChange={(_, checked) =>
							setDraft((current) => ({
								...current,
								preferOriginalName: checked,
							}))
						}
					/>
				</SettingsItem>
				<Tabs
					value={field}
					onChange={(_, value: SourcePriorityField) => setField(value)}
					variant="scrollable"
					scrollButtons="auto"
					allowScrollButtonsMobile
					className="mt-4 border-0 border-b border-solid border-[var(--mui-palette-divider)]"
					aria-label={t(
						"pages.Settings.displayPreferences.priorityFields",
						"选择资料字段",
					)}
				>
					{SOURCE_PRIORITY_FIELDS.map((item) => (
						<Tab
							key={item}
							value={item}
							label={labels[item]}
							id={`priority-tab-${item}`}
							aria-controls={`priority-panel-${item}`}
						/>
					))}
				</Tabs>
				<Box
					role="tabpanel"
					id={`priority-panel-${field}`}
					aria-labelledby={`priority-tab-${field}`}
					className="pt-4"
				>
					<Typography variant="body2" color="text.secondary" className="mb-3">
						{t(
							"pages.Settings.displayPreferences.orderHint",
							"拖动右侧手柄调整顺序，越靠上越优先。保存后对已有和新增的 Mixed 游戏生效。",
						)}
					</Typography>
					{field === "title" && (
						<Typography variant="body2" color="text.secondary" className="mb-3">
							{t(
								"pages.Settings.displayPreferences.titleHint",
								"原名与中文名分别按此顺序选取，缺失时使用下一来源。",
							)}
						</Typography>
					)}
					<DndContext
						key={field}
						sensors={sensors}
						collisionDetection={closestCenter}
						onDragEnd={reorder}
						onDragStart={() => {
							dragging.current = true;
						}}
						onDragCancel={() => {
							dragging.current = false;
						}}
						accessibility={{
							screenReaderInstructions: {
								draggable: t(
									"pages.Settings.displayPreferences.keyboardHint",
									"按空格键开始排序，使用上下方向键移动，再按空格键放下，按 Escape 取消。",
								),
							},
							announcements: {
								onDragStart: ({ active }) =>
									t(
										"pages.Settings.displayPreferences.dragStart",
										"已拾起 {{source}}。",
										{ source: sourceLabel(active.id as SourceType) },
									),
								onDragOver: ({ active, over }) =>
									over
										? t(
												"pages.Settings.displayPreferences.dragOver",
												"{{source}} 移动到第 {{position}} 位。",
												{
													source: sourceLabel(active.id as SourceType),
													position: order.indexOf(over.id as SourceType) + 1,
												},
											)
										: undefined,
								onDragEnd: ({ active }) =>
									t(
										"pages.Settings.displayPreferences.dragEnd",
										"已放下 {{source}}。",
										{ source: sourceLabel(active.id as SourceType) },
									),
								onDragCancel: () =>
									t(
										"pages.Settings.displayPreferences.dragCancel",
										"已取消排序。",
									),
							},
						}}
					>
						<SortableContext
							items={[...order]}
							strategy={verticalListSortingStrategy}
						>
							<Box component="ol" className="m-0 list-none space-y-2 p-0">
								{order.map((source, index) => (
									<SortableSource key={source} source={source} index={index} />
								))}
							</Box>
						</SortableContext>
					</DndContext>
					<Button
						className="mt-3"
						onClick={() =>
							setDraft((current) => {
								const overrides = { ...current.sourcePriorityOverrides };
								delete overrides[field];
								return { ...current, sourcePriorityOverrides: overrides };
							})
						}
					>
						{t(
							"pages.Settings.displayPreferences.resetCurrent",
							"恢复此项默认顺序",
						)}
					</Button>
				</Box>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose}>
					{t("pages.Settings.displayPreferences.cancel", "取消")}
				</Button>
				<Button variant="contained" onClick={save}>
					{t("pages.Settings.displayPreferences.save", "保存")}
				</Button>
			</DialogActions>
		</Dialog>
	);
}

export function DisplayPreferenceSettings() {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	return (
		<SettingsGroup
			title={t("pages.Settings.displayPreferences.heading", "游戏资料显示")}
			description={t(
				"pages.Settings.displayPreferences.entryDescription",
				"调整 Mixed 游戏的资料来源优先级和名称显示偏好。",
			)}
		>
			<Button variant="outlined" onClick={() => setOpen(true)}>
				{t(
					"pages.Settings.displayPreferences.openModal",
					"打开游戏资料显示设置",
				)}
			</Button>
			{open && <DisplayPreferenceDialog onClose={() => setOpen(false)} />}
		</SettingsGroup>
	);
}
