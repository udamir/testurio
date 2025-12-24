/**
 * Sync Protocol Chain Integration Tests
 *
 * Tests the complete component chain: Client → Proxy → Mock
 * Using sync (HTTP-like) protocol with real HttpAdapter.
 *
 * Note: HttpAdapter.request() returns the response body directly,
 * not the full HttpResponse object with status/headers.
 */

import { describe, expect, it } from "vitest";
import { TestScenario, testCase, Server, Client, HttpAdapter } from "testurio";
import type { HttpRequest } from "testurio";

// ============================================================================
// Response Type Definitions
// ============================================================================

interface User {
	id: number;
	name: string;
	email?: string;
}

interface CreateUserPayload {
	name: string;
	email: string;
}

interface ErrorResponse {
	error: string;
	code?: number;
}

// Helper functions for creating HTTP components
const createMockServer = (name: string, port: number) =>
	new Server(name, {
		adapter: new HttpAdapter(),
		listenAddress: { host: "localhost", port },
	});

const createClient = (name: string, port: number) =>
	new Client(name, {
		adapter: new HttpAdapter(),
		targetAddress: { host: "localhost", port },
	});

const createProxyServer = (name: string, listenPort: number, targetPort: number) =>
	new Server(name, {
		adapter: new HttpAdapter(),
		listenAddress: { host: "localhost", port: listenPort },
		targetAddress: { host: "localhost", port: targetPort },
	});

describe("Sync Protocol Chain: Client → Proxy → Mock", () => {
	// ============================================================
	// 1.1 Basic Request Flow
	// ============================================================
	describe("1.1 Basic Request Flow", () => {
		it("should route GET request through proxy to mock and back", async () => {
			const scenario = new TestScenario({
				name: "Basic GET Chain Test",
				components: [
					createMockServer("backend", 3102),
					createProxyServer("gateway", 3101, 3102),
					createClient("api", 3101),
				],
			});

			let responseData!: User[];
			let backendCalled = false;
			let receivedMethod: string | undefined;
			let receivedPath: string | undefined;

			const tc = testCase("GET /users through chain", (test) => {
				const api = test.client("api");
				const backend = test.server("backend");

				// Step 1: Client sends request
				api.request("getUsers", { method: "GET", path: "/users" });

				// Step 2: Mock handles request
				backend.onRequest<HttpRequest>("getUsers", { method: "GET", path: "/users" }).mockResponse((req) => {
					backendCalled = true;
					receivedMethod = req.method;
					receivedPath = req.path;
					return {
						status: 200,
						headers: {},
						body: [
							{ id: 1, name: "Alice" },
							{ id: 2, name: "Bob" },
						],
					};
				});

				// Step 3: Handle response
				api.onResponse<User[]>("getUsers").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(backendCalled).toBe(true);
			expect(receivedMethod).toBe("GET");
			expect(receivedPath).toBe("/users");
			expect(responseData).toEqual([
				{ id: 1, name: "Alice" },
				{ id: 2, name: "Bob" },
			]);
		});

		it("should handle POST request with payload", async () => {
			const scenario = new TestScenario({
				name: "POST Chain Test",
				components: [
					createMockServer("backend", 3102),
					createProxyServer("gateway", 3101, 3102),
					createClient("api", 3101),
				],
			});

			let receivedPayload: CreateUserPayload | undefined;
			let responseData!: User;

			const tc = testCase("POST /users", (test) => {
				const api = test.client("api");
				const backend = test.server("backend");

				// Step 1: Client sends POST request
				api.request("createUser", {
					method: "POST",
					path: "/users",
					payload: { name: "Charlie", email: "charlie@example.com" },
				});

				// Step 2: Mock handles request
				backend.onRequest<HttpRequest<CreateUserPayload>>("createUser", { method: "POST", path: "/users" }).mockResponse((req) => {
					receivedPayload = req.payload;
					return {
						test: "test",
						status: 200,
						headers: {},
						body: { id: 3, name: req.payload?.name, email: req.payload?.email },
					};
				});

				// Step 3: Handle response
				api.onResponse<User>("createUser").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(receivedPayload).toEqual({
				name: "Charlie",
				email: "charlie@example.com",
			});
			expect(responseData).toMatchObject({
				id: 3,
				name: "Charlie",
			});
		});
	});

	// ============================================================
	// 1.2 Request Transformation
	// ============================================================
	describe("1.2 Request Transformation", () => {
		it("should allow proxy to intercept and transform request", async () => {
			const scenario = new TestScenario({
				name: "Request Transform Test",
				components: [
					createMockServer("backend", 3102),
					createProxyServer("gateway", 3101, 3102),
					createClient("api", 3101),
				],
			});

			let receivedHeaders: Record<string, string> | undefined;

			const tc = testCase("Request with proxy transformation", (test) => {
				const api = test.client("api");
				const gateway = test.server("gateway");

				// Step 1: Client sends request
				api.request("getData", { method: "GET", path: "/api/data" });

				// Step 2: Proxy intercepts and responds
				gateway.onRequest<HttpRequest>("getData", { method: "GET", path: "/api/data" }).mockResponse((req) => {
					receivedHeaders = {
						...req.headers,
						"x-proxy-added": "true",
						"x-request-id": "req-12345",
					};
					return {
						status: 200,
						headers: {},
						body: { proxied: true, headers: receivedHeaders },
					};
				});

				// Step 3: Handle response
				api.onResponse("getData");
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(receivedHeaders).toMatchObject({
				"x-proxy-added": "true",
				"x-request-id": "req-12345",
			});
		});
	});

	// ============================================================
	// 1.3 Response Transformation
	// ============================================================
	describe("1.3 Response Transformation", () => {
		it("should allow proxy to modify response", async () => {
			const scenario = new TestScenario({
				name: "Response Transform Test",
				components: [
					createMockServer("backend", 3102),
					createProxyServer("gateway", 3101, 3102),
					createClient("api", 3101),
				],
			});

			let responseData!: { value: number; transformedBy: string };
			let proxyReceivedRequest = false;
			let backendCalled = false;

			const tc = testCase("Get transformed response", (test) => {
				const api = test.client("api");
				const gateway = test.server("gateway");
				const backend = test.server("backend");

				// Step 1: Client sends request
				api.request("getData", { method: "GET", path: "/data" });

				// Step 2: Proxy intercepts and responds
				gateway.onRequest<HttpRequest>("getData", { method: "GET", path: "/data" }).mockResponse((req) => {
					proxyReceivedRequest = true;
					expect(req.method).toBe("GET");
					return {
						status: 200,
						headers: {},
						body: { value: 100, transformedBy: "proxy" },
					};
				});

				// Backend should NOT be called since proxy mocks the response
				backend.onRequest("getData", { method: "GET", path: "/data" }).mockResponse(() => {
					backendCalled = true;
					return {
						status: 200,
						headers: {},
						body: { value: 999, transformedBy: "backend" },
					};
				});

				// Step 3: Handle response
				api.onResponse<{ value: number; transformedBy: string }>("getData").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(proxyReceivedRequest).toBe(true);
			expect(backendCalled).toBe(false);
			expect(responseData).toMatchObject({
				value: 100,
				transformedBy: "proxy",
			});
		});
	});

	// ============================================================
	// 1.4 Request Interception (Drop)
	// ============================================================
	describe("1.4 Request Interception (Drop)", () => {
		it("should allow proxy to block requests", async () => {
			const scenario = new TestScenario({
				name: "Request Block Test",
				components: [
					createMockServer("backend", 3102),
					createProxyServer("gateway", 3101, 3102),
					createClient("api", 3101),
				],
			});

			let backendCalled = false;
			let responseData!: ErrorResponse;

			const tc = testCase("Blocked request", (test) => {
				const api = test.client("api");
				const gateway = test.server("gateway");
				const backend = test.server("backend");

				// Step 1: Client sends request
				api.request("getBlocked", { method: "GET", path: "/blocked" });

				// Step 2: Proxy blocks request
				gateway.onRequest("getBlocked", { method: "GET", path: "/blocked" }).mockResponse(() => ({
					status: 403,
					headers: {},
					body: { error: "Access denied by proxy" },
				}));

				// Backend should NOT be called
				backend.onRequest("getBlocked", { method: "GET", path: "/blocked" }).mockResponse(() => {
					backendCalled = true;
					return {
						status: 200,
						headers: {},
						body: { data: "secret" },
					};
				});

				// Step 3: Handle response
				api.onResponse<ErrorResponse>("getBlocked").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(backendCalled).toBe(false);
			expect(responseData).toMatchObject({
				error: "Access denied by proxy",
			});
		});
	});

	// ============================================================
	// 1.5 Multiple Endpoints
	// ============================================================
	describe("1.5 Multiple Endpoints", () => {
		it("should handle multiple endpoints correctly", async () => {
			const scenario = new TestScenario({
				name: "Multiple Endpoints Test",
				components: [
					createMockServer("backend", 3102),
					createProxyServer("gateway", 3101, 3102),
					createClient("api", 3101),
				],
			});

			interface MultiEndpointResponses {
				getUsers?: User[];
				getOrders?: Array<{ id: number; item: string }>;
				postOrder?: { id: number; item: string };
				deleteUsers?: { deleted: boolean };
			}
			const responses: MultiEndpointResponses = {};

			const tc = testCase("Multiple endpoint requests", (test) => {
				const api = test.client("api");
				const backend = test.server("backend");

				// Requests
				api.request("getUsers", { method: "GET", path: "/users" });
				api.request("getOrders", { method: "GET", path: "/orders" });
				api.request("postOrder", { method: "POST", path: "/orders", payload: { item: "Gadget" } });
				api.request("deleteUsers", { method: "DELETE", path: "/users" });

				// Mock handlers
				backend.onRequest("getUsers", { method: "GET", path: "/users" }).mockResponse(() => ({
					status: 200,
					headers: {},
					body: [{ id: 1, name: "Alice" }],
				}));

				backend.onRequest("getOrders", { method: "GET", path: "/orders" }).mockResponse(() => ({
					status: 200,
					headers: {},
					body: [{ id: 101, item: "Widget" }],
				}));

				backend.onRequest("postOrder", { method: "POST", path: "/orders" }).mockResponse(() => ({
					status: 200,
					headers: {},
					body: { id: 102, item: "Gadget" },
				}));

				backend.onRequest("deleteUsers", { method: "DELETE", path: "/users" }).mockResponse(() => ({
					status: 200,
					headers: {},
					body: { deleted: true },
				}));

				// Response handlers
				api.onResponse<User[]>("getUsers").assert((res) => {
					responses.getUsers = res;
					return true;
				});

				api.onResponse<Array<{ id: number; item: string }>>("getOrders").assert((res) => {
					responses.getOrders = res;
					return true;
				});

				api.onResponse<{ id: number; item: string }>("postOrder").assert((res) => {
					responses.postOrder = res;
					return true;
				});

				api.onResponse<{ deleted: boolean }>("deleteUsers").assert((res) => {
					responses.deleteUsers = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(responses.getUsers).toEqual([{ id: 1, name: "Alice" }]);
			expect(responses.getOrders).toEqual([{ id: 101, item: "Widget" }]);
			expect(responses.postOrder).toMatchObject({ id: 102, item: "Gadget" });
			expect(responses.deleteUsers).toMatchObject({ deleted: true });
		});
	});

	// ============================================================
	// 1.6 Error Handling
	// ============================================================
	describe("1.6 Error Handling", () => {
		it("should propagate mock errors through proxy to client", async () => {
			const scenario = new TestScenario({
				name: "Error Propagation Test",
				components: [
					createMockServer("backend", 3102),
					createProxyServer("gateway", 3101, 3102),
					createClient("api", 3101),
				],
			});

			let responseData!: { error: string; code: string };
			let backendReceivedRequest = false;
			let receivedPath: string | undefined;

			const tc = testCase("Error response", (test) => {
				const api = test.client("api");
				const backend = test.server("backend");

				// Step 1: Client sends request
				api.request("getError", { method: "GET", path: "/error" });

				// Step 2: Mock handles with error
				backend.onRequest<HttpRequest>("getError", { method: "GET", path: "/error" }).mockResponse((req) => {
					backendReceivedRequest = true;
					receivedPath = req.path;
					return {
						status: 500,
						headers: {},
						body: { error: "Internal server error", code: "ERR_INTERNAL" },
					};
				});

				// Step 3: Handle response
				api.onResponse<{ error: string; code: string }>("getError").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(backendReceivedRequest).toBe(true);
			expect(receivedPath).toBe("/error");
			expect(responseData).toMatchObject({
				error: "Internal server error",
				code: "ERR_INTERNAL",
			});
		});

		it("should handle 404 for unregistered endpoints", async () => {
			const scenario = new TestScenario({
				name: "404 Test",
				components: [
					createMockServer("backend", 3102),
					createProxyServer("gateway", 3101, 3102),
					createClient("api", 3101),
				],
			});

			let responseData!: ErrorResponse;

			const tc = testCase("Request to unknown endpoint", (test) => {
				const api = test.client("api");

				// Step 1: Client sends request to unknown endpoint
				api.request("getUnknown", { method: "GET", path: "/unknown" });

				// Step 2: Handle response
				api.onResponse<ErrorResponse>("getUnknown").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(responseData).toMatchObject({
				error: "No handler for GET /unknown",
			});
		});
	});
});
