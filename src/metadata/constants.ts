import { version } from "@pkg";
import { SOURCE_TYPES, type SourceType } from "@/types";

export const USER_AGENT = `huoshen80/ReinaManager/${version} (https://github.com/huoshen80/ReinaManager)`;

export const REGISTERED_SOURCE_KEYS = SOURCE_TYPES;
export const SEARCHABLE_SOURCE_KEYS = SOURCE_TYPES;
export const MIXED_SOURCE_KEYS = SOURCE_TYPES;
export const DEFAULT_MIXED_SOURCE_KEYS = [
	"bgm",
	"vndb",
	"hikarinagi",
] as const satisfies readonly SourceType[];

export const MIXED_SOURCE_MIN_COUNT = 2;
export const MIXED_SOURCE_MAX_COUNT = 4;
