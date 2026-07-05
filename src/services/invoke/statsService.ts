/**
 * @file 游戏统计服务
 * @description 封装所有游戏统计相关的后端调用
 */

import type { GameLastPlayed, GameSession, GameStatistics } from "@/types";
import { BaseService } from "./base";

export interface LaunchGameResult {
	success: boolean;
	message: string;
	process_id?: number;
}

export interface StopGameResult {
	success: boolean;
	message: string;
	terminated_count: number;
}

class StatsService extends BaseService {
	/**
	 * 启动游戏并开始监控
	 */
	async launchGame(
		gameId: number,
		args: string[] = [],
		timeTrackingMode: "playtime" | "elapsed",
	): Promise<LaunchGameResult> {
		return this.invoke<LaunchGameResult>("launch_game", {
			gameId,
			args,
			timeTrackingMode,
		});
	}

	/**
	 * 停止游戏监控
	 */
	async stopGame(gameId: number): Promise<StopGameResult> {
		return this.invoke<StopGameResult>("stop_game", {
			gameId,
		});
	}

	/**
	 * 手动创建游戏会话
	 */
	async createManualGameSession(
		gameId: number,
		startTime: number,
		duration: number,
	): Promise<number> {
		return this.invoke<number>("create_manual_game_session", {
			gameId,
			startTime,
			duration,
		});
	}

	/**
	 * 获取游戏会话历史
	 */
	async getGameSessions(
		gameId: number,
		limit: number = 10,
		offset: number = 0,
	): Promise<GameSession[]> {
		return this.invoke<GameSession[]>("get_game_sessions", {
			gameId,
			limit,
			offset,
		});
	}

	/**
	 * 获取指定游戏范围内的全局最近会话
	 */
	async getRecentSessionsForAll(
		gameIds: number[],
		limit: number = 10,
	): Promise<GameSession[]> {
		return this.invoke<GameSession[]>("get_recent_sessions_for_all", {
			gameIds,
			limit,
		});
	}

	// 暂时无用
	/**
	 * 删除游戏会话
	 */
	async deleteGameSession(sessionId: number): Promise<number> {
		return this.invoke<number>("delete_game_session", { sessionId });
	}

	/**
	 * 获取游戏统计信息
	 */
	async getGameStatistics(gameId: number): Promise<GameStatistics | null> {
		return this.invoke<GameStatistics | null>("get_game_statistics", {
			gameId,
		});
	}

	/**
	 * 获取所有游戏统计信息
	 */
	async getAllGameStatistics(): Promise<GameStatistics[]> {
		return this.invoke<GameStatistics[]>("get_all_game_statistics");
	}

	/**
	 * 获取所有游戏的最近游玩时间
	 */
	async getAllGameLastPlayed(): Promise<GameLastPlayed[]> {
		return this.invoke<GameLastPlayed[]>("get_all_game_last_played");
	}

	// 暂时无用开始
	/**
	 * 批量获取游戏统计信息
	 */
	async getMultipleGameStatistics(
		gameIds: number[],
	): Promise<GameStatistics[]> {
		return this.invoke<GameStatistics[]>("get_multiple_game_statistics", {
			gameIds,
		});
	}

	/**
	 * 删除游戏统计信息
	 */
	async deleteGameStatistics(gameId: number): Promise<number> {
		return this.invoke<number>("delete_game_statistics", { gameId });
	}
	// 暂时无用结束

	/**
	 * 获取今天的游戏时间
	 */
	async getTodayPlaytime(gameId: number, today: string): Promise<number> {
		return this.invoke<number>("get_today_playtime", { gameId, today });
	}
}

// 导出单例
export const statsService = new StatsService();
