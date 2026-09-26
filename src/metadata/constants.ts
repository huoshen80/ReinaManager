import { version } from "@pkg";
import { SOURCE_TYPES, type SourceType } from "@/types";

export const USER_AGENT = `huoshen80/ReinaManager/${version} (https://github.com/huoshen80/ReinaManager)`;

export const REGISTERED_SOURCE_KEYS = SOURCE_TYPES;
// 废弃源仍参与历史读取；在线能力与源注册分离，避免停用后丢失旧数据。
export const DEPRECATED_SOURCE_KEYS: readonly SourceType[] = ["kun"];
export const isDeprecatedSource = (source: string): boolean =>
	DEPRECATED_SOURCE_KEYS.some((key) => key === source);
export const SEARCHABLE_SOURCE_KEYS = SOURCE_TYPES.filter(
	(source) => !isDeprecatedSource(source),
);
export const MIXED_SOURCE_KEYS = SEARCHABLE_SOURCE_KEYS;
export const DEFAULT_MIXED_SOURCE_KEYS = [
	"bgm",
	"vndb",
	"hikarinagi",
] as const satisfies readonly SourceType[];

export const MIXED_SOURCE_MIN_COUNT = 2;
export const MIXED_SOURCE_MAX_COUNT = 4;
