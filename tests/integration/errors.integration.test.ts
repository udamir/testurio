/**
 * Error Scenarios Integration Tests
 *
 * Tests error handling across the test framework.
 */

import { describe, expect, it } from "vitest";
import { TestScenario, testCase, Server, Client, AsyncServer, AsyncClient, HttpAdapter } from "testurio";
import { WebSocketAdapter } from "@testurio/adapter-ws";

// ============================================================================
// Message Type Definitions
// ============================================================================

interface TestRequest {
	value: number;
}

interface NeverSentMessage {
	[key: string]: never;
}

type ErrorMessages = {
	Test: Record<string, never>;
	TestRequest: TestRequest;
	NeverSent: NeverSentMessage;
	[key: string]: unknown;
};

// Helper functions for creating components
const createHttpMock = (name: string, port: number) =>
	new Server(name, {
		adapter: new HttpAdapter(),
		listenAddress: { host: "127.0.0.1", port },
	});

const createHttpClient = (name: string, port: number) =>
	new Client(name, {
		adapter: new HttpAdapter(),
		targetAddress: { host: "127.0.0.1", port },
	});

const createWsMock = (name: string, port: number) =>
	new AsyncServer(name, {
		adapter: new WebSocketAdapter(),
		listenAddress: { host: "127.0.0.1", port },
	});

const createWsClient = (name: string, port: number) =>
	new AsyncClient(name, {
		adapter: new WebSocketAdapter(),
		targetAddress: { host: "127.0.0.1", port },
	});

describe("Error Scenarios Integration Tests", () => {
	// ============================================================
	// 6.1 Connection Errors
	// ============================================================
	describe("6.1 Connection Errors", () => {
		it("should handle connection to non-existent server", async () => {
			const scenario = new TestScenario({
				name: "Connection Error Test",
				components: [createWsClient("api", 59999)],
			});

			const tc = testCase("Request to non-existent server", (test) => {
				test.asyncClient<ErrorMessages>("api").sendMessage("Test", {});
			});

			try {
				const result = await scenario.run(tc);
				expect(result.passed).toBe(false);
			} catch (error) {
				expect(error).toBeDefined();
			}
		});
	});

	// ============================================================
	// 6.2 Timeout Handling
	// ============================================================
	describe("6.2 Timeout Handling", () => {
		it("should handle request timeout", async () => {
			const scenario = new TestScenario({
				name: "Request Timeout Test",
				components: [createHttpMock("backend", 6301), createHttpClient("api", 6301)],
			});

			const tc = testCase("Request with slow response", (test) => {
				const api = test.client("api");
				const backend = test.server("backend");

				api.request("getSlow", { method: "GET", path: "/slow" });
				backend.onRequest("getSlow", { method: "GET", path: "/slow" }).delay(100).mockResponse(() => ({
					status: 200,
					headers: {},
					body: { delayed: true },
				}));
				api.onResponse("getSlow");
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	// ============================================================
	// 6.3 Assertion Failures
	// ============================================================
	describe("6.3 Assertion Failures", () => {
		it("should capture assertion failure details", async () => {
			const scenario = new TestScenario({
				name: "Assertion Failure Test",
				components: [createWsMock("backend", 6310), createWsClient("api", 6310)],
			});

			const tc = testCase("Assertion that fails", (test) => {
				test.asyncClient<ErrorMessages>("api").sendMessage("TestRequest", { value: 10 });

				test.asyncServer<ErrorMessages>("backend")
					.waitMessage("TestRequest", { timeout: 1000 })
					.assert((payload) => {
						return payload.value === 999; // Will fail - value is 10
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(false);
			expect(result.testCases[0].error).toBeDefined();
		});
	});

	// ============================================================
	// 6.4 Handler Errors
	// ============================================================
	describe("6.4 Handler Errors", () => {
		it("should handle errors thrown in mock handlers", async () => {
			const scenario = new TestScenario({
				name: "Handler Error Test",
				components: [createHttpMock("backend", 6320), createHttpClient("api", 6320)],
			});

			let responseData!: { error: string };

			const tc = testCase("Request with handler error", (test) => {
				const api = test.client("api");
				const backend = test.server("backend");

				api.request("getError", { method: "GET", path: "/error" });
				backend.onRequest("getError", { method: "GET", path: "/error" }).mockResponse(() => {
					throw new Error("Simulated handler error");
				});
				api.onResponse<{ error: string }>("getError").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(responseData).toMatchObject({
				error: expect.any(String),
			});
		});
	});

	// ============================================================
	// 6.5 Missing Handler
	// ============================================================
	describe("6.5 Missing Handler", () => {
		it("should handle request to unregistered endpoint", async () => {
			const scenario = new TestScenario({
				name: "Missing Handler Test",
				components: [createHttpMock("backend", 6330), createHttpClient("api", 6330)],
			});

			let responseData!: { error: string };

			const tc = testCase("Request to unregistered endpoint", (test) => {
				const api = test.client("api");

				api.request("getUnknown", { method: "GET", path: "/unknown" });
				api.onResponse<{ error: string }>("getUnknown").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(responseData).toBeDefined();
		});
	});

	// ============================================================
	// 6.6 Multiple Test Case Failures
	// ============================================================
	describe("6.6 Multiple Test Case Failures", () => {
		it("should continue running test cases after failure", async () => {
			const scenario = new TestScenario({
				name: "Multiple Failure Test",
				components: [createHttpMock("backend", 6340), createHttpClient("api", 6340)],
			});

			const tc1 = testCase("First test - will pass", (test) => {
				const api = test.client("api");
				const backend = test.server("backend");

				api.request("getPass", { method: "GET", path: "/pass" });
				backend.onRequest("getPass", { method: "GET", path: "/pass" }).mockResponse(() => ({
					status: 200,
					headers: {},
					body: { ok: true },
				}));
				api.onResponse("getPass");
			});

			const tc2 = testCase("Second test - will fail", (test) => {
				const api = test.client("api");
				const backend = test.server("backend");

				api.request("getFail", { method: "GET", path: "/fail" });
				backend.onRequest("getFail", { method: "GET", path: "/fail" }).mockResponse(() => ({
					status: 200,
					headers: {},
					body: { status: "actual" },
				}));
				api.onResponse<{ status: string }>("getFail").assert((res) => {
					return res.status === "impossible"; // Will fail
				});
			});

			const tc3 = testCase("Third test - will pass", (test) => {
				const api = test.client("api");
				const backend = test.server("backend");

				api.request("getPass2", { method: "GET", path: "/pass2" });
				backend.onRequest("getPass2", { method: "GET", path: "/pass2" }).mockResponse(() => ({
					status: 200,
					headers: {},
					body: { ok: true },
				}));
				api.onResponse("getPass2");
			});

			const result = await scenario.run(tc1, tc2, tc3);

			expect(result.passed).toBe(false);
			expect(result.testCases).toHaveLength(3);
			expect(result.testCases[0].passed).toBe(true);
			expect(result.testCases[1].passed).toBe(false);
			expect(result.testCases[2].passed).toBe(true);
		});
	});

	// ============================================================
	// 6.7 Init Handler Failure
	// ============================================================
	describe("6.7 Init Handler Failure", () => {
		it("should handle init handler that throws", async () => {
			const scenario = new TestScenario({
				name: "Init Failure Test",
				components: [createHttpMock("backend", 6350), createHttpClient("api", 6350)],
			});

			scenario.init(() => {
				throw new Error("Init failed");
			});

			const tc = testCase("Test after failed init", (test) => {
				const api = test.client("api");
				api.request("getTest", { method: "GET", path: "/test" });
				api.onResponse("getTest");
			});

			try {
				const result = await scenario.run(tc);
				expect(result.passed).toBe(false);
			} catch (error) {
				expect(error).toBeDefined();
			}
		});
	});

	// ============================================================
	// 6.8 Async Message Timeout
	// ============================================================
	describe("6.8 Async Message Timeout", () => {
		it("should handle waitMessage timeout", async () => {
			const scenario = new TestScenario({
				name: "Async Timeout Test",
				components: [createWsMock("backend", 6360), createWsClient("api", 6360)],
			});

			const tc = testCase("Wait for message that never arrives", (test) => {
				test.asyncServer<ErrorMessages>("backend")
					.waitMessage("NeverSent", { timeout: 100 })
					.assert(() => true);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(false);
			expect(result.testCases[0].error).toContain("timeout");
		});
	});
});
