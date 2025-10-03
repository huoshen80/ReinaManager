/**
 * @file Service 层统一导出
 * @description 提供所有 service 的统一访问入口
 */

// 导出所有服务
export { gameService } from './gameService';
export { savedataService } from './savedataService';
export { statsService } from './statsService';
export { settingsService } from './settingsService';
export { collectionService } from './collectionService';

// 导出类型
export type { GameType, SortOption, SortOrder, DailyStats } from './types';
export type { UserSettings } from './settingsService';
export type { Collection, GameCollectionLink } from './collectionService';
