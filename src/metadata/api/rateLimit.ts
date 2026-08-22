export type ApiRateLimitSource =
	| "bgm"
	| "vndb"
	| "ymgal"
	| "kun"
	| "dlsite"
	| "erogamescape"
	| "hikarinagi";

interface ApiRateLimitPolicy {
	source: ApiRateLimitSource;
	minIntervalMs: number;
	defaultBackoffMs: number;
	maxBackoffMs: number;
	max429Retries: number;
	stopOn429: boolean;
}

interface ApiRateLimitState {
	nextStartAt: number;
	backoffUntil: number;
	queuedCount: number;
	last429At?: number;
	consecutive429Count: number;
	lastErrorMessage?: string;
	tail: Promise<void>;
}

export interface ApiRateLimitedRequestOptions {
	source: ApiRateLimitSource;
}

export interface ApiRateLimitHandling {
	retryAfterMs?: number;
	backoffUntil?: number;
	shouldRetry: boolean;
	fatal: boolean;
}

export interface ApiRateLimitSnapshot {
	source: ApiRateLimitSource;
	queuedCount: number;
	nextStartAt: number;
	backoffUntil: number;
	last429At?: number;
	consecutive429Count: number;
	lastErrorMessage?: string;
}

type ApiRateLimitListener = () => void;

const API_RATE_LIMIT_POLICIES: Record<ApiRateLimitSource, ApiRateLimitPolicy> =
	{
		vndb: {
			source: "vndb",
			minIntervalMs: 1600,
			defaultBackoffMs: 30 * 1000,
			maxBackoffMs: 5 * 60 * 1000,
			max429Retries: 2,
			stopOn429: false,
		},
		bgm: {
			source: "bgm",
			minIntervalMs: 250,
			defaultBackoffMs: 0,
			maxBackoffMs: 0,
			max429Retries: 0,
			stopOn429: true,
		},
		ymgal: {
			source: "ymgal",
			minIntervalMs: 500,
			defaultBackoffMs: 0,
			maxBackoffMs: 0,
			max429Retries: 0,
			stopOn429: true,
		},
		kun: {
			source: "kun",
			minIntervalMs: 500,
			defaultBackoffMs: 0,
			maxBackoffMs: 0,
			max429Retries: 0,
			stopOn429: true,
		},
		dlsite: {
			source: "dlsite",
			minIntervalMs: 2000,
			defaultBackoffMs: 0,
			maxBackoffMs: 0,
			max429Retries: 0,
			stopOn429: true,
		},
		erogamescape: {
			source: "erogamescape",
			minIntervalMs: 3000,
			defaultBackoffMs: 0,
			maxBackoffMs: 0,
			max429Retries: 0,
			stopOn429: true,
		},
		hikarinagi: {
			source: "hikarinagi",
			minIntervalMs: 250,
			defaultBackoffMs: 60 * 1000,
			maxBackoffMs: 2 * 60 * 1000,
			max429Retries: 2,
			stopOn429: false,
		},
	};

const rateLimitStates: Record<ApiRateLimitSource, ApiRateLimitState> = {
	vndb: createInitialState(),
	bgm: createInitialState(),
	ymgal: createInitialState(),
	kun: createInitialState(),
	dlsite: createInitialState(),
	erogamescape: createInitialState(),
	hikarinagi: createInitialState(),
};

const listeners = new Set<ApiRateLimitListener>();

function createInitialState(): ApiRateLimitState {
	return {
		nextStartAt: 0,
		backoffUntil: 0,
		queuedCount: 0,
		consecutive429Count: 0,
		tail: Promise.resolve(),
	};
}

function createAbortError() {
	return new DOMException("Aborted", "AbortError");
}

function notifyRateLimitListeners() {
	for (const listener of listeners) {
		listener();
	}
}

function getRetryAfterMs(headers: Headers): number | undefined {
	const retryAfter = headers.get("Retry-After");
	if (!retryAfter) return undefined;

	const seconds = Number(retryAfter);
	if (Number.isFinite(seconds) && seconds >= 0) {
		return seconds * 1000;
	}

	const retryAt = Date.parse(retryAfter);
	if (Number.isNaN(retryAt)) return undefined;

	return Math.max(0, retryAt - Date.now());
}

async function waitFor(ms: number, signal?: AbortSignal) {
	if (ms <= 0) return;
	if (signal?.aborted) throw createAbortError();

	await new Promise<void>((resolve, reject) => {
		const timer = globalThis.setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);

		const onAbort = () => {
			globalThis.clearTimeout(timer);
			reject(createAbortError());
		};

		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

async function waitUntil(timestamp: number, signal?: AbortSignal) {
	await waitFor(Math.max(0, timestamp - Date.now()), signal);
}

async function runWhenAvailable<T>(
	source: ApiRateLimitSource,
	task: () => Promise<T>,
	signal?: AbortSignal,
): Promise<T> {
	if (signal?.aborted) throw createAbortError();

	const state = rateLimitStates[source];
	const policy = API_RATE_LIMIT_POLICIES[source];
	await waitUntil(state.backoffUntil, signal);
	await waitUntil(state.nextStartAt, signal);

	if (signal?.aborted) throw createAbortError();
	state.nextStartAt = Date.now() + policy.minIntervalMs;
	notifyRateLimitListeners();

	return task();
}

export async function scheduleApiRequest<T>(
	source: ApiRateLimitSource,
	task: () => Promise<T>,
	signal?: AbortSignal,
): Promise<T> {
	const state = rateLimitStates[source];
	state.queuedCount += 1;
	notifyRateLimitListeners();

	const result = state.tail.then(
		() => runWhenAvailable(source, task, signal),
		() => runWhenAvailable(source, task, signal),
	);

	state.tail = result.then(
		() => undefined,
		() => undefined,
	);

	try {
		return await result;
	} finally {
		state.queuedCount = Math.max(0, state.queuedCount - 1);
		notifyRateLimitListeners();
	}
}

export function handleApiRateLimited(
	source: ApiRateLimitSource,
	headers: Headers,
	attempt: number,
): ApiRateLimitHandling {
	const state = rateLimitStates[source];
	const policy = API_RATE_LIMIT_POLICIES[source];
	const now = Date.now();

	state.last429At = now;
	state.consecutive429Count += 1;
	state.lastErrorMessage =
		source === "bgm"
			? "Bangumi 请求被限速，当前任务已停止，请 1 小时后手动重试"
			: source === "vndb"
				? "VNDB 请求过于频繁，正在短暂退避"
				: source === "hikarinagi"
					? "Hikarinagi 请求过于频繁，正在等待配额恢复"
					: "请求被限速，当前任务已停止";

	if (policy.stopOn429) {
		notifyRateLimitListeners();
		return {
			shouldRetry: false,
			fatal: true,
		};
	}

	const retryAfterMs = Math.min(
		getRetryAfterMs(headers) ??
			policy.defaultBackoffMs * 2 ** Math.max(0, state.consecutive429Count - 1),
		policy.maxBackoffMs,
	);
	state.backoffUntil = now + retryAfterMs;
	notifyRateLimitListeners();

	return {
		retryAfterMs,
		backoffUntil: state.backoffUntil,
		shouldRetry: attempt < policy.max429Retries,
		fatal: false,
	};
}

export function markApiRequestSucceeded(source: ApiRateLimitSource) {
	const state = rateLimitStates[source];
	if (state.consecutive429Count === 0 && !state.lastErrorMessage) {
		return;
	}

	state.consecutive429Count = 0;
	state.lastErrorMessage = undefined;
	notifyRateLimitListeners();
}

export function getApiRateLimitSnapshot(): ApiRateLimitSnapshot[] {
	return (Object.keys(rateLimitStates) as ApiRateLimitSource[]).map(
		(source) => {
			const state = rateLimitStates[source];
			return {
				source,
				queuedCount: state.queuedCount,
				nextStartAt: state.nextStartAt,
				backoffUntil: state.backoffUntil,
				last429At: state.last429At,
				consecutive429Count: state.consecutive429Count,
				lastErrorMessage: state.lastErrorMessage,
			};
		},
	);
}

export function subscribeApiRateLimit(listener: ApiRateLimitListener) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
