/**
 * Retry / Polling Runner
 *
 * Generic step-level retry primitive used by SyncClient.request and
 * DataSource.exec. Pure logic — no component, protocol, or adapter dependencies.
 *
 * Retry-while semantics: predicate returns true to keep retrying, false to stop.
 *
 * Abort signal: not threaded through `runWithRetry` in this version. The
 * step-executor's abort signal is checked between steps only and is not passed
 * into `Component.executeStep`. Adding mid-step cancellation would require a
 * larger refactor of the Component interface; users who need it should keep
 * `policy.timeout` short enough to bound worst-case step duration.
 */

import type { RetryOptions, RetryPolicy, RetryPredicate } from "./retry.types";

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_INTERVAL_MS = 1000;
const DEFAULT_RETRY_ON_ERROR = true;

/**
 * Error thrown by `runWithRetry` when the overall timeout elapses without the
 * predicate returning false. Carries diagnostic context.
 */
export class RetryTimeoutError extends Error {
	public readonly attempts: number;
	public readonly elapsedMs: number;
	public readonly lastResult: unknown;
	public readonly lastError: Error | undefined;

	constructor(
		attempts: number,
		elapsedMs: number,
		lastResult: unknown,
		lastError: Error | undefined,
		description: string
	) {
		const lastErrorSuffix = lastError ? ` (last error: ${lastError.message})` : "";
		super(`Retry exhausted after ${elapsedMs}ms / ${attempts} attempt(s) for ${description}${lastErrorSuffix}`);
		this.name = "RetryTimeoutError";
		this.attempts = attempts;
		this.elapsedMs = elapsedMs;
		this.lastResult = lastResult;
		this.lastError = lastError;
	}
}

/**
 * Normalize a `.retry(...)` call into a `RetryPolicy`.
 *
 * Handles three call shapes:
 * - `normalizeRetryPolicy(pred)` — all defaults.
 * - `normalizeRetryPolicy(pred, timeoutMs)` — numeric timeout, default interval/retryOnError.
 * - `normalizeRetryPolicy(pred, options)` — partial options merged with defaults.
 */
export function normalizeRetryPolicy<T>(
	predicate: RetryPredicate<T>,
	timeoutOrOptions?: number | RetryOptions
): RetryPolicy<T> {
	if (timeoutOrOptions === undefined) {
		return {
			predicate,
			timeout: DEFAULT_TIMEOUT_MS,
			interval: DEFAULT_INTERVAL_MS,
			retryOnError: DEFAULT_RETRY_ON_ERROR,
		};
	}
	if (typeof timeoutOrOptions === "number") {
		return {
			predicate,
			timeout: timeoutOrOptions,
			interval: DEFAULT_INTERVAL_MS,
			retryOnError: DEFAULT_RETRY_ON_ERROR,
		};
	}
	return {
		predicate,
		timeout: timeoutOrOptions.timeout ?? DEFAULT_TIMEOUT_MS,
		interval: timeoutOrOptions.interval ?? DEFAULT_INTERVAL_MS,
		retryOnError: timeoutOrOptions.retryOnError ?? DEFAULT_RETRY_ON_ERROR,
	};
}

type AttemptOutcome<T> = { ok: true; value: T } | { ok: false; error: Error };

async function runAttempt<T>(attempt: () => Promise<T>): Promise<AttemptOutcome<T>> {
	try {
		return { ok: true, value: await attempt() };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
	}
}

/**
 * Run `attempt` repeatedly until `policy.predicate` returns false on its
 * result, or `policy.timeout` elapses.
 *
 * Time accounting:
 * - The overall timer starts before the first attempt.
 * - An in-flight attempt is allowed to finish even if its completion crosses
 *   the deadline; the post-completion predicate check decides termination.
 * - The interval sleep is clamped to remaining time so it never overshoots.
 *
 * Error handling:
 * - If an attempt throws and `policy.retryOnError` is true, the error is
 *   swallowed (recorded as `lastError`) and the loop continues.
 * - If `policy.retryOnError` is false, the attempt error is rethrown
 *   immediately (no `RetryTimeoutError` wrapping).
 * - If the predicate itself throws, the error aborts the loop and is
 *   rethrown — a buggy predicate is a test-author error, not a "not ready" signal.
 */
export async function runWithRetry<T>(
	policy: RetryPolicy<T>,
	attempt: () => Promise<T>,
	description: string
): Promise<T> {
	let remaining = policy.timeout;
	let attempts = 0;
	let lastResult: T | undefined;
	let lastError: Error | undefined;

	do {
		attempts += 1;
		const t0 = Date.now();
		const outcome = await runAttempt(attempt);

		if (outcome.ok) {
			lastResult = outcome.value;
			lastError = undefined;
			// Predicate exceptions propagate — buggy predicate is a test-author error.
			const shouldRetry = await policy.predicate(outcome.value);
			if (!shouldRetry) return outcome.value;
		} else {
			lastError = outcome.error;
			if (!policy.retryOnError) throw outcome.error;
		}

		remaining -= Date.now() - t0;
		if (remaining <= 0) break;

		if (policy.interval > 0) {
			const delay = Math.min(policy.interval, remaining);
			await sleep(delay);
			remaining -= delay;
		}
	} while (remaining > 0);

	throw new RetryTimeoutError(attempts, policy.timeout - remaining, lastResult, lastError, description);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
