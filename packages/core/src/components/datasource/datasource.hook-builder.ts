/**
 * DataSource Hook Builder
 *
 * Builder for handling DataSource exec results in a declarative way.
 * Extends BaseHookBuilder with DataSource-specific handler methods.
 *
 * Per design:
 * - Contains NO logic, only handler registration
 * - All execution logic is in the Component
 */

import { BaseHookBuilder } from "../base/hook-builder";
import { normalizeRetryPolicy } from "../base/retry";
import type { RetryOptions, RetryPredicate } from "../base/retry.types";

/**
 * DataSource Hook Builder
 *
 * Builder for handling exec results in a declarative way.
 * Adds handlers to the step that will be executed by the component.
 *
 * @template T - Result type from the exec callback
 */
export class DataSourceHookBuilder<T = unknown> extends BaseHookBuilder {
	/**
	 * Add assertion handler to validate the exec result.
	 *
	 * @param descriptionOrPredicate - Description string or predicate function
	 * @param predicate - Predicate function (if first param is description)
	 * @returns this for chaining
	 *
	 * @example
	 * // Without description
	 * .assert((val) => val !== null)
	 *
	 * @example
	 * // With description (for better reports)
	 * .assert("user should exist in cache", (val) => val !== null)
	 */
	assert(
		descriptionOrPredicate: string | ((result: T) => boolean | Promise<boolean>),
		predicate?: (result: T) => boolean | Promise<boolean>
	): this {
		const [description, fn] =
			typeof descriptionOrPredicate === "string"
				? [descriptionOrPredicate, predicate]
				: [undefined, descriptionOrPredicate];

		return this.addHandler({
			type: "assert",
			description,
			params: { predicate: fn },
		});
	}

	/**
	 * Step-level wall-clock deadline for this `exec` step.
	 *
	 * If `.retry(...)` is also set, the deadline caps the entire retry loop —
	 * when it fires, the loop is terminated and the step fails with
	 * `TimeoutError`. If `.retry(...)` is not set, the deadline caps the
	 * single attempt.
	 *
	 * When both `.timeout(ms)` and `.retry({ timeout })` are set, whichever
	 * elapses first wins. `.timeout(ms)` raises `TimeoutError`; the retry
	 * budget raises `RetryTimeoutError` — distinct types for the two cases.
	 *
	 * **Cancellation note:** the in-flight SDK call when the deadline fires is
	 * abandoned, not cancelled. Cooperative cancellation via `AbortSignal`
	 * threading through the `exec` callback is planned in a follow-up task.
	 *
	 * Updates `step.params.timeout` (not a handler).
	 *
	 * @param ms - Timeout in milliseconds
	 * @returns this for chaining
	 */
	timeout(ms: number): this {
		return this.setParam("timeout", ms);
	}

	/**
	 * Poll this exec: re-run the callback until the predicate returns false,
	 * or the overall timeout elapses.
	 *
	 * Retry-WHILE semantics: predicate returns `true` → retry, `false` → stop
	 * and pass the terminal result to any chained handlers (e.g. `.assert(...)`).
	 *
	 * Defaults: `timeout = 5000` ms, `interval = 1000` ms, `retryOnError = true`.
	 *
	 * @remarks
	 * `.timeout(ms)` is a **step-level wall-clock deadline** that caps the
	 * entire retry loop. When it fires, retry is terminated and the step
	 * fails with `TimeoutError` — distinct from `RetryTimeoutError`, which
	 * means the retry budget elapsed naturally between attempts. When both
	 * `.timeout(ms)` and `.retry({ timeout })` are set, whichever elapses
	 * first wins.
	 *
	 * @example
	 *   // Poll until a row appears (defaults: 5s timeout, 1s interval).
	 *   ds.exec("wait for row", (c) => c.query(...).then((r) => r.rows))
	 *     .retry((rows) => rows.length === 0);
	 *
	 * @example
	 *   // Cap the whole polling loop at 1.5s via step-level timeout.
	 *   ds.exec("poll", (c) => c.query("SELECT 1"))
	 *     .timeout(1500)
	 *     .retry((rows) => rows.length === 0, { interval: 100 });
	 */
	retry(predicate: RetryPredicate<T>): this;
	retry(predicate: RetryPredicate<T>, timeoutMs: number): this;
	retry(predicate: RetryPredicate<T>, options: RetryOptions): this;
	retry(predicate: RetryPredicate<T>, timeoutOrOptions?: number | RetryOptions): this {
		const policy = normalizeRetryPolicy(predicate, timeoutOrOptions);
		return this.setParam("retry", policy);
	}
}
