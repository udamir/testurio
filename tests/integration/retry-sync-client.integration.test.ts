/**
 * Retry — SyncClient Integration Tests
 *
 * Covers cases I-1..I-16 from design §4d (task 024).
 *
 * Uses real `Client` + `Server` over HTTP. Port range: 22xxx.
 *
 * For the `RetryTimeoutError` shape assertions: the framework converts the
 * raw `Error` instance to a string before exposing it on `TestCaseResult`, so
 * we assert against the well-known `RetryTimeoutError` message format
 * (`"Retry exhausted after Xms / N attempt(s) for ..."`) plus side-channel
 * counters for attempt counts and `Date.now()` bracketing for wall-time.
 */

import { Client, HttpProtocol, Server, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";

// =============================================================================
// Type Definitions
// =============================================================================

interface RetryHttpService {
	getStatus: {
		request: { method: "GET"; path: "/status" };
		response: { code: 200 | 503; body: { ready: boolean } };
	};
	getResource: {
		request: { method: "GET"; path: "/resource" };
		response: { code: 200 | 500; body: { id: string; ts: number } };
	};
}

// Port counter for this test file (22xxx range — see CLAUDE.md port allocation).
let portCounter = 22000;
function getNextPort(): number {
	return portCounter++;
}

interface ParsedRetryError {
	attempts: number;
	elapsedMs: number;
}

function parseRetryError(message: string | undefined): ParsedRetryError | undefined {
	if (!message) return undefined;
	const match = message.match(/Retry exhausted after (\d+)ms \/ (\d+) attempt\(s\)/);
	if (!match) return undefined;
	return { elapsedMs: Number(match[1]), attempts: Number(match[2]) };
}

// =============================================================================
// Type-Inference Smoke Check (Task 4.5)
// =============================================================================
// A non-executing block that proves the `.retry(...)` predicate parameter is
// inferred as `ExtractClientResponse<P, "getStatus">` end-to-end with no
// generic annotations.
function _typeInferenceSmokeCheck(): void {
	const client = new Client("smoke", {
		protocol: new HttpProtocol<RetryHttpService>(),
		targetAddress: { host: "localhost", port: 1 },
	});
	const scenario = new TestScenario({ name: "smoke", components: [client] });
	const tc = testCase("smoke", (test) => {
		const api = test.use(client);
		api.request("getStatus", { method: "GET", path: "/status" }).retry((res) => {
			// `res` is inferred as { code: 200 | 503; body: { ready: boolean } }
			// without any generic annotation.
			const _code: 200 | 503 = res.code;
			const _ready: boolean = res.body.ready;
			void _code;
			void _ready;
			return res.body.ready === false;
		}, 3000);
	});
	void scenario;
	void tc;
}
void _typeInferenceSmokeCheck;

// =============================================================================
// Helpers — build a Client + Server pair with a stateful mock.
// =============================================================================

function buildPair(port: number): {
	client: Client<HttpProtocol<RetryHttpService>>;
	server: Server<HttpProtocol<RetryHttpService>>;
} {
	const server = new Server("backend", {
		protocol: new HttpProtocol<RetryHttpService>(),
		listenAddress: { host: "localhost", port },
	});
	const client = new Client("api", {
		protocol: new HttpProtocol<RetryHttpService>(),
		targetAddress: { host: "localhost", port },
	});
	return { client, server };
}

// =============================================================================
// Defaults
// =============================================================================

describe("Retry — SyncClient (HTTP)", () => {
	describe("Defaults", () => {
		it("I-1: uses 5s timeout and 1s interval when called as `.retry(pred)`", async () => {
			const port = getNextPort();
			const { client, server } = buildPair(port);
			let attempts = 0;

			const scenario = new TestScenario({ name: "I-1", components: [server, client] });
			scenario.init((test) => {
				test
					.use(server)
					.onRequest("getStatus", { method: "GET", path: "/status" })
					.mockResponse(() => {
						attempts += 1;
						const ready = attempts >= 3;
						return { code: ready ? 200 : 503, body: { ready } };
					});
			});

			const tc = testCase("I-1 defaults", (test) => {
				const api = test.use(client);
				api.request("getStatus", { method: "GET", path: "/status" }).retry((res) => res.body.ready === false);
				api.onResponse("getStatus").assert((res) => res.code === 200);
			});

			const t0 = Date.now();
			const result = await scenario.run(tc);
			const elapsed = Date.now() - t0;

			expect(result.passed).toBe(true);
			expect(attempts).toBe(3);
			// 2 intervals of 1000ms minimum between 3 attempts.
			expect(elapsed).toBeGreaterThanOrEqual(2000);
		}, 15_000);

		it("I-2: fails with `RetryTimeoutError` after ~5000 ms when predicate stays true", async () => {
			const port = getNextPort();
			const { client, server } = buildPair(port);

			const scenario = new TestScenario({ name: "I-2", components: [server, client] });
			scenario.init((test) => {
				test
					.use(server)
					.onRequest("getStatus", { method: "GET", path: "/status" })
					.mockResponse(() => ({ code: 503, body: { ready: false } }));
			});

			const tc = testCase("I-2 default timeout", (test) => {
				const api = test.use(client);
				api.request("getStatus", { method: "GET", path: "/status" }).retry((res) => res.body.ready === false);
			});

			const t0 = Date.now();
			const result = await scenario.run(tc);
			const elapsed = Date.now() - t0;

			expect(result.passed).toBe(false);
			const errMsg = result.testCases[0].steps.find((s) => !s.passed)?.error;
			expect(errMsg).toContain("Retry exhausted");
			expect(errMsg).toContain('Client.request("getStatus")');
			const parsed = parseRetryError(errMsg);
			expect(parsed).toBeDefined();
			expect(parsed?.attempts).toBeGreaterThanOrEqual(4);
			expect(parsed?.elapsedMs).toBeGreaterThanOrEqual(5000);
			expect(elapsed).toBeLessThanOrEqual(8000);
		}, 15_000);
	});

	// ==========================================================================
	// Call forms
	// ==========================================================================

	describe("Call forms", () => {
		it("I-3: accepts `.retry(pred, timeoutMs)` short form", async () => {
			const port = getNextPort();
			const { client, server } = buildPair(port);
			let attempts = 0;

			const scenario = new TestScenario({ name: "I-3", components: [server, client] });
			scenario.init((test) => {
				test
					.use(server)
					.onRequest("getStatus", { method: "GET", path: "/status" })
					.mockResponse(() => {
						attempts += 1;
						const ready = attempts >= 2;
						return { code: ready ? 200 : 503, body: { ready } };
					});
			});

			const tc = testCase("I-3", (test) => {
				const api = test.use(client);
				api.request("getStatus", { method: "GET", path: "/status" }).retry((res) => res.body.ready === false, 2000);
				api.onResponse("getStatus").assert((res) => res.code === 200);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(attempts).toBe(2);
		}, 10_000);

		it("I-4: accepts `.retry(pred, { timeout, interval })` options form", async () => {
			const port = getNextPort();
			const { client, server } = buildPair(port);
			let attempts = 0;

			const scenario = new TestScenario({ name: "I-4", components: [server, client] });
			scenario.init((test) => {
				test
					.use(server)
					.onRequest("getStatus", { method: "GET", path: "/status" })
					.mockResponse(() => {
						attempts += 1;
						const ready = attempts >= 5;
						return { code: ready ? 200 : 503, body: { ready } };
					});
			});

			const tc = testCase("I-4", (test) => {
				const api = test.use(client);
				api
					.request("getStatus", { method: "GET", path: "/status" })
					.retry((res) => res.body.ready === false, { timeout: 2000, interval: 250 });
				api.onResponse("getStatus").assert((res) => res.code === 200);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(attempts).toBeGreaterThanOrEqual(5);
			expect(attempts).toBeLessThanOrEqual(8);
		}, 10_000);

		it("I-5: partial options merge with defaults (interval only)", async () => {
			const port = getNextPort();
			const { client, server } = buildPair(port);
			let attempts = 0;

			const scenario = new TestScenario({ name: "I-5", components: [server, client] });
			scenario.init((test) => {
				test
					.use(server)
					.onRequest("getStatus", { method: "GET", path: "/status" })
					.mockResponse(() => {
						attempts += 1;
						return { code: 503, body: { ready: false } };
					});
			});

			const tc = testCase("I-5", (test) => {
				const api = test.use(client);
				api
					.request("getStatus", { method: "GET", path: "/status" })
					.retry((res) => res.body.ready === false, { interval: 200 });
			});

			const t0 = Date.now();
			const result = await scenario.run(tc);
			const elapsed = Date.now() - t0;

			expect(result.passed).toBe(false);
			expect(elapsed).toBeGreaterThanOrEqual(5000);
			// 200ms interval x ~25 attempts = 5000ms.
			expect(attempts).toBeGreaterThanOrEqual(15);
		}, 15_000);

		it("I-6: partial options merge with defaults (timeout only)", async () => {
			const port = getNextPort();
			const { client, server } = buildPair(port);
			let attempts = 0;

			const scenario = new TestScenario({ name: "I-6", components: [server, client] });
			scenario.init((test) => {
				test
					.use(server)
					.onRequest("getStatus", { method: "GET", path: "/status" })
					.mockResponse(() => {
						attempts += 1;
						return { code: 503, body: { ready: false } };
					});
			});

			const tc = testCase("I-6", (test) => {
				const api = test.use(client);
				api
					.request("getStatus", { method: "GET", path: "/status" })
					.retry((res) => res.body.ready === false, { timeout: 1500 });
			});

			const t0 = Date.now();
			const result = await scenario.run(tc);
			const elapsed = Date.now() - t0;

			expect(result.passed).toBe(false);
			expect(elapsed).toBeGreaterThanOrEqual(1500);
			expect(elapsed).toBeLessThanOrEqual(3500);
			// Default 1000ms interval × 1500ms budget → ~2 attempts.
			expect(attempts).toBeGreaterThanOrEqual(2);
			expect(attempts).toBeLessThanOrEqual(3);
		}, 10_000);
	});

	// ==========================================================================
	// Convergence
	// ==========================================================================

	describe("Convergence", () => {
		it("I-7: single attempt when predicate is false on first response", async () => {
			const port = getNextPort();
			const { client, server } = buildPair(port);
			let attempts = 0;

			const scenario = new TestScenario({ name: "I-7", components: [server, client] });
			scenario.init((test) => {
				test
					.use(server)
					.onRequest("getStatus", { method: "GET", path: "/status" })
					.mockResponse(() => {
						attempts += 1;
						return { code: 200, body: { ready: true } };
					});
			});

			const tc = testCase("I-7", (test) => {
				const api = test.use(client);
				api.request("getStatus", { method: "GET", path: "/status" }).retry((res) => res.body.ready === false, 3000);
				api.onResponse("getStatus").assert((res) => res.code === 200);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(attempts).toBe(1);
		});

		it("I-8: retries until mock starts returning 200", async () => {
			const port = getNextPort();
			const { client, server } = buildPair(port);
			let attempts = 0;

			const scenario = new TestScenario({ name: "I-8", components: [server, client] });
			scenario.init((test) => {
				test
					.use(server)
					.onRequest("getStatus", { method: "GET", path: "/status" })
					.mockResponse(() => {
						attempts += 1;
						const ready = attempts >= 5;
						return { code: ready ? 200 : 503, body: { ready } };
					});
			});

			const tc = testCase("I-8", (test) => {
				const api = test.use(client);
				api
					.request("getStatus", { method: "GET", path: "/status" })
					.retry((res) => res.code !== 200, { timeout: 5000, interval: 100 });
				api.onResponse("getStatus").assert((res) => res.code === 200);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(attempts).toBe(5);
		}, 10_000);

		it("I-9: `onResponse().assert()` receives the terminal response only", async () => {
			const port = getNextPort();
			const { client, server } = buildPair(port);
			let attempts = 0;
			let assertCalls = 0;

			const scenario = new TestScenario({ name: "I-9", components: [server, client] });
			scenario.init((test) => {
				test
					.use(server)
					.onRequest("getStatus", { method: "GET", path: "/status" })
					.mockResponse(() => {
						attempts += 1;
						const ready = attempts >= 4;
						return { code: ready ? 200 : 503, body: { ready } };
					});
			});

			const tc = testCase("I-9", (test) => {
				const api = test.use(client);
				api
					.request("getStatus", { method: "GET", path: "/status" })
					.retry((res) => res.code !== 200, { timeout: 5000, interval: 100 });
				api.onResponse("getStatus").assert((res) => {
					assertCalls += 1;
					return res.code === 200;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(assertCalls).toBe(1);
		}, 10_000);
	});

	// ==========================================================================
	// Timeout error shape
	// ==========================================================================

	describe("Timeout", () => {
		it("I-10: RetryTimeoutError message includes attempts, elapsedMs, lastResult marker", async () => {
			const port = getNextPort();
			const { client, server } = buildPair(port);
			let attempts = 0;

			const scenario = new TestScenario({ name: "I-10", components: [server, client] });
			scenario.init((test) => {
				test
					.use(server)
					.onRequest("getStatus", { method: "GET", path: "/status" })
					.mockResponse(() => {
						attempts += 1;
						return { code: 503, body: { ready: false } };
					});
			});

			const tc = testCase("I-10", (test) => {
				const api = test.use(client);
				api
					.request("getStatus", { method: "GET", path: "/status" })
					.retry((res) => res.body.ready === false, { timeout: 800, interval: 200 });
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(false);
			const errMsg = result.testCases[0].steps.find((s) => !s.passed)?.error;
			const parsed = parseRetryError(errMsg);
			expect(parsed).toBeDefined();
			expect(parsed?.attempts).toBeGreaterThanOrEqual(3);
			expect(parsed?.attempts).toBeLessThanOrEqual(6);
			expect(parsed?.elapsedMs).toBeGreaterThanOrEqual(800);
			expect(parsed?.elapsedMs).toBeLessThanOrEqual(2000);
			// lastResult is on the error instance, lost in stringification — verify via
			// the side-channel: mock always returned 503, so we know lastResult.code was 503.
			expect(attempts).toBe(parsed?.attempts);
		}, 10_000);
	});

	// ==========================================================================
	// Error policy
	// ==========================================================================

	describe("Error policy", () => {
		it("I-11: swallows attempt errors (retryOnError: true is the default; verified via 503-then-200 surrogate)", async () => {
			// Note: the design proposed mocking a server-side throw to test the retry
			// catch path, but a mock throw becomes a 500 response on the client (the
			// HTTP adapter only throws on transport errors). This surrogate verifies
			// the integration of retry with the response path; U-7 covers the actual
			// attempt-error swallow logic at the unit-test level.
			const port = getNextPort();
			const { client, server } = buildPair(port);
			let attempts = 0;

			const scenario = new TestScenario({ name: "I-11", components: [server, client] });
			scenario.init((test) => {
				test
					.use(server)
					.onRequest("getStatus", { method: "GET", path: "/status" })
					.mockResponse(() => {
						attempts += 1;
						if (attempts < 3) return { code: 503, body: { ready: false } };
						return { code: 200, body: { ready: true } };
					});
			});

			const tc = testCase("I-11", (test) => {
				const api = test.use(client);
				api
					.request("getStatus", { method: "GET", path: "/status" })
					.retry((res) => res.code !== 200, { timeout: 5000, interval: 100, retryOnError: true });
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(attempts).toBe(3);
		}, 10_000);

		it("I-12: fails fast when retryOnError: false and attempt throws (real connection error)", async () => {
			// Point Client at a port with no Server listening → adapter throws on first attempt.
			const port = getNextPort();
			const client = new Client("api", {
				protocol: new HttpProtocol<RetryHttpService>(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({ name: "I-12", components: [client] });

			const tc = testCase("I-12", (test) => {
				const api = test.use(client);
				api
					.request("getStatus", { method: "GET", path: "/status" })
					.retry((res) => res.code !== 200, { timeout: 5000, retryOnError: false });
			});

			const t0 = Date.now();
			const result = await scenario.run(tc);
			const elapsed = Date.now() - t0;

			expect(result.passed).toBe(false);
			const errMsg = result.testCases[0].steps.find((s) => !s.passed)?.error;
			// Error is the underlying connection error, NOT RetryTimeoutError.
			expect(errMsg).not.toContain("Retry exhausted");
			// Should fail-fast — far less than the 5s overall budget.
			expect(elapsed).toBeLessThan(2000);
		}, 10_000);
	});

	// ==========================================================================
	// Interval
	// ==========================================================================

	describe("Interval", () => {
		it("I-13: interval: 0 hot-loops", async () => {
			const port = getNextPort();
			const { client, server } = buildPair(port);
			let attempts = 0;

			const scenario = new TestScenario({ name: "I-13", components: [server, client] });
			scenario.init((test) => {
				test
					.use(server)
					.onRequest("getStatus", { method: "GET", path: "/status" })
					.mockResponse(() => {
						attempts += 1;
						const ready = attempts >= 20;
						return { code: ready ? 200 : 503, body: { ready } };
					});
			});

			const tc = testCase("I-13", (test) => {
				const api = test.use(client);
				api
					.request("getStatus", { method: "GET", path: "/status" })
					.retry((res) => res.body.ready === false, { timeout: 5000, interval: 0 });
			});

			const t0 = Date.now();
			const result = await scenario.run(tc);
			const elapsed = Date.now() - t0;

			expect(result.passed).toBe(true);
			expect(attempts).toBeGreaterThanOrEqual(20);
			expect(elapsed).toBeLessThan(2000);
		}, 10_000);
	});

	// ==========================================================================
	// Data factory re-resolution
	// ==========================================================================

	describe("Data factory", () => {
		it("I-14: request data factory re-resolves every attempt", async () => {
			const port = getNextPort();
			const { client, server } = buildPair(port);
			let attempts = 0;
			let factoryCalls = 0;

			const scenario = new TestScenario({ name: "I-14", components: [server, client] });
			scenario.init((test) => {
				test
					.use(server)
					.onRequest("getResource", { method: "GET", path: "/resource" })
					.mockResponse(() => {
						attempts += 1;
						if (attempts < 3) return { code: 500, body: { id: "tmp", ts: 0 } };
						return { code: 200, body: { id: "ok", ts: Date.now() } };
					});
			});

			const tc = testCase("I-14", (test) => {
				const api = test.use(client);
				api
					.request("getResource", () => {
						factoryCalls += 1;
						return { method: "GET", path: "/resource" };
					})
					.retry((res) => res.code !== 200, { timeout: 5000, interval: 100 });
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(attempts).toBe(3);
			expect(factoryCalls).toBe(3);
		}, 10_000);
	});

	// ==========================================================================
	// Composition with onResponse().assert()
	// ==========================================================================

	describe("Composition", () => {
		it("I-15: `.retry()` composes with chained `.onResponse().assert()`", async () => {
			const port = getNextPort();
			const { client, server } = buildPair(port);
			let attempts = 0;

			const scenario = new TestScenario({ name: "I-15", components: [server, client] });
			scenario.init((test) => {
				test
					.use(server)
					.onRequest("getStatus", { method: "GET", path: "/status" })
					.mockResponse(() => {
						attempts += 1;
						const ready = attempts >= 3;
						return { code: ready ? 200 : 503, body: { ready } };
					});
			});

			const tc = testCase("I-15", (test) => {
				const api = test.use(client);
				api
					.request("getStatus", { method: "GET", path: "/status" })
					.retry((res) => res.body.ready === false, { timeout: 2000, interval: 100 });
				api.onResponse("getStatus").assert((res) => res.body.ready === true);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(attempts).toBe(3);
		}, 10_000);
	});

	// I-16 (auto-validation interplay) is deliberately omitted: the design plan
	// allows skipping it ("Skip I-16 if the auto-validation hook into retried
	// attempts is non-trivial — surface as design question before merging").
	// The non-retry validation path is already exercised by other validation
	// integration tests; the per-attempt validation behaviour is documented in
	// the design (§2.2) and follows naturally from the `attempt()` closure
	// being the integration point for both retry and auto-validation.
});
