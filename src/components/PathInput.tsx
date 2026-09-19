import { Box, CircularProgress, TextField, Typography } from "@mui/material";
import type { TextFieldProps } from "@mui/material/TextField";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
	type UserPathInspectionControls,
	useUserPathInspection,
} from "@/hooks/common/useUserPathInspection";
import { getUserErrorMessage } from "@/utils/errors";
import { isWindowsPlatform } from "@/utils/tauriProtocol";

export type PathType = "file" | "directory" | "file-or-directory";

interface PathInputProps
	extends Omit<TextFieldProps, "value" | "onChange" | "error" | "helperText"> {
	value: string;
	onChange: (value: string) => void;
	pathType: PathType;
	endAdornment?: ReactNode;
	helperText?: ReactNode;
	validationError?: ReactNode;
	inspectionState?: UserPathInspectionControls;
}

function usesVariablePrefix(path: string) {
	const trimmed = path.trim();
	if (!isWindowsPlatform) {
		return (
			trimmed.startsWith("$") || trimmed === "~" || trimmed.startsWith("~/")
		);
	}
	return trimmed.startsWith("%");
}

function matchesExpectedType(
	kind: "file" | "directory" | "missing" | "other",
	pathType: PathType,
) {
	return (
		(pathType === "file-or-directory" &&
			(kind === "file" || kind === "directory")) ||
		(pathType === "file" && kind === "file") ||
		(pathType === "directory" && kind === "directory")
	);
}

export function PathInput({
	value,
	onChange,
	pathType,
	endAdornment,
	helperText,
	validationError,
	inspectionState,
	onBlur,
	onKeyDown,
	slotProps,
	...textFieldProps
}: PathInputProps) {
	const { t } = useTranslation();
	const internalInspectionState = useUserPathInspection(
		value,
		inspectionState === undefined,
	);
	const { inspection, error, isLoading, inspectedValue, inspect, markEditing } =
		inspectionState ?? internalInspectionState;
	const isInspectionCurrent = inspectedValue === value.trim();
	const currentInspection = isInspectionCurrent ? inspection : null;
	const currentError = isInspectionCurrent ? error : null;
	const currentIsLoading = isInspectionCurrent
		? isLoading
		: Boolean(value.trim());
	const wrongType = Boolean(
		currentInspection &&
			currentInspection.kind !== "missing" &&
			!matchesExpectedType(currentInspection.kind, pathType),
	);
	const hasError =
		Boolean(currentError) || wrongType || Boolean(validationError);
	const showResolvedPath = usesVariablePrefix(value);
	const variableHint = !isWindowsPlatform
		? t(
				"components.PathInput.linuxHint",
				`路径开头可以使用 $HOME、\${HOME} 或 ~，例如 $HOME/Games`,
			)
		: t(
				"components.PathInput.windowsHint",
				"路径开头可以使用 %USERPROFILE% 等环境变量，例如 %USERPROFILE%\\Games",
			);
	const inspectingHint = t("components.PathInput.inspecting", "正在检查路径…");

	let status: ReactNode = null;
	if (validationError) {
		status = validationError;
	} else if (currentError) {
		status = getUserErrorMessage(currentError, t);
	} else if (currentInspection) {
		const stateText =
			currentInspection.kind === "missing"
				? t("components.PathInput.missing", "当前路径不存在")
				: wrongType
					? t("components.PathInput.wrongType", "路径类型不符合当前字段要求")
					: t("components.PathInput.available", "路径可用");
		status = (
			<Box component="span" className="block min-w-0">
				{showResolvedPath ? (
					<Typography
						component="span"
						variant="caption"
						className="block truncate"
					>
						{t("components.PathInput.resolvedPath", "实际位置：{{path}}", {
							path: currentInspection.resolved_path,
						})}
					</Typography>
				) : null}
				<Typography
					component="span"
					variant="caption"
					color={
						wrongType
							? "error"
							: currentInspection.kind === "missing"
								? "warning.main"
								: "success.main"
					}
				>
					{stateText}
				</Typography>
			</Box>
		);
	}

	return (
		<TextField
			{...textFieldProps}
			value={value}
			onChange={(event) => {
				const nextValue = event.target.value;
				markEditing(nextValue);
				onChange(nextValue);
			}}
			onBlur={(event) => {
				void inspect();
				onBlur?.(event);
			}}
			onKeyDown={(event) => {
				if (event.key === "Enter" && !event.nativeEvent.isComposing) {
					void inspect();
				}
				onKeyDown?.(event);
			}}
			error={hasError}
			helperText={
				status ??
				(currentIsLoading ? (
					<Box component="span" className="inline-flex items-center gap-1">
						<CircularProgress size={14} />
						{inspectingHint}
					</Box>
				) : (
					(helperText ?? variableHint)
				))
			}
			slotProps={{
				...slotProps,
				input: {
					...slotProps?.input,
					endAdornment,
				},
			}}
		/>
	);
}
