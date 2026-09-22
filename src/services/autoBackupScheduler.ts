import { createAutoBackup } from "@/services/fs/dataMaintenance";
import { useStore } from "@/store/appStore";
import { toError } from "@/utils/errors";

const HOUR_MS = 60 * 60 * 1000;
const OVERDUE_GRACE_MS = 60 * 1000;
const MAX_TIMER_DELAY_MS = 2_147_000_000;

let timerId: ReturnType<typeof setTimeout> | null = null;
let unsubscribeStore: (() => void) | null = null;
let scheduledBackupPromise: Promise<void> | null = null;
let schedulerSuspended = false;

function clearScheduledTimer(): void {
	if (timerId !== null) {
		clearTimeout(timerId);
		timerId = null;
	}
}

function getNextScheduledBackupAt(now: number): number | null {
	const state = useStore.getState();
	if (!state.scheduledBackupEnabled) {
		return null;
	}

	const intervalMs = Math.max(1, state.scheduledBackupIntervalHours) * HOUR_MS;
	const anchors = [
		state.autoBackupLastSuccessAt,
		state.autoBackupLastScheduledAttemptAt,
	].filter((value): value is number => value !== null && value <= now);
	const latestAnchor = anchors.length > 0 ? Math.max(...anchors) : null;

	if (latestAnchor === null) {
		return now + OVERDUE_GRACE_MS;
	}

	const dueAt = latestAnchor + intervalMs;
	return dueAt <= now ? now + OVERDUE_GRACE_MS : dueAt;
}

function scheduleNextBackup(): void {
	clearScheduledTimer();
	if (schedulerSuspended || scheduledBackupPromise) {
		return;
	}

	const now = Date.now();
	const nextBackupAt = getNextScheduledBackupAt(now);
	if (nextBackupAt === null) {
		return;
	}

	const remainingDelay = Math.max(0, nextBackupAt - now);
	const delay = Math.min(remainingDelay, MAX_TIMER_DELAY_MS);
	const requiresRecheck = remainingDelay > MAX_TIMER_DELAY_MS;
	timerId = setTimeout(() => {
		timerId = null;
		if (requiresRecheck) {
			scheduleNextBackup();
		} else {
			void runScheduledBackup();
		}
	}, delay);
}

async function runScheduledBackup(): Promise<void> {
	if (schedulerSuspended || scheduledBackupPromise) {
		return scheduledBackupPromise ?? Promise.resolve();
	}

	const state = useStore.getState();
	if (!state.scheduledBackupEnabled) {
		return;
	}

	const attemptAt = Date.now();
	state.setAutoBackupLastScheduledAttemptAt(attemptAt);

	scheduledBackupPromise = (async () => {
		try {
			const result = await createAutoBackup(
				"scheduled",
				state.autoBackupIncludeCovers,
				state.autoBackupRetentionCount,
			);
			const warning =
				result.warnings.length > 0 ? result.warnings.join("；") : null;
			useStore.getState().setAutoBackupLastResult(Date.now(), warning);
		} catch (error) {
			const message = toError(error, "定时自动备份失败").message;
			console.error("定时自动备份失败:", error);
			useStore.getState().setAutoBackupLastResult(null, message);
		} finally {
			scheduledBackupPromise = null;
			scheduleNextBackup();
		}
	})();

	return scheduledBackupPromise;
}

export function startAutoBackupScheduler(): void {
	if (unsubscribeStore) {
		return;
	}

	schedulerSuspended = false;
	unsubscribeStore = useStore.subscribe((state, previousState) => {
		if (
			state.scheduledBackupEnabled !== previousState.scheduledBackupEnabled ||
			state.scheduledBackupIntervalHours !==
				previousState.scheduledBackupIntervalHours ||
			state.autoBackupLastSuccessAt !== previousState.autoBackupLastSuccessAt ||
			state.autoBackupLastScheduledAttemptAt !==
				previousState.autoBackupLastScheduledAttemptAt
		) {
			scheduleNextBackup();
		}
	});
	scheduleNextBackup();
}

export function suspendAutoBackupScheduler(): void {
	schedulerSuspended = true;
	clearScheduledTimer();
}

export async function waitForScheduledAutoBackup(): Promise<void> {
	await scheduledBackupPromise;
}
