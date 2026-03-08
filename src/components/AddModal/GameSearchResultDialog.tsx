import type { DataSource } from "@/api/gameMetadataService";
import { ViewGameBox } from "@/components/AlertBox";
import type { FullGameData } from "@/types";
import GameSelectDialog from "./GameSelectDialog";

export type GameSearchApiSource = DataSource | "mixed";

interface GameSearchResultDialogProps {
	open: boolean;
	onClose: () => void;
	results: FullGameData[];
	onSelect: (index: number) => void;
	onConfirmPreview: () => void;
	loading?: boolean;
	apiSource: GameSearchApiSource;
	isIdSearch: boolean;
	previewTitle: string;
	selectTitle?: string;
}

export function shouldUseGamePreviewDialog(
	apiSource: GameSearchApiSource,
	isIdSearch: boolean,
): boolean {
	return apiSource === "mixed" || isIdSearch;
}

export function getPrimaryGameSearchResult(
	results: FullGameData[],
): FullGameData | null {
	return results[0] ?? null;
}

export function getSelectableGameApiSource(
	apiSource: GameSearchApiSource,
): DataSource {
	return apiSource === "mixed" ? "bgm" : apiSource;
}

const GameSearchResultDialog: React.FC<GameSearchResultDialogProps> = ({
	open,
	onClose,
	results,
	onSelect,
	onConfirmPreview,
	loading = false,
	apiSource,
	isIdSearch,
	previewTitle,
	selectTitle,
}) => {
	if (!open) {
		return null;
	}

	if (shouldUseGamePreviewDialog(apiSource, isIdSearch)) {
		const previewGameData = getPrimaryGameSearchResult(results);

		return (
			<ViewGameBox
				fullgame={previewGameData}
				open={Boolean(previewGameData)}
				setOpen={(nextOpen) => {
					if (!nextOpen) {
						onClose();
					}
				}}
				onConfirm={onConfirmPreview}
				title={previewTitle}
				isLoading={loading}
			/>
		);
	}

	return (
		<GameSelectDialog
			open={open}
			onClose={onClose}
			results={results}
			onSelect={onSelect}
			loading={loading}
			title={selectTitle}
			apiSource={getSelectableGameApiSource(apiSource)}
		/>
	);
};

export default GameSearchResultDialog;
