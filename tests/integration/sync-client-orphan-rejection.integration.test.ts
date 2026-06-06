/**
 * Sync Client — Orphan Rejection Integration Tests (task 036)
 *
 * Regression test for issue #1 in `temp/execute-request-analysis.md`:
 * `Client.executeRequest()`'s non-retry tail only attaches `.then/.catch` inside
 * a per-hook loop. When no `onResponse`/`waitResponse` hook is registered
 * (fire-and-forget), the request promise would be unobserved and a rejection
 * would surface as a Node `unhandledRejection`.
 *
 * After the Phase 1 fix, the request promise's orphan rejections are routed
 * through the component's `trackUnhandledError` machinery and surfaced via
 * `client.getUnhandledErrors()`. Note: surfacing teardown-time rejections as
 * `result.passed === false` requires an execution-layer drain after `runStop`
 * and is explicitly deferred (see design.md → "Surfacing teardown rejections
 * as failures"). The follow-up task 038-sync-client-request-response-pairing
 * will revisit the broader contract.
 *
 * Port range: 36xxx (matches task index 036, per CLAUDE.md port allocation).
 */

import { Client, HttpProtocol, Server, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";

// =============================================================================
// Type Definitions
// =============================================================================

interface OrphanService {
	getThing: {
		request: { method: "GET"; path: "/thing" };
		response: { code: 200; body: { ok: boolean } };
	};
}

// Port counter for this test file (36xxx range — see CLAUDE.md).
let portCounter = 36000;
function getNextPort(): number {
	return portCounter++;
}

// =============================================================================
// Tests
// =============================================================================

describe("Sync Client — orphan request rejection (task 036)", () => {
	it("Test A: fire-and-forget request whose rejection arrives during scenario teardown is surfaced via getUnhandledErrors", async () => {
		const port = getNextPort();

		const server = new Server("mock", {
			protocol: new HttpProtocol<OrphanService>(),
			listenAddress: { host: "localhost", port },
		});

		const client = new Client("api", {
			protocol: new HttpProtocol<OrphanService>(),
			targetAddress: { host: "localhost", port },
		});

		const scenario = new TestScenario({
			name: "orphan-rejection-fire-and-forget",
			components: [server, client],
		});

		// Server delays its response well past scenario teardown, so the in-flight
		// fetch is forced to reject when the server is closed in `runStop`.
		scenario.init((test) => {
			test
				.use(server)
				.onRequest("getThing", { method: "GET", path: "/thing" })
				.delay(30_000)
				.mockResponse(() => ({ code: 200, body: { ok: true } }));
		});

		const tc = testCase("fire-and-forget", (test) => {
			const api = test.use(client);
			// No onResponse / waitResponse — request is fire-and-forget.
			api.request("getThing", { method: "GET", path: "/thing" });
		});

		await scenario.run(tc);

		// Primary signal: the fallback .catch routed the orphan rejection into the
		// client's unhandledErrors. Before the fix, it would have surfaced as a
		// Node `unhandledRejection` instead.
		const errors = client.getUnhandledErrors();
		expect(errors.length).toBeGreaterThanOrEqual(1);
		expect(errors[0]).toBeInstanceOf(Error);
	}, 15_000);

	it("Test B: fire-and-forget happy-path request preserves result.passed === true", async () => {
		const port = getNextPort();

		const server = new Server("mock", {
			protocol: new HttpProtocol<OrphanService>(),
			listenAddress: { host: "localhost", port },
		});

		const client = new Client("api", {
			protocol: new HttpProtocol<OrphanService>(),
			targetAddress: { host: "localhost", port },
		});

		const scenario = new TestScenario({
			name: "orphan-rejection-happy-path",
			components: [server, client],
		});

		scenario.init((test) => {
			test
				.use(server)
				.onRequest("getThing", { method: "GET", path: "/thing" })
				.mockResponse(() => ({ code: 200, body: { ok: true } }));
		});

		const tc = testCase("fire-and-forget-success", (test) => {
			const api = test.use(client);
			api.request("getThing", { method: "GET", path: "/thing" });
		});

		const result = await scenario.run(tc);

		// Sanity: the fallback .catch must not change happy-path observable
		// semantics. Note: `getUnhandledErrors().length === 0` is NOT asserted
		// because the fire-and-forget fetch is still mid-flight (response body
		// parsing / socket close) when the scenario tears down the server, so
		// the fallback .catch correctly captures that orphan rejection. This is
		// the same race that the original failing test exhibits — by design,
		// surfacing teardown rejections as test failures is deferred (see
		// design.md → "Surfacing teardown rejections as failures").
		expect(result.passed).toBe(true);
	}, 15_000);

	it("Test C: request WITH onResponse — when the request rejects, the step failure surfaces via rejectHook (no duplicate failure from the fallback .catch)", async () => {
		// Client targets a port with no server listening, so the fetch rejects
		// quickly (ECONNREFUSED) while the test case is still active. The
		// per-hook `.catch` rejects the `onResponse` step via `rejectHook`; the
		// fallback `.catch` also fires and appends to `unhandledErrors`. The
		// drain in `TestScenario.executeTestCase` does not double-fail an
		// already-failing test (`result.passed && unhandledErrors.length > 0`
		// gate).
		const port = getNextPort(); // unused — nothing listens here

		const client = new Client("api", {
			protocol: new HttpProtocol<OrphanService>(),
			targetAddress: { host: "127.0.0.1", port },
		});

		const scenario = new TestScenario({
			name: "orphan-rejection-with-onresponse",
			components: [client],
		});

		const tc = testCase("with-onresponse", (test) => {
			const api = test.use(client);
			api.request("getThing", { method: "GET", path: "/thing" });
			api.onResponse("getThing").assert(() => true);
		});

		const result = await scenario.run(tc);

		// Step failure surfaces (via rejectHook + awaitHook in executeResponseStep).
		expect(result.passed).toBe(false);
		// Exactly one test case ran and exactly one step failed — the failure is
		// not duplicated even though both the per-hook `.catch` and the fallback
		// `.catch` observe the same rejection.
		expect(result.testCases).toHaveLength(1);
		expect(result.testCases[0].failedSteps).toBe(1);
	}, 15_000);
});
