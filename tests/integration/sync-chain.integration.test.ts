/**
 * Sync Protocol Chain Integration Tests
 *
 * Tests the complete component chain: Client → Proxy → Mock
 * Using sync (HTTP-like) protocol with real HttpAdapter.
 *
 * Note: onResponse() receives SyncResponse<T> with { status, headers, body }.
 */

import { Client, HttpProtocol, type HttpResponse, Server, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";

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

// ============================================================================
// HTTP Service Definition for Type Safety
// ============================================================================

interface ServiceOperations {
	getUsers: {
		request: { method: "GET"; path: "/users"; body?: never };
		response: { code: 200; body: User[] };
	};
	createUser: {
		request: { method: "POST"; path: "/users"; body: CreateUserPayload };
		response: { code: 201; body: User };
	};
	getData: {
		request: { method: "GET"; path: "/api/data"; body?: never; headers?: Record<string, string> };
		response: {
			code: 200;
			body: { proxied?: boolean; headers?: Record<string, string>; value?: number; transformedBy?: string };
		};
	};
	getBlocked: {
		request: { method: "GET"; path: "/blocked"; body?: never };
		response: { code: 200; body: { data: string } } | { code: 403; body: ErrorResponse };
	};
	getOrders: {
		request: { method: "GET"; path: "/orders"; body?: never };
		response: { code: 200; body: { id: number; item: string }[] };
	};
	postOrder: {
		request: { method: "POST"; path: "/orders"; body: { item: string } };
		response: { code: 201; body: { id: number; item: string } };
	};
	deleteUsers: {
		request: { method: "DELETE"; path: "/users"; body?: never };
		response: { code: 200; body: { deleted: boolean } };
	};
	getError: {
		request: { method: "GET"; path: "/error"; body?: never };
		response: { code: 500; body: { error: string; errorCode: string } };
	};
	getUnknown: {
		request: { method: "GET"; path: "/unknown"; body?: never };
		response: { code: 404; body: ErrorResponse };
	};
}

// Port counter for this test file (13xxx range)
let portCounter = 13000;
function getNextPort(): number {
	return portCounter++;
}

// Helper functions for creating HTTP components with typed adapters
const createMockServer = (name: string, port: number) =>
	new Server(name, {
		protocol: new HttpProtocol<ServiceOperations>(),
		listenAddress: { host: "localhost", port },
	});

const createClient = (name: string, port: number) =>
	new Client(name, {
		protocol: new HttpProtocol<ServiceOperations>(),
		targetAddress: { host: "localhost", port },
	});

const createProxyServer = (name: string, listenPort: number, targetPort: number) =>
	new Server(name, {
		protocol: new HttpProtocol<ServiceOperations>(),
		listenAddress: { host: "localhost", port: listenPort },
		targetAddress: { host: "localhost", port: targetPort },
	});

describe("Sync Protocol Chain: Client → Proxy → Mock", () => {
	// ============================================================
	// 1.1 Basic Request Flow
	// ============================================================
	describe("1.1 Basic Request Flow", () => {
		it("should route GET request through proxy to mock and back", async () => {
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backendServer = createMockServer("backend", backendPort);
			const gatewayProxy = createProxyServer("gateway", proxyPort, backendPort);
			const apiClient = createClient("api", proxyPort);

			const scenario = new TestScenario({
				name: "Basic GET Chain Test",
				components: [backendServer, gatewayProxy, apiClient],
			});

			let responseData!: HttpResponse<User[]>;
			let backendCalled = false;
			let receivedMethod: string | undefined;
			let receivedPath: string | undefined;

			const tc = testCase("GET /users through chain", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				// Step 1: Client sends request
				api.request("getUsers", { method: "GET", path: "/users" });

				// Step 2: Mock handles request
				backend.onRequest("getUsers", { method: "GET", path: "/users" }).mockResponse((req) => {
					backendCalled = true;
					receivedMethod = req.method;
					receivedPath = req.path;
					return {
						code: 200,
						body: [
							{ id: 1, name: "Alice" },
							{ id: 2, name: "Bob" },
						],
					};
				});

				// Step 3: Handle response
				api.onResponse("getUsers").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(backendCalled).toBe(true);
			expect(receivedMethod).toBe("GET");
			expect(receivedPath).toBe("/users");
			expect(responseData.code).toBe(200);
			expect(responseData.body).toEqual([
				{ id: 1, name: "Alice" },
				{ id: 2, name: "Bob" },
			]);
		});

		it("should handle POST request with payload", async () => {
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backendServer = createMockServer("backend", backendPort);
			const gatewayProxy = createProxyServer("gateway", proxyPort, backendPort);
			const apiClient = createClient("api", proxyPort);

			const scenario = new TestScenario({
				name: "POST Chain Test",
				components: [backendServer, gatewayProxy, apiClient],
			});

			let receivedPayload: CreateUserPayload | undefined;
			let responseData!: HttpResponse<User>;

			const tc = testCase("POST /users", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				// Step 1: Client sends POST request
				api.request("createUser", {
					method: "POST",
					path: "/users",
					body: { name: "Charlie", email: "charlie@example.com" },
				});

				// Step 2: Mock handles request
				backend.onRequest("createUser", { method: "POST", path: "/users" }).mockResponse((req) => {
					receivedPayload = req.body;
					return { code: 201, body: { id: 3, name: req.body.name, email: req.body.email } };
				});

				// Step 3: Handle response
				api.onResponse("createUser").assert((res) => {
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
			expect(responseData.code).toBe(201);
			expect(responseData.body).toMatchObject({
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
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backendServer = createMockServer("backend", backendPort);
			const gatewayProxy = createProxyServer("gateway", proxyPort, backendPort);
			const apiClient = createClient("api", proxyPort);

			const scenario = new TestScenario({
				name: "Request Transform Test",
				components: [backendServer, gatewayProxy, apiClient],
			});

			let receivedHeaders: Record<string, string> | undefined;

			const tc = testCase("Request with proxy transformation", (test) => {
				const api = test.use(apiClient);
				const gateway = test.use(gatewayProxy);

				// Step 1: Client sends request
				api.request("getData", { method: "GET", path: "/api/data" });

				// Step 2: Proxy intercepts and responds
				gateway.onRequest("getData", { method: "GET", path: "/api/data" }).mockResponse((req) => {
					receivedHeaders = {
						...req.headers,
						"x-proxy-added": "true",
						"x-request-id": "req-12345",
					};
					return { code: 200, body: { proxied: true, headers: receivedHeaders } };
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
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backendServer = createMockServer("backend", backendPort);
			const gatewayProxy = createProxyServer("gateway", proxyPort, backendPort);
			const apiClient = createClient("api", proxyPort);

			const scenario = new TestScenario({
				name: "Response Transform Test",
				components: [backendServer, gatewayProxy, apiClient],
			});

			let responseData:
				| HttpResponse<{ proxied?: boolean; headers?: Record<string, string>; value?: number; transformedBy?: string }>
				| undefined;
			let proxyReceivedRequest = false;
			let backendCalled = false;

			const tc = testCase("Get transformed response", (test) => {
				const api = test.use(apiClient);
				const gateway = test.use(gatewayProxy);
				const backend = test.use(backendServer);

				// Step 1: Client sends request
				api.request("getData", { method: "GET", path: "/api/data" });

				// Step 2: Proxy intercepts and responds
				gateway.onRequest("getData", { method: "GET", path: "/api/data" }).mockResponse((req) => {
					proxyReceivedRequest = true;
					expect(req.method).toBe("GET");
					return { code: 200, body: { value: 100, transformedBy: "proxy" } };
				});

				// Backend should NOT be called since proxy mocks the response
				backend.onRequest("getData", { method: "GET", path: "/api/data" }).mockResponse(() => {
					backendCalled = true;
					return { code: 200, body: { value: 999, transformedBy: "backend" } };
				});

				// Step 3: Handle response
				api.onResponse("getData").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(proxyReceivedRequest).toBe(true);
			expect(backendCalled).toBe(false);
			expect(responseData?.body).toMatchObject({
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
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backendServer = createMockServer("backend", backendPort);
			const gatewayProxy = createProxyServer("gateway", proxyPort, backendPort);
			const apiClient = createClient("api", proxyPort);

			const scenario = new TestScenario({
				name: "Request Block Test",
				components: [backendServer, gatewayProxy, apiClient],
			});

			let backendCalled = false;
			let responseData: HttpResponse<ErrorResponse | { data: string }> | undefined;

			const tc = testCase("Blocked request", (test) => {
				const api = test.use(apiClient);
				const gateway = test.use(gatewayProxy);
				const backend = test.use(backendServer);

				// Step 1: Client sends request
				api.request("getBlocked", { method: "GET", path: "/blocked" });

				// Step 2: Proxy blocks request
				gateway
					.onRequest("getBlocked", { method: "GET", path: "/blocked" })
					.mockResponse(() => ({ code: 403, body: { error: "Access denied by proxy" } }));

				// Backend should NOT be called
				backend.onRequest("getBlocked", { method: "GET", path: "/blocked" }).mockResponse(() => {
					backendCalled = true;
					return { code: 200, body: { data: "secret" } };
				});

				// Step 3: Handle response
				api.onResponse("getBlocked").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(backendCalled).toBe(false);
			expect(responseData?.body).toMatchObject({
				error: "Access denied by proxy",
			});
		});
	});

	// ============================================================
	// 1.5 Multiple Endpoints
	// ============================================================
	describe("1.5 Multiple Endpoints", () => {
		it("should handle multiple endpoints correctly", async () => {
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backendServer = createMockServer("backend", backendPort);
			const gatewayProxy = createProxyServer("gateway", proxyPort, backendPort);
			const apiClient = createClient("api", proxyPort);

			const scenario = new TestScenario({
				name: "Multiple Endpoints Test",
				components: [backendServer, gatewayProxy, apiClient],
			});

			interface MultiEndpointResponses {
				getUsers?: HttpResponse<User[]>;
				getOrders?: HttpResponse<Array<{ id: number; item: string }>>;
				postOrder?: HttpResponse<{ id: number; item: string }>;
				deleteUsers?: HttpResponse<{ deleted: boolean }>;
			}
			const responses: MultiEndpointResponses = {};

			const tc = testCase("Multiple endpoint requests", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				// Requests
				api.request("getUsers", { method: "GET", path: "/users" });
				api.request("getOrders", { method: "GET", path: "/orders" });
				api.request("postOrder", { method: "POST", path: "/orders", body: { item: "Gadget" } });
				api.request("deleteUsers", { method: "DELETE", path: "/users" });

				// Mock handlers
				backend
					.onRequest("getUsers", { method: "GET", path: "/users" })
					.mockResponse(() => ({ code: 200, body: [{ id: 1, name: "Alice" }] }));

				backend
					.onRequest("getOrders", { method: "GET", path: "/orders" })
					.mockResponse(() => ({ code: 200, body: [{ id: 101, item: "Widget" }] }));

				backend
					.onRequest("postOrder", { method: "POST", path: "/orders" })
					.mockResponse(() => ({ code: 201, body: { id: 102, item: "Gadget" } }));

				backend
					.onRequest("deleteUsers", { method: "DELETE", path: "/users" })
					.mockResponse(() => ({ code: 200, body: { deleted: true } }));

				// Response handlers
				api.onResponse("getUsers").assert((res) => {
					responses.getUsers = res;
					return true;
				});

				api.onResponse("getOrders").assert((res) => {
					responses.getOrders = res;
					return true;
				});

				api.onResponse("postOrder").assert((res) => {
					responses.postOrder = res;
					return true;
				});

				api.onResponse("deleteUsers").assert((res) => {
					responses.deleteUsers = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(responses.getUsers?.body).toEqual([{ id: 1, name: "Alice" }]);
			expect(responses.getOrders?.body).toEqual([{ id: 101, item: "Widget" }]);
			expect(responses.postOrder?.body).toMatchObject({ id: 102, item: "Gadget" });
			expect(responses.deleteUsers?.body).toMatchObject({ deleted: true });
		});
	});

	// ============================================================
	// 1.6 Error Handling
	// ============================================================
	describe("1.6 Error Handling", () => {
		it("should propagate mock errors through proxy to client", async () => {
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backendServer = createMockServer("backend", backendPort);
			const gatewayProxy = createProxyServer("gateway", proxyPort, backendPort);
			const apiClient = createClient("api", proxyPort);

			const scenario = new TestScenario({
				name: "Error Propagation Test",
				components: [backendServer, gatewayProxy, apiClient],
			});

			let responseData!: HttpResponse<{ error: string; errorCode: string }>;
			let backendReceivedRequest = false;
			let receivedPath: string | undefined;

			const tc = testCase("Error response", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				// Step 1: Client sends request
				api.request("getError", { method: "GET", path: "/error" });

				// Step 2: Mock handles with error
				backend.onRequest("getError", { method: "GET", path: "/error" }).mockResponse((req) => {
					backendReceivedRequest = true;
					receivedPath = req.path;
					return { code: 500, body: { error: "Internal server error", errorCode: "ERR_INTERNAL" } };
				});

				// Step 3: Handle response
				api.onResponse("getError").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(backendReceivedRequest).toBe(true);
			expect(receivedPath).toBe("/error");
			expect(responseData.code).toBe(500);
			expect(responseData.body).toMatchObject({
				error: "Internal server error",
				errorCode: "ERR_INTERNAL",
			});
		});

		it("should handle 404 for unregistered endpoints", async () => {
			// Simplified test: client directly to mock server (no proxy)
			const backendPort = getNextPort();
			const backendServer = createMockServer("backend", backendPort);
			const apiClient = new Client("api", {
				protocol: new HttpProtocol<ServiceOperations>(),
				targetAddress: { host: "localhost", port: backendPort },
			});

			const scenario = new TestScenario({
				name: "404 Test",
				components: [backendServer, apiClient],
			});

			let responseData!: HttpResponse<ErrorResponse>;

			const tc = testCase("Request to unknown endpoint", (test) => {
				const api = test.use(apiClient);

				// Step 1: Client sends request to unknown endpoint
				api.request("getUnknown", { method: "GET", path: "/unknown" });

				// Step 2: Handle response
				api.onResponse("getUnknown").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			// The 404 comes from the backend mock server (no handler registered)
			expect(responseData.code).toBe(404);
			expect(responseData.body).toMatchObject({
				error: "Not Found",
			});
		});
	});
});
