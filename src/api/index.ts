/**
 * @file API 层统一导出
 * @description 提供所有 API 模块和服务层的统一访问入口
 * @module src/api/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 */

// 导出基础API模块
export { fetchBgmById, fetchBgmByName } from "./bgm";
// 导出服务层
export type {
	DataSource,
	GameSearchParams,
} from "./gameMetadataService";
export { gameMetadataService } from "./gameMetadataService";
export {
	fetchGalgameById,
	searchGalgame,
} from "./kun";
export { fetchMixedData } from "./mixed";
export {
	fetchVndbById,
	fetchVndbByName,
	fetchVndbCurrentUserProfile,
	fetchVndbUserCollection,
	fetchVndbUserLabels,
	updateVndbUserCollection,
} from "./vndb";
export { fetchYmById, fetchYmByName } from "./ymgal";
