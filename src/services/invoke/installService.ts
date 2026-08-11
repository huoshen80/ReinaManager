import type { InsertGameParams } from "@/types";
import { BaseService } from "./base";

export type TaskStatus =
	| "pending"
	| "running"
	| "paused"
	| "completed"
	| "failed"
	| "cancelled";

export type GameInstallStage =
	| "downloading"
	| "verifying"
	| "extracting"
	| "organizing"
	| "scanning"
	| "matching_metadata"
	| "importing_game";

export interface InstallRequest {
	v: number;
	provider: string;
	resource_id: string;
	url: string;
	file_name: string;
	archive_format: string;
	size: number;
	checksum_algo: "sha256" | "blake3";
	checksum: string;
	expires_at?: number | null;
	bgm_id?: string | null;
	vndb_id?: string | null;
	hikarinagi_id?: string | null;
	title: string;
}

export interface GameInstallResultV1 {
	version: 1;
	game_id?: number | null;
	install_path: string;
	executable?: string | null;
	created_new_game?: boolean | null;
	matched_by?: "bgm" | "vndb" | "hikarinagi" | null;
}

export interface GameInstallPayloadV1 extends InstallRequest {
	install_root: string;
}

export interface Task {
	id: number;
	task_type: string;
	title: string;
	status: TaskStatus;
	stage?: string | null;
	payload_json: unknown;
	result_json?: unknown | null;
	progress_current: number;
	progress_total?: number | null;
	progress_unit?: string | null;
	bytes_per_second?: number | null;
	dedupe_key?: string | null;
	error_code?: string | null;
	error_message?: string | null;
	created_at: number;
	started_at?: number | null;
	updated_at: number;
	finished_at?: number | null;
}

export interface GameInstallTask extends Task {
	task_type: "game_install";
	stage?: GameInstallStage | null;
	payload_json: GameInstallPayloadV1;
	result_json?: GameInstallResultV1 | null;
}

export function isGameInstallTask(task: Task): task is GameInstallTask {
	return task.task_type === "game_install";
}

export interface InstallRequestRejection {
	code: string;
	message: string;
}

export interface TaskProgressEvent {
	task_id: number;
	status: TaskStatus;
	stage?: string | null;
	progress_current: number;
	progress_total?: number | null;
	progress_unit?: string | null;
	bytes_per_second?: number | null;
}

export interface GameInstallMetadataRequestedEvent {
	task_id: number;
}

export interface InstallCompletedEvent {
	task_id: number;
	game_id: number;
	result_path: string;
	executable?: string | null;
	executable_missing: boolean;
}

export interface InstallFailedEvent {
	task_id: number;
	game_id?: number | null;
	error_code: string;
	error_message: string;
}

class TaskService extends BaseService {
	takePendingRequests(): Promise<InstallRequest[]> {
		return this.invoke<InstallRequest[]>("take_pending_install_requests");
	}

	takePendingRejections(): Promise<InstallRequestRejection[]> {
		return this.invoke<InstallRequestRejection[]>(
			"take_pending_install_rejections",
		);
	}

	createGameInstallTask(
		request: InstallRequest,
		installRoot: string,
	): Promise<GameInstallTask> {
		return this.invoke<GameInstallTask>("create_game_install_task", {
			request,
			installRoot,
		});
	}

	listTasks(): Promise<Task[]> {
		return this.invoke<Task[]>("list_tasks");
	}

	retryTask(taskId: number, payload?: InstallRequest): Promise<Task> {
		return this.invoke<Task>("retry_task", {
			taskId,
			payload: payload ?? null,
		});
	}

	pauseTask(taskId: number): Promise<Task> {
		return this.invoke<Task>("pause_task", { taskId });
	}

	resumeTask(taskId: number): Promise<Task> {
		return this.invoke<Task>("resume_task", { taskId });
	}

	cancelTask(taskId: number): Promise<Task> {
		return this.invoke<Task>("cancel_task", { taskId });
	}

	deleteTask(taskId: number): Promise<void> {
		return this.invoke<void>("delete_task", { taskId });
	}

	completeGameInstall(
		taskId: number,
		metadata: InsertGameParams,
	): Promise<Task> {
		return this.invoke<Task>("complete_game_install_task", {
			taskId,
			metadata,
		});
	}

	failGameInstallMetadata(taskId: number, errorMessage: string): Promise<Task> {
		return this.invoke<Task>("fail_game_install_metadata", {
			taskId,
			errorMessage,
		});
	}
}

export const taskService = new TaskService();
