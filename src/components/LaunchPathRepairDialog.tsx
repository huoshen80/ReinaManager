import type { DialogProps } from "@toolpad/core/useDialogs";
import { useTranslation } from "react-i18next";
import { AlertBox } from "@/components/AlertBox";
import type { LaunchPathIssue } from "@/services/invoke/statsService";

export function LaunchPathRepairDialog({
	open,
	payload,
	onClose,
}: DialogProps<LaunchPathIssue, boolean>) {
	const { t } = useTranslation();
	const titles = {
		directory_missing: t(
			"components.LaunchModal.directoryMissing",
			"找不到游戏目录",
		),
		directory_not_directory: t(
			"components.LaunchModal.directoryNotDirectory",
			"游戏目录路径指向了文件",
		),
		executable_missing: t(
			"components.LaunchModal.executableMissing",
			"找不到游戏启动文件",
		),
		executable_not_file: t(
			"components.LaunchModal.executableNotFile",
			"启动路径指向了文件夹或其他非普通文件",
		),
	};

	return (
		<AlertBox
			open={open}
			setOpen={(value) => {
				if (!value) void onClose(false);
			}}
			title={titles[payload.kind]}
			message={
				<div className="flex min-w-0 flex-col gap-3">
					<div>
						{t(
							"components.LaunchModal.repairPathHint",
							"请选择当前的游戏启动文件，保存后将继续启动游戏。",
						)}
					</div>
					<div className="select-text whitespace-pre-wrap [overflow-wrap:anywhere]">
						{t("components.LaunchModal.currentPath", "当前路径：{{path}}", {
							path: payload.path,
						})}
					</div>
				</div>
			}
			onConfirm={() => void onClose(true)}
			confirmText={t(
				"components.LaunchModal.reselectAndLaunch",
				"重新选择并启动",
			)}
			cancelText={t("common.cancel", "取消")}
			confirmVariant="contained"
			autoCloseOnConfirm={false}
			maxWidth="sm"
		/>
	);
}
