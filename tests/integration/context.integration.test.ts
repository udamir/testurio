/**
 * Context and State Management Integration Tests
 *
 * Tests context persistence, sharing between test cases, and hook access.
 *
 * Rules Applied:
 * - No manual adapter registration (TestScenario auto-registers)
 * - No beforeEach/afterEach for adapter setup
 * - Handlers defined inside testCase() using declarative API
 * - scenario.init() only for context initialization, not handlers
 */

import { describe, expect, it } from "vitest";
import { TestScenario, testCase, Server, Client, AsyncServer, AsyncClient, HttpAdapter } from "testurio";
import { TcpAdapter } from "@testurio/adapter-tcp";

// ============================================================================
// Message Type Definitions
// ============================================================================

interface AuthRequest {
	action: string;
}

interface AuthRequestResponse {
	success: boolean;
}

interface CountRequest {
	index: number;
}

interface CountRequestResponse {
	counted: boolean;
}

type ContextMessages = {
	AuthRequest: AuthRequest;
	AuthRequestResponse: AuthRequestResponse;
	CountRequest: CountRequest;
	CountRequestResponse: CountRequestResponse;
	[key: string]: unknown;
};

// Define context type for tests
interface TestContext extends Record<string, unknown> {
	userId?: number;
	authToken?: string;
	lastResponse?: unknown;
	requestCount?: number;
	results?: unknown[];
}

// Type-safe HTTP service definition
interface HttpServiceDef {
	getUser: {
		request: { method: string; path: string; body?: never };
		responses: { 200: { body: { id: number; name: string } } };
	};
	getData: {
		request: { method: string; path: string; body?: never };
		responses: { 200: { body: { value: number } } };
	};
	getProfile: {
		request: { method: string; path: string; body?: never };
		responses: { 200: { body: { id: number; name: string; email: string } } };
	};
	getUser1: {
		request: { method: string; path: string; body?: never };
		responses: { 200: { body: { id: number; name: string; orders: number[] } } };
	};
	getUser2: {
		request: { method: string; path: string; body?: never };
		responses: { 200: { body: { id: number; name: string; orders: number[] } } };
	};
	[key: string]: {
		request: { method: string; path: string; body?: unknown };
		responses: Record<number, { body?: unknown }>;
	};
}

// Helper functions for creating components with typed adapters
const createHttpMock = (name: string, port: number) =>
	new Server(name, {
		adapter: new HttpAdapter<HttpServiceDef>(),
		listenAddress: { host: "localhost", port },
	});

const createHttpClient = (name: string, port: number) =>
	new Client(name, {
		adapter: new HttpAdapter<HttpServiceDef>(),
		targetAddress: { host: "localhost", port },
	});

const createTcpMock = (name: string, port: number) =>
	new AsyncServer(name, {
		adapter: new TcpAdapter<ContextMessages>(),
		listenAddress: { host: "localhost", port },
	});

const createTcpClient = (name: string, port: number) =>
	new AsyncClient(name, {
		adapter: new TcpAdapter<ContextMessages>(),
		targetAddress: { host: "localhost", port },
	});

describe("Suite 4: Context and State Management", () => {
	// ============================================================================
	// 4.1 Shared Context Between Test Cases
	// ============================================================================
	describe("4.1 Shared Context Between Test Cases", () => {
		it("should persist context across test cases", async () => {
			const backendServer = createHttpMock("backend", 6201);
			const apiClient = createHttpClient("api", 6201);

			const scenario = new TestScenario<TestContext>({
				name: "Context Persistence Test",
				components: [backendServer, apiClient],
			});

			const tc1 = testCase<TestContext>("Store userId in context", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.request("getUser", { method: "GET", path: "/user" });
				backend.onRequest("getUser", { method: "GET", path: "/user" }).mockResponse(() => ({
					status: 200,
					headers: {},
					body: { id: 123, name: "TestUser" },
				}));
				api.onResponse("getUser").assert((response) => {
					test.context.userId = response.id;
					return true;
				});
			});

			const tc2 = testCase<TestContext>("Read userId from context", (test) => {
				test.waitUntil(() => test.context.userId === 123, { timeout: 100 });
			});

			const result = await scenario.run([tc1, tc2]);

			expect(result.passed).toBe(true);
			expect(scenario.getContext().userId).toBe(123);
		});

		it("should accumulate data across multiple test cases", async () => {
			const backendServer = createHttpMock("backend", 6202);
			const apiClient = createHttpClient("api", 6202);

			const scenario = new TestScenario<TestContext>({
				name: "Context Accumulation Test",
				components: [backendServer, apiClient],
			});

			scenario.init((test) => {
				test.context.results = [];
				test.context.requestCount = 0;
			});

			const testCases = [1, 2, 3].map((i) =>
				testCase<TestContext>(`Make request ${i}`, (test) => {
					const api = test.use(apiClient);
					const backend = test.use(backendServer);

					api.request("getData", { method: "GET", path: "/data" });
					backend.onRequest("getData", { method: "GET", path: "/data" }).mockResponse(() => ({
						status: 200,
						headers: {},
						body: { value: Math.random() },
					}));
					api.onResponse("getData").assert((response) => {
						if (test.context.results) {
							test.context.results.push(response);
						}
						test.context.requestCount = (test.context.requestCount || 0) + 1;
						return true;
					});
				}),
			);

			const result = await scenario.run(testCases);

			expect(result.passed).toBe(true);
			expect(scenario.getContext().results).toHaveLength(3);
			expect(scenario.getContext().requestCount).toBe(3);
		});
	});

	// ============================================================================
	// 4.2 Context in Handlers
	// ============================================================================
	describe("4.2 Context in Handlers", () => {
		it("should allow response handlers to read context", async () => {
			const backendServer = createTcpMock("backend", 6203);
			const apiClient = createTcpClient("api", 6203);

			const scenario = new TestScenario<TestContext>({
				name: "Handler Context Read Test",
				components: [backendServer, apiClient],
			});

			let contextTokenInHandler: string | undefined;

			scenario.init((test) => {
				test.context.authToken = "Bearer secret-token-123";
			});

			const tc = testCase<TestContext>("Read context in response handler", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.sendMessage("AuthRequest", { action: "login" });

				backend.onMessage("AuthRequest").mockEvent("AuthRequestResponse", () => ({
					success: true,
				}));

				api.waitEvent("AuthRequestResponse", { timeout: 1000 })
					.assert((payload) => {
						contextTokenInHandler = test.context.authToken;
						return payload.success === true;
					});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(contextTokenInHandler).toBe("Bearer secret-token-123");
		});

		it("should allow response handlers to write to context", async () => {
			const backendServer = createTcpMock("backend", 6204);
			const apiClient = createTcpClient("api", 6204);

			const scenario = new TestScenario<TestContext>({
				name: "Handler Context Write Test",
				components: [backendServer, apiClient],
			});

			scenario.init((test) => {
				test.context.requestCount = 0;
			});

			const tc = testCase<TestContext>("Write to context in response handler", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.sendMessage("CountRequest", { index: 0 });

				backend.onMessage("CountRequest").mockEvent("CountRequestResponse", () => ({
					counted: true,
				}));

				api.waitEvent("CountRequestResponse", { timeout: 1000 })
					.assert((payload) => {
						test.context.requestCount = (test.context.requestCount || 0) + 1;
						return payload.counted === true;
					});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(scenario.getContext().requestCount).toBe(1);
		});
	});

	// ============================================================================
	// 4.3 Response Storage
	// ============================================================================
	describe("4.3 Response Storage", () => {
		it("should store response in context for later assertions", async () => {
			const backendServer = createHttpMock("backend", 6205);
			const apiClient = createHttpClient("api", 6205);

			const scenario = new TestScenario<TestContext>({
				name: "Response Storage Test",
				components: [backendServer, apiClient],
			});

			const tc1 = testCase<TestContext>("Fetch profile", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.request("getProfile", { method: "GET", path: "/profile" });
				backend.onRequest("getProfile", { method: "GET", path: "/profile" }).mockResponse(() => ({
					status: 200,
					headers: {},
					body: { id: 456, name: "John Doe", email: "john@example.com" },
				}));
				api.onResponse("getProfile").assert((response) => {
					test.context.lastResponse = response;
					return true;
				});
			});

			interface ProfileResponse {
				id: number;
				name: string;
				email: string;
			}

			function isProfileResponse(value: unknown): value is ProfileResponse {
				return typeof value === "object" && value !== null && "id" in value && "name" in value && "email" in value;
			}

			const tc2 = testCase<TestContext>("Assert on stored response", (test) => {
				test.waitUntil(() => {
					const response = test.context.lastResponse;
					if (!isProfileResponse(response)) return false;
					return response.id === 456 && response.name === "John Doe" && response.email === "john@example.com";
				}, { timeout: 100 });
			});

			const result = await scenario.run([tc1, tc2]);

			expect(result.passed).toBe(true);
		});

		it("should support complex nested context data", async () => {
			interface ComplexContext extends Record<string, unknown> {
				users: Map<number, { name: string; orders: number[] }>;
				stats: { total: number; success: number; failed: number };
			}

			const backendServer = createHttpMock("backend", 6206);
			const apiClient = createHttpClient("api", 6206);

			const scenario = new TestScenario<ComplexContext>({
				name: "Complex Context Test",
				components: [backendServer, apiClient],
			});

			scenario.init((test) => {
				test.context.users = new Map();
				test.context.stats = { total: 0, success: 0, failed: 0 };
			});

			const tc1 = testCase<ComplexContext>("Fetch user 1", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.request("getUser1", { method: "GET", path: "/users/1" });
				backend.onRequest("getUser1", { method: "GET", path: "/users/1" }).mockResponse(() => ({
					status: 200,
					headers: {},
					body: { id: 1, name: "Alice", orders: [101, 102] },
				}));
				api.onResponse("getUser1").assert((response) => {
					test.context.users.set(response.id, {
						name: response.name,
						orders: response.orders,
					});
					test.context.stats.total++;
					test.context.stats.success++;
					return true;
				});
			});

			const tc2 = testCase<ComplexContext>("Fetch user 2", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.request("getUser2", { method: "GET", path: "/users/2" });
				backend.onRequest("getUser2", { method: "GET", path: "/users/2" }).mockResponse(() => ({
					status: 200,
					headers: {},
					body: { id: 2, name: "Bob", orders: [103] },
				}));
				api.onResponse("getUser2").assert((response) => {
					test.context.users.set(response.id, {
						name: response.name,
						orders: response.orders,
					});
					test.context.stats.total++;
					test.context.stats.success++;
					return true;
				});
			});

			const tc3 = testCase<ComplexContext>("Verify all data", (test) => {
				test.waitUntil(() => {
					return test.context.users.size === 2 &&
						test.context.users.get(1)?.name === "Alice" &&
						test.context.stats.total === 2;
				}, { timeout: 100 });
			});

			const result = await scenario.run([tc1, tc2, tc3]);

			expect(result.passed).toBe(true);
		});
	});

	// ============================================================================
	// 4.4 Context Isolation
	// ============================================================================
	describe("4.4 Context Isolation", () => {
		it("should isolate context between different scenarios", async () => {
			// Create both scenarios upfront to prove they don't share state
			const scenario1 = new TestScenario<TestContext>({
				name: "Scenario 1",
				components: [createHttpMock("backend", 6207), createHttpClient("api", 6207)],
			});

			const scenario2 = new TestScenario<TestContext>({
				name: "Scenario 2",
				components: [createHttpMock("backend", 6208), createHttpClient("api", 6208)],
			});

			// Initialize both scenarios with different values
			scenario1.init((test) => {
				test.context.userId = 100;
				test.context.authToken = "token-scenario-1";
			});

			scenario2.init((test) => {
				test.context.userId = 200;
				test.context.authToken = "token-scenario-2";
			});

			// Run scenario1 and modify its context
			const tc1 = testCase<TestContext>("Verify and modify scenario 1 context", (test) => {
				test.waitUntil(() => {
					// Verify initial value
					if (test.context.userId !== 100) return false;
					// Modify context
					test.context.requestCount = 999;
					return true;
				}, { timeout: 500 });
			});

			const result1 = await scenario1.run(tc1);
			expect(result1.passed).toBe(true);

			// Run scenario2 - should NOT see scenario1's modifications
			const tc2 = testCase<TestContext>("Verify scenario 2 context is isolated", (test) => {
				test.waitUntil(() => {
					// Verify scenario2 has its own values
					if (test.context.userId !== 200) return false;
					if (test.context.authToken !== "token-scenario-2") return false;
					// Verify scenario1's modification is NOT visible
					if (test.context.requestCount !== undefined) return false;
					return true;
				}, { timeout: 500 });
			});

			const result2 = await scenario2.run(tc2);
			expect(result2.passed).toBe(true);

			// Final verification of isolation
			expect(scenario1.getContext().userId).toBe(100);
			expect(scenario1.getContext().requestCount).toBe(999);
			expect(scenario2.getContext().userId).toBe(200);
			expect(scenario2.getContext().requestCount).toBeUndefined();
		});
	});
});
