/**
 * Retry / Polling Types
 *
 * Shared types for the step-level retry primitive used by SyncClient.request
 * and DataSource.exec. Retry-while semantics: predicate returns true to keep
 * retrying, false to stop.
 */

/**
 * Retry-while predicate.
 *
 * @returns true to keep retrying, false to stop and return the current result.
 */
export type RetryPredicate<T> = (result: T) => boolean | Promise<boolean>;

/**
 * Options form of .retry(). All fields optional.
 */
export interface RetryOptions {
	/** Overall wall-clock timeout for the polling loop, in ms. Default: 5000. */
	timeout?: number;
	/** Delay between attempts in ms. Default: 1000. Use 0 for immediate retry (hot-loop). */
	interval?: number;
	/**
	 * If an attempt throws, treat it as "not ready yet" and retry until timeout.
	 * Default: true. Set false to fail-fast on the first thrown error.
	 */
	retryOnError?: boolean;
}

/**
 * Internal normalized retry policy stored on `step.params.retry` by the builder.
 * All fields required — defaults have been applied by `normalizeRetryPolicy`.
 */
export interface RetryPolicy<T = unknown> {
	predicate: RetryPredicate<T>;
	timeout: number;
	interval: number;
	retryOnError: boolean;
}
