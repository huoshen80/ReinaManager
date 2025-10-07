/**
 * @file Service 层统一导出
 * @description 提供所有 service 的统一访问入口
 */

export type { Collection, GameCollectionLink } from "./collectionService";
export { collectionService } from "./collectionService";
// 导出所有服务
export { gameService } from "./gameService";
export { savedataService } from "./savedataService";
export type { UserSettings } from "./settingsService";
export { settingsService } from "./settingsService";
export { statsService } from "./statsService";
// 导出类型
export type { DailyStats, GameType, SortOption, SortOrder } from "./types";
