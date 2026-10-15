import type { MetadataAuthTokens } from "@/metadata/sourceAdapter";
import { withBgmAuth } from "@/services/oauth/bgmAuthSession";
import { withHikarinagiAuth } from "@/services/oauth/hikarinagiAuthSession";
import { withNextmoeAuth } from "@/services/oauth/nextmoeAuthSession";
import type { SourceType } from "@/types";
import { AppError } from "@/utils/errors";

/** 认证只作用于当前来源的请求，不读取搜索或增强偏好。 */
export function withSourceMetadataAuth<T>(
	source: SourceType,
	task: (tokens: MetadataAuthTokens) => Promise<T>,
): Promise<T> {
	switch (source) {
		case "bgm":
			return withBgmAuth((bgmToken) => task({ bgmToken }));
		case "hikarinagi":
			return withHikarinagiAuth((hikarinagiToken) => {
				if (!hikarinagiToken) {
					throw new AppError({
						code: "hikarinagi_auth_missing",
						message: "未配置 Hikarinagi 登录",
					});
				}
				return task({ hikarinagiToken });
			});
		case "kun":
			return withNextmoeAuth((nextmoeToken, auth) =>
				task({ nextmoeToken, nextmoeUserId: auth?.user_id ?? undefined }),
			);
		default:
			return task({});
	}
}
