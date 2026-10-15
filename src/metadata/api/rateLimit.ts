import {
	ApiRateLimitError,
	type ApiRateLimitInfo,
	type ApiRateLimitSource,
} from "@/utils/errors";

export type { ApiRateLimitSource } from "@/utils/errors";

export interface ApiRateLimitPolicy {
	source: ApiRateLimitSource;
	minIntervalMs: number;
	defaultBackoffMs?: number;
	maxBackoffMs?: number;
	maxRetries?: number;
	classifyResponse?: (
		status: number,
		body: unknown,
	) => ApiRateLimitInfo["reason"] | undefined;
	getResetAfterMs?: (
		headers: Headers,
		reason: ApiRateLimitInfo["reason"],
	) => number | undefined;
}

export interface ApiRateLimitedRequestOptions extends ApiRateLimitPolicy {
	scope?: string;
	maxAutoWaitMs?: number;
}

interface ApiRateLimitState {
	backoffUntil: number;
	suspended: boolean;
	generation: number;
	queuedCount: number;
	consecutive429Count: number;
	last429At?: number;
	lastRateLimit?: ApiRateLimitInfo;
}

interface ApiRateLimitQueue {
	nextStartAt: number;
	tail: Promise<void>;
	scopes: Map<string, ApiRateLimitState>;
}

export interface ApiRateLimitRequest {
	options: ApiRateLimitedRequestOptions;
	generation: number;
	remainingAutoWaitMs: number;
}

export interface ApiRateLimitHandling extends ApiRateLimitInfo {
	retryAfterMs?: number;
	backoffUntil?: number;
	shouldRetry: boolean;
	fatal: boolean;
}

export interface ApiRateLimitSnapshot {
	source: ApiRateLimitSource;
	scope: string;
	availability: "ready" | "cooldown" | "suspended";
	queuedCount: number;
	nextStartAt: number;
	backoffUntil: number;
	last429At?: number;
	consecutive429Count: number;
	lastRateLimit?: ApiRateLimitInfo;
}

const queues = new Map<ApiRateLimitSource, ApiRateLimitQueue>();
const listeners = new Set<() => void>();
const waiters = new Set<() => void>();
const DEFAULT_MAX_AUTO_WAIT_MS = 5 * 60 * 1000;

function getQueue(source: ApiRateLimitSource): ApiRateLimitQueue {
	let queue = queues.get(source);
	if (!queue) {
		queue = { nextStartAt: 0, tail: Promise.resolve(), scopes: new Map() };
		queues.set(source, queue);
	}
	return queue;
}

function getState(options: ApiRateLimitedRequestOptions): ApiRateLimitState {
	const scopes = getQueue(options.source).scopes;
	const scope = options.scope ?? "source";
	let state = scopes.get(scope);
	if (!state) {
		state = {
			backoffUntil: 0,
			suspended: false,
			generation: 0,
			queuedCount: 0,
			consecutive429Count: 0,
		};
		scopes.set(scope, state);
	}
	return state;
}

function notifyRateLimitListeners() {
	for (const listener of listeners) listener();
	for (const wake of waiters) wake();
}

export function readApiResponseCode(
	body: unknown,
): string | number | undefined {
	if (typeof body !== "object" || body === null || !("code" in body))
		return undefined;
	return typeof body.code === "string" || typeof body.code === "number"
		? body.code
		: undefined;
}

export function parseRateLimitSeconds(
	value: string | null,
): number | undefined {
	if (!value?.trim() || !/^\d+(?:\.\d+)?$/.test(value.trim())) return undefined;
	const ms = Number(value) * 1000;
	return Number.isFinite(ms) ? ms : undefined;
}

function getRetryAfterMs(headers: Headers): number | undefined {
	const value = headers.get("Retry-After")?.trim();
	if (!value) return undefined;
	const secondsMs = parseRateLimitSeconds(value);
	if (secondsMs !== undefined) return secondsMs;
	// 非法数字不能被 Date.parse 误识别为日期；服务端时钟可避免本地时间偏差。
	if (!/^[A-Za-z]{3}, /.test(value)) return undefined;
	const at = Date.parse(value);
	if (!Number.isFinite(at)) return undefined;
	const serverNow = Date.parse(headers.get("Date") ?? "");
	return Math.max(
		0,
		at - (Number.isFinite(serverNow) ? serverNow : Date.now()),
	);
}

function throwIfAborted(signal?: AbortSignal) {
	if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

async function waitFor(ms: number, signal?: AbortSignal) {
	throwIfAborted(signal);
	if (ms <= 0) return;
	await new Promise<void>((resolve, reject) => {
		const cleanup = () => {
			globalThis.clearTimeout(timer);
			waiters.delete(onWake);
			signal?.removeEventListener("abort", onAbort);
		};
		const onWake = () => {
			cleanup();
			resolve();
		};
		const onAbort = () => {
			cleanup();
			reject(new DOMException("Aborted", "AbortError"));
		};
		// 长冷却使用分段等待，避免浏览器定时器整数溢出。
		const timer = globalThis.setTimeout(onWake, Math.min(ms, 2147483647));
		waiters.add(onWake);
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

function waitForScheduledResult<T>(
	promise: Promise<T>,
	signal?: AbortSignal,
): Promise<T> {
	if (!signal) return promise;
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => {
			signal.removeEventListener("abort", onAbort);
			reject(new DOMException("Aborted", "AbortError"));
		};
		signal.addEventListener("abort", onAbort, { once: true });
		promise.then(
			(value) => {
				signal.removeEventListener("abort", onAbort);
				resolve(value);
			},
			(error: unknown) => {
				signal.removeEventListener("abort", onAbort);
				reject(error);
			},
		);
		if (signal.aborted) onAbort();
	});
}

export function createApiRateLimitRequest(
	options: ApiRateLimitedRequestOptions,
): ApiRateLimitRequest {
	const state = getState(options);
	// 恢复时间未知时，旧队列全部结束后，重新发起的操作才允许探测一次。
	// 已有截止时间的冷却不能通过重新发起操作绕过。
	if (state.suspended && state.backoffUntil === 0 && state.queuedCount === 0) {
		state.suspended = false;
	}
	return {
		options,
		generation: state.generation,
		remainingAutoWaitMs: options.maxAutoWaitMs ?? DEFAULT_MAX_AUTO_WAIT_MS,
	};
}

function createBlockedError(request: ApiRateLimitRequest): ApiRateLimitError {
	const state = getState(request.options);
	const info = state.lastRateLimit;
	return new ApiRateLimitError({
		source: request.options.source,
		reason: info?.reason ?? "rate_limited",
		status: info?.status === "retry_exhausted" ? "retry_exhausted" : "stopped",
		retryAt: info?.retryAt,
		retryAtSource: info?.retryAtSource,
		backoffUntil: state.backoffUntil || undefined,
		retryAfterMs: state.backoffUntil
			? Math.max(0, state.backoffUntil - Date.now())
			: undefined,
		fatal: true,
	});
}

function getWaitMs(request: ApiRateLimitRequest): number {
	const state = getState(request.options);
	if (request.generation !== state.generation)
		throw createBlockedError(request);
	const now = Date.now();
	if (state.suspended) {
		if (!state.backoffUntil || state.backoffUntil > now)
			throw createBlockedError(request);
		state.suspended = false;
	}
	const until = Math.max(
		state.backoffUntil,
		getQueue(request.options.source).nextStartAt,
	);
	const waitMs = Math.max(0, until - now);
	if (state.backoffUntil - now > request.remainingAutoWaitMs)
		throw createBlockedError(request);
	return waitMs;
}

async function waitForAvailability(
	request: ApiRateLimitRequest,
	ms: number,
	signal?: AbortSignal,
) {
	const startedAt = Date.now();
	const cooldownUntil = getState(request.options).backoffUntil;
	try {
		await waitFor(ms, signal);
	} finally {
		// 等待预算仅统计限流冷却，正常排队和请求耗时不应触发限流错误。
		request.remainingAutoWaitMs -= Math.max(
			0,
			Math.min(Date.now(), cooldownUntil) - startedAt,
		);
	}
}

export async function scheduleApiRequest<T>(
	request: ApiRateLimitRequest,
	task: () => Promise<T>,
	signal?: AbortSignal,
): Promise<T> {
	const queue = getQueue(request.options.source);
	const state = getState(request.options);
	state.queuedCount += 1;
	notifyRateLimitListeners();
	try {
		while (true) {
			throwIfAborted(signal);
			const waitMs = getWaitMs(request);
			if (waitMs > 0) {
				// 不占据来源队列等待某个账号的额度，让其他额度主体可以继续使用。
				await waitForAvailability(request, waitMs, signal);
				continue;
			}
			const run = async (): Promise<
				{ ready: true; value: T } | { ready: false; waitMs: number }
			> => {
				throwIfAborted(signal);
				// 等待期间可能出现新限流，真正发出请求前必须再次检查。
				const pendingWaitMs = getWaitMs(request);
				if (pendingWaitMs > 0) return { ready: false, waitMs: pendingWaitMs };
				queue.nextStartAt = Date.now() + request.options.minIntervalMs;
				notifyRateLimitListeners();
				// task 必须包含响应识别及限流状态提交，完成后才能释放下一请求。
				return { ready: true, value: await task() };
			};
			const result = queue.tail.then(run, run);
			queue.tail = result.then(
				() => undefined,
				() => undefined,
			);
			const outcome = await waitForScheduledResult(result, signal);
			if (outcome.ready) return outcome.value;
			await waitForAvailability(request, outcome.waitMs, signal);
		}
	} finally {
		state.queuedCount -= 1;
		notifyRateLimitListeners();
	}
}

export function handleApiRateLimited(
	request: ApiRateLimitRequest,
	headers: Headers,
	attempt: number,
	reason: ApiRateLimitInfo["reason"],
): ApiRateLimitHandling {
	const { options } = request;
	const state = getState(options);
	const now = Date.now();
	state.last429At = now;
	state.consecutive429Count += 1;
	if (state.backoffUntil <= now) state.backoffUntil = 0;
	let serverWaitMs = getRetryAfterMs(headers);
	let retryAtSource: ApiRateLimitInfo["retryAtSource"] =
		serverWaitMs !== undefined ? "retry_after" : undefined;
	if (serverWaitMs === undefined) {
		serverWaitMs = options.getResetAfterMs?.(headers, reason);
		if (
			serverWaitMs !== undefined &&
			Number.isFinite(serverWaitMs) &&
			serverWaitMs >= 0
		)
			retryAtSource = "rate_limit_reset";
		else serverWaitMs = undefined;
	}
	const fallbackMs =
		reason === "quota_exhausted"
			? 0
			: Math.min(
					(options.defaultBackoffMs ?? 60000) *
						2 ** (state.consecutive429Count - 1),
					options.maxBackoffMs ?? 300000,
				);
	// 本地上限仅约束估算值，服务端要求的等待时间不能被截短。
	const waitMs =
		serverWaitMs !== undefined
			? serverWaitMs + 1000 + Math.floor(Math.random() * 250)
			: fallbackMs;
	if (serverWaitMs === undefined && waitMs > 0) retryAtSource = "estimate";
	if (waitMs > 0)
		state.backoffUntil = Math.max(state.backoffUntil, now + waitMs);
	const exhausted = attempt >= (options.maxRetries ?? 0);
	const shouldRetry =
		reason !== "quota_exhausted" &&
		!exhausted &&
		state.backoffUntil - now <= request.remainingAutoWaitMs;
	let status: ApiRateLimitInfo["status"] = "stopped";
	if (shouldRetry) status = "retrying";
	else if (
		reason !== "quota_exhausted" &&
		exhausted &&
		(options.maxRetries ?? 0) > 0
	)
		status = "retry_exhausted";
	const info: ApiRateLimitInfo = {
		reason,
		status,
		retryAt: state.backoffUntil || undefined,
		retryAtSource,
	};
	state.lastRateLimit = info;
	if (!shouldRetry) {
		state.suspended = true;
		// 已排队请求不会在冷却结束或手动重试后复活；新操作使用新的代次。
		state.generation += 1;
	}
	notifyRateLimitListeners();
	return {
		...info,
		retryAfterMs: waitMs || undefined,
		backoffUntil: state.backoffUntil || undefined,
		shouldRetry,
		fatal: !shouldRetry,
	};
}

export function markApiRequestSucceeded(request: ApiRateLimitRequest) {
	const state = getState(request.options);
	if (request.generation !== state.generation) return;
	state.consecutive429Count = 0;
	state.lastRateLimit = undefined;
	notifyRateLimitListeners();
}

export function getApiRateLimitSnapshot(): ApiRateLimitSnapshot[] {
	return [...queues].flatMap(([source, queue]) =>
		[...queue.scopes].map(([scope, state]) => ({
			source,
			scope,
			availability:
				state.suspended &&
				(!state.backoffUntil || state.backoffUntil > Date.now())
					? ("suspended" as const)
					: state.backoffUntil > Date.now()
						? ("cooldown" as const)
						: ("ready" as const),
			queuedCount: state.queuedCount,
			nextStartAt: queue.nextStartAt,
			backoffUntil: state.backoffUntil,
			last429At: state.last429At,
			consecutive429Count: state.consecutive429Count,
			lastRateLimit: state.lastRateLimit
				? { ...state.lastRateLimit }
				: undefined,
		})),
	);
}

export function subscribeApiRateLimit(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
