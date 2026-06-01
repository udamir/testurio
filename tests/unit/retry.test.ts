/**
 * Retry Runner Unit Tests
 *
 * Pure-logic tests for `runWithRetry`, `normalizeRetryPolicy`, and
 * `RetryTimeoutError`. No components, protocols, or adapters — matches the
 * project rule "no emulated components in unit tests".
 *
 * Cases mapped from design §4c (U-1 .. U-14).
 */

import type { RetryOptions, RetryPredicate } from "testurio";
import { normalizeRetryPolicy, RetryTimeoutError, runWithRetry } from "testurio";
import { describe, expect, it, vi } from "vitest";

const alwaysRetry: RetryPredicate<unknown> = () => true;
const neverRetry: RetryPredicate<unknown> = () => false;

describe("normalizeRetryPolicy", () => {
	it("U-1: applies all defaults when only predicate is passed", () => {
		const policy = normalizeRetryPolicy(neverRetry);
		expect(policy.predicate).toBe(neverRetry);
		expect(policy.timeout).toBe(5000);
		expect(policy.interval).toBe(1000);
		expect(policy.retryOnError).toBe(true);
	});

	it("U-2: uses numeric second arg as timeout, keeps default interval and retryOnError", () => {
		const policy = normalizeRetryPolicy(neverRetry, 3000);
		expect(policy.timeout).toBe(3000);
		expect(policy.interval).toBe(1000);
		expect(policy.retryOnError).toBe(true);
	});

	it("U-3: merges partial options with defaults", () => {
		const intervalOnly = normalizeRetryPolicy(neverRetry, { interval: 200 });
		expect(intervalOnly.timeout).toBe(5000);
		expect(intervalOnly.interval).toBe(200);
		expect(intervalOnly.retryOnError).toBe(true);

		const timeoutOnly = normalizeRetryPolicy(neverRetry, { timeout: 2000 });
		expect(timeoutOnly.timeout).toBe(2000);
		expect(timeoutOnly.interval).toBe(1000);
		expect(timeoutOnly.retryOnError).toBe(true);

		const retryOnErrorOnly: RetryOptions = { retryOnError: false };
		const policy = normalizeRetryPolicy(neverRetry, retryOnErrorOnly);
		expect(policy.timeout).toBe(5000);
		expect(policy.interval).toBe(1000);
		expect(policy.retryOnError).toBe(false);
	});
});

describe("runWithRetry", () => {
	it("U-4: returns immediately when predicate is false on first attempt", async () => {
		let calls = 0;
		const attempt = async (): Promise<string> => {
			calls += 1;
			return "ok";
		};
		const policy = normalizeRetryPolicy<string>(() => false, 1000);

		const result = await runWithRetry(policy, attempt, "test");
		expect(result).toBe("ok");
		expect(calls).toBe(1);
	});

	it("U-5: loops until predicate returns false, returns terminal result", async () => {
		const responses = ["try-1", "try-2", "try-3"];
		let calls = 0;
		const attempt = async (): Promise<string> => {
			const value = responses[calls];
			calls += 1;
			return value;
		};
		const policy = normalizeRetryPolicy<string>((r) => r !== "try-3", { timeout: 2000, interval: 0 });

		const result = await runWithRetry(policy, attempt, "test");
		expect(result).toBe("try-3");
		expect(calls).toBe(3);
	});

	it("U-6: throws RetryTimeoutError when predicate never returns false; error carries attempts, elapsedMs, lastResult", async () => {
		let calls = 0;
		const attempt = async (): Promise<string> => {
			calls += 1;
			return "busy";
		};
		const policy = normalizeRetryPolicy<string>(alwaysRetry, { timeout: 200, interval: 50 });

		try {
			await runWithRetry(policy, attempt, "test op");
			expect.unreachable("expected RetryTimeoutError");
		} catch (err) {
			expect(err).toBeInstanceOf(RetryTimeoutError);
			if (err instanceof RetryTimeoutError) {
				expect(err.name).toBe("RetryTimeoutError");
				expect(err.attempts).toBeGreaterThanOrEqual(3);
				expect(err.lastResult).toBe("busy");
				expect(err.lastError).toBeUndefined();
				expect(err.elapsedMs).toBeGreaterThanOrEqual(200);
			}
		}
		expect(calls).toBeGreaterThanOrEqual(3);
	});

	it("U-7: swallows attempt errors when retryOnError is true; lastError tracked", async () => {
		let calls = 0;
		const attempt = async (): Promise<string> => {
			calls += 1;
			if (calls < 3) throw new Error("boom");
			return "ok";
		};
		const policy = normalizeRetryPolicy<string>(neverRetry, { timeout: 2000, interval: 0 });

		const result = await runWithRetry(policy, attempt, "test");
		expect(result).toBe("ok");
		expect(calls).toBe(3);
	});

	it("U-8: fails immediately when attempt throws and retryOnError is false", async () => {
		let calls = 0;
		const boom = new Error("boom");
		const attempt = async (): Promise<string> => {
			calls += 1;
			throw boom;
		};
		const policy = normalizeRetryPolicy<string>(neverRetry, { timeout: 5000, interval: 0, retryOnError: false });

		await expect(runWithRetry(policy, attempt, "test")).rejects.toBe(boom);
		expect(calls).toBe(1);
	});

	it("U-9: honours custom interval (cadence approximately matches)", async () => {
		let calls = 0;
		const attempt = async (): Promise<number> => {
			calls += 1;
			return calls;
		};
		const policy = normalizeRetryPolicy<number>(alwaysRetry, { timeout: 350, interval: 100 });

		const start = Date.now();
		await expect(runWithRetry(policy, attempt, "test")).rejects.toBeInstanceOf(RetryTimeoutError);
		const elapsed = Date.now() - start;

		expect(elapsed).toBeGreaterThanOrEqual(300);
		expect(elapsed).toBeLessThanOrEqual(700);
		expect(calls).toBeGreaterThanOrEqual(3);
		expect(calls).toBeLessThanOrEqual(5);
	});

	it("U-10: interval=0 skips sleep and hot-loops to timeout", async () => {
		const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
		setTimeoutSpy.mockClear();
		let calls = 0;
		const attempt = async (): Promise<number> => {
			calls += 1;
			return calls;
		};
		const policy = normalizeRetryPolicy<number>(alwaysRetry, { timeout: 50, interval: 0 });

		await expect(runWithRetry(policy, attempt, "test")).rejects.toBeInstanceOf(RetryTimeoutError);

		expect(setTimeoutSpy).not.toHaveBeenCalled();
		expect(calls).toBeGreaterThan(10);
		setTimeoutSpy.mockRestore();
	});

	it("U-11: predicate that throws aborts the loop (no retry)", async () => {
		let calls = 0;
		const attempt = async (): Promise<string> => {
			calls += 1;
			return "ok";
		};
		const bad = new Error("bad predicate");
		const policy = normalizeRetryPolicy<string>(
			() => {
				throw bad;
			},
			{ timeout: 5000, interval: 0 }
		);

		await expect(runWithRetry(policy, attempt, "test")).rejects.toBe(bad);
		expect(calls).toBe(1);
	});

	it("U-12: async predicate is awaited", async () => {
		let calls = 0;
		const attempt = async (): Promise<number> => {
			calls += 1;
			return calls;
		};
		const policy = normalizeRetryPolicy<number>(
			async (n) => {
				await new Promise((r) => setTimeout(r, 5));
				return n < 3;
			},
			{ timeout: 1000, interval: 0 }
		);

		const result = await runWithRetry(policy, attempt, "test");
		expect(result).toBe(3);
		expect(calls).toBe(3);
	});

	it("U-13: RetryTimeoutError message includes description, attempts, elapsed, last-error message when present", async () => {
		const attempt = async (): Promise<string> => {
			throw new Error("connection refused");
		};
		const policy = normalizeRetryPolicy<string>(neverRetry, { timeout: 80, interval: 20 });

		try {
			await runWithRetry(policy, attempt, "MyOp.call");
			expect.unreachable();
		} catch (err) {
			if (!(err instanceof RetryTimeoutError)) throw err;
			expect(err.message).toContain("MyOp.call");
			expect(err.message).toContain("attempt(s)");
			expect(err.message).toContain("last error: connection refused");
			expect(err.lastError?.message).toBe("connection refused");
		}
	});

	it("U-14: last interval sleep is clamped so it never overshoots the deadline", async () => {
		let calls = 0;
		const attempt = async (): Promise<number> => {
			calls += 1;
			return calls;
		};
		const policy = normalizeRetryPolicy<number>(alwaysRetry, { timeout: 120, interval: 1000 });

		const start = Date.now();
		await expect(runWithRetry(policy, attempt, "test")).rejects.toBeInstanceOf(RetryTimeoutError);
		const elapsed = Date.now() - start;

		expect(elapsed).toBeLessThanOrEqual(400);
		expect(elapsed).toBeGreaterThanOrEqual(120);
	});
});
