import { statsService } from "@/services/invoke";
import { useStore } from "@/store/appStore";
import type { StopGameResult } from "@/types";
import { toError } from "@/utils/errors";

export async function launchGameWithTracking(
	gameId: number,
	args?: string[],
): Promise<{ success: boolean; message: string; process_id?: number }> {
	try {
		return await statsService.launchGame(
			gameId,
			args || [],
			useStore.getState().timeTrackingMode,
		);
	} catch (error) {
		throw toError(error, "Failed to launch game");
	}
}

export async function stopGameWithTracking(
	gameId: number,
): Promise<StopGameResult> {
	try {
		return await statsService.stopGame(gameId);
	} catch (error) {
		throw toError(error, "Failed to stop game");
	}
}
