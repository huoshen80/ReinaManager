import type { OAuthAuth } from "@/types";
import { isHttpStatus, toError } from "@/utils/errors";

export interface OAuthCallbackPayload {
	code: string;
	code_verifier?: string;
}

export const OAUTH_REFRESH_THRESHOLD_SECONDS = 5 * 60;

export function nowUnixSeconds() {
	return Math.floor(Date.now() / 1000);
}

export function isOAuthAuthExpired(
	auth: OAuthAuth | null | undefined,
	now = nowUnixSeconds(),
) {
	return auth?.expires_at != null && auth.expires_at <= now;
}

export function isOAuthAuthRefreshDue(
	auth: OAuthAuth | null | undefined,
	now = nowUnixSeconds(),
) {
	return Boolean(
		auth?.refresh_token &&
			auth.expires_at != null &&
			auth.expires_at <= now + OAUTH_REFRESH_THRESHOLD_SECONDS,
	);
}

export function isRefreshCredentialError(error: unknown) {
	const message = toError(error).message.toLowerCase();
	return (
		isHttpStatus(error, 400) ||
		isHttpStatus(error, 401) ||
		message.includes("invalid_grant") ||
		message.includes("unauthorized")
	);
}
