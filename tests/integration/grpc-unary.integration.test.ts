/**
 * gRPC Unary Protocol Chain Integration Tests
 *
 * Tests the complete component chain: Client → Proxy → Mock
 * Using sync (unary) gRPC protocol with real connections.
 */

import { describe, expect, it } from "vitest";
import { Server, Client, TestScenario, testCase } from "testurio";
import { GrpcUnaryAdapter } from "@testurio/adapter-grpc";

// ============================================================================
// Type Definitions
// ============================================================================

interface GetUserPayload {
	user_id: number;
}

interface GetUserResponse {
	user_id: number;
	name: string;
	email: string;
}

interface CreateOrderPayload {
	customer_id: string;
	items: Array<{ product_id: string; quantity: number; price: number }>;
	shipping_address: Record<string, string>;
}

interface CreateOrderResponse {
	order_id: string;
	status: string;
	total: number;
}

interface CachedDataResponse {
	key: string;
	value: string;
	cached: boolean;
}

interface ErrorResponse {
	error: string;
	code: string;
}

// Proto file path for test service
const TEST_PROTO = "tests/proto/test-service.proto";
const TEST_SERVICE = "test.v1.TestService";

// Helper functions for creating components
const createMockServer = (name: string, port: number) =>
	new Server(name, {
		adapter: new GrpcUnaryAdapter({ schema: TEST_PROTO }),
		listenAddress: { host: "127.0.0.1", port },
	});

const createClient = (name: string, port: number) =>
	new Client(name, {
		adapter: new GrpcUnaryAdapter({ schema: TEST_PROTO, serviceName: TEST_SERVICE }),
		targetAddress: { host: "127.0.0.1", port },
	});

const createProxyServer = (name: string, listenPort: number, targetPort: number) =>
	new Server(name, {
		adapter: new GrpcUnaryAdapter({ schema: TEST_PROTO }),
		listenAddress: { host: "127.0.0.1", port: listenPort },
		targetAddress: { host: "127.0.0.1", port: targetPort },
	});

describe("gRPC Unary Protocol Chain: Client → Mock", () => {
	// ============================================================
	// 3.1 Basic Unary Request Flow
	// ============================================================
	describe("3.1 Basic Unary Request Flow", () => {
		it("should route unary request to mock and back", async () => {
			const scenario = new TestScenario({
				name: "Basic gRPC Unary Chain Test",
				components: [createMockServer("backend", 5102), createClient("api", 5102)],
			});

			let responseData!: GetUserResponse;
			let receivedPayload: GetUserPayload | undefined;

			const tc = testCase("GetUser through chain", (test) => {
				const api = test.client("api");
				const backend = test.server("backend");

				// Step 1: Client sends gRPC request
				api.request<GetUserPayload>("GetUser", { payload: { user_id: 42 } });

				// Step 2: Mock handles request
				backend.onRequest<GetUserPayload>("GetUser").mockResponse((req) => {
					receivedPayload = req.payload;
					return {
						status: 200,
						headers: {},
						body: {
							user_id: req.payload?.user_id ?? 0,
							name: "John Doe",
							email: "john@example.com",
						},
					};
				});

				// Step 3: Handle response
				api.onResponse<GetUserResponse>("GetUser").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(receivedPayload).toMatchObject({ user_id: 42 });
			expect(responseData).toMatchObject({
				user_id: 42,
				name: "John Doe",
				email: "john@example.com",
			});
		});

		it("should handle unary request with complex payload", async () => {
			const scenario = new TestScenario({
				name: "Complex Payload gRPC Test",
				components: [createMockServer("backend", 5112), createClient("api", 5112)],
			});

			let receivedPayload: CreateOrderPayload | undefined;
			let responseData!: CreateOrderResponse;

			const tc = testCase("CreateOrder with complex payload", (test) => {
				const api = test.client("api");
				const backend = test.server("backend");

				// Step 1: Client sends gRPC request
				api.request<CreateOrderPayload>("CreateOrder", {
					payload: {
						customer_id: "CUST-001",
						items: [
							{ product_id: "PROD-1", quantity: 2, price: 29.99 },
							{ product_id: "PROD-2", quantity: 1, price: 49.99 },
						],
						shipping_address: {
							street: "123 Main St",
							city: "New York",
							zip: "10001",
						},
					},
				});

				// Step 2: Mock handles request
				backend.onRequest<CreateOrderPayload>("CreateOrder").mockResponse((req) => {
					receivedPayload = req.payload;
					return {
						status: 200,
						headers: {},
						body: {
							order_id: "ORD-12345",
							status: "confirmed",
							total: 109.97,
						},
					};
				});

				// Step 3: Handle response
				api.onResponse<CreateOrderResponse>("CreateOrder").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(receivedPayload).toMatchObject({
				customer_id: "CUST-001",
				items: expect.arrayContaining([
					expect.objectContaining({ product_id: "PROD-1" }),
				]),
			});
			expect(responseData).toMatchObject({
				order_id: "ORD-12345",
				status: "confirmed",
			});
		});
	});

	// ============================================================
	// 3.2 Direct Mock Response
	// ============================================================
	describe("3.2 Direct Mock Response", () => {
		it("should allow mock to respond directly", async () => {
			const scenario = new TestScenario({
				name: "Direct Mock gRPC Test",
				components: [createMockServer("backend", 5122), createClient("api", 5122)],
			});

			let responseData!: CachedDataResponse;
			let receivedKey: string | undefined;

			const tc = testCase("Mock responds directly", (test) => {
				const api = test.client("api");
				const backend = test.server("backend");

				// Step 1: Client sends request
				api.request<{ key: string }>("GetCachedData", { payload: { key: "user:123" } });

				// Step 2: Mock handles
				backend.onRequest<{ key: string }>("GetCachedData").mockResponse((req) => {
					receivedKey = req.payload?.key;
					return {
						status: 200,
						headers: {},
						body: { key: req.payload?.key ?? "", value: "cached-value", from_cache: true },
					};
				});

				// Step 3: Handle response
				api.onResponse<CachedDataResponse>("GetCachedData").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(receivedKey).toBe("user:123");
			expect(responseData).toMatchObject({
				key: "user:123",
				value: "cached-value",
				from_cache: true,
			});
		});
	});

	// ============================================================
	// 3.3 Error Handling
	// ============================================================
	describe("3.3 Error Handling", () => {
		it("should propagate gRPC errors", async () => {
			const scenario = new TestScenario({
				name: "gRPC Error Propagation Test",
				components: [createMockServer("backend", 5132), createClient("api", 5132)],
			});

			let responseData!: ErrorResponse;
			let receivedKey: string | undefined;

			const tc = testCase("Error response from backend", (test) => {
				const api = test.client("api");
				const backend = test.server("backend");

				// Step 1: Client sends request
				api.request<{ key: string }>("GetNotFound", { payload: { key: "nonexistent" } });

				// Step 2: Mock handles
				backend.onRequest<{ key: string }>("GetNotFound").mockResponse((req) => {
					receivedKey = req.payload?.key;
					return {
						status: 404,
						headers: {},
						body: { error: "Resource not found", status: 404 },
					};
				});

				// Step 3: Handle response
				api.onResponse<ErrorResponse>("GetNotFound").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(receivedKey).toBe("nonexistent");
			expect(responseData).toMatchObject({
				error: "Resource not found",
				status: 404,
			});
		});
	});

	// ============================================================
	// 3.4 Multiple Methods
	// ============================================================
	describe("3.4 Multiple Methods", () => {
		it("should handle multiple gRPC methods correctly", async () => {
			const scenario = new TestScenario({
				name: "Multiple gRPC Methods Test",
				components: [createMockServer("backend", 5142), createClient("api", 5142)],
			});

			const responses: Record<string, unknown> = {};

			const tc = testCase("Multiple method calls", (test) => {
				const api = test.client("api");
				const backend = test.server("backend");

				// Requests
				api.request("GetUser", { payload: { user_id: 1 } });
				api.request("ListUsers", { payload: { limit: 10 } });
				api.request("DeleteUser", { payload: { user_id: 1 } });

				// Mock handlers
				backend.onRequest("GetUser").mockResponse(() => ({
					status: 200,
					headers: {},
					body: { user_id: 1, name: "Alice" },
				}));

				backend.onRequest("ListUsers").mockResponse(() => ({
					status: 200,
					headers: {},
					body: { users: [{ id: 1 }, { id: 2 }], total: 2 },
				}));

				backend.onRequest("DeleteUser").mockResponse(() => ({
					status: 200,
					headers: {},
					body: { deleted: true },
				}));

				// Response handlers
				api.onResponse("GetUser").assert((res) => {
					responses.getUser = res;
					return true;
				});

				api.onResponse("ListUsers").assert((res) => {
					responses.listUsers = res;
					return true;
				});

				api.onResponse("DeleteUser").assert((res) => {
					responses.deleteUser = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(responses.getUser).toMatchObject({ user_id: 1, name: "Alice" });
			expect(responses.listUsers).toMatchObject({ total: 2 });
			expect(responses.deleteUser).toMatchObject({ deleted: true });
		});
	});
});

describe("gRPC Unary Protocol Chain: Client → Proxy → Mock", () => {
	// ============================================================
	// 3.5 Proxy Forwarding
	// ============================================================
	describe("3.5 Proxy Forwarding", () => {
		it("should forward unary request through proxy to backend", async () => {
			const scenario = new TestScenario({
				name: "gRPC Unary Proxy Chain Test",
				components: [
					createMockServer("backend", 5152),
					createProxyServer("gateway", 5153, 5152),
					createClient("api", 5153),
				],
			});

			let receivedAtBackend: GetUserPayload | undefined;
			let responseData!: GetUserResponse;
			let proxyReceivedPayload: GetUserPayload | undefined;

			const tc = testCase("Forward request through proxy", (test) => {
				const api = test.client("api");
				const gateway = test.server("gateway");
				const backend = test.server("backend");

				// Step 1: Client sends request
				api.request<GetUserPayload>("GetUser", { payload: { user_id: 100 } });

				// Step 2: Proxy captures and forwards
				gateway.onRequest<GetUserPayload>("GetUser").proxy((req) => {
					proxyReceivedPayload = req.payload;
					return req;
				});

				// Step 3: Mock handles request
				backend.onRequest<GetUserPayload>("GetUser").mockResponse((req) => {
					receivedAtBackend = req.payload;
					return {
						status: 200,
						headers: {},
						body: {
							user_id: req.payload?.user_id ?? 0,
							name: "Proxied User",
							email: "proxied@example.com",
						},
					};
				});

				// Step 4: Handle response
				api.onResponse<GetUserResponse>("GetUser").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(proxyReceivedPayload).toMatchObject({ user_id: 100 });
			expect(receivedAtBackend).toMatchObject({ user_id: 100 });
			expect(responseData).toMatchObject({
				user_id: 100,
				name: "Proxied User",
			});
		});

		it("should allow proxy to transform request before forwarding", async () => {
			const scenario = new TestScenario({
				name: "gRPC Proxy Transform Test",
				components: [
					createMockServer("backend", 5154),
					createProxyServer("gateway", 5155, 5154),
					createClient("api", 5155),
				],
			});

			let receivedAtBackend: CreateOrderPayload | undefined;
			let responseData!: CreateOrderResponse;

			const tc = testCase("Proxy transforms request", (test) => {
				const api = test.client("api");
				const gateway = test.server("gateway");
				const backend = test.server("backend");

				// Step 1: Client sends request
				api.request<CreateOrderPayload>("CreateOrder", {
					payload: { customer_id: "ORD-001", items: [], shipping_address: {} },
				});

				// Step 2: Proxy intercepts and responds
				gateway.onRequest<CreateOrderPayload>("CreateOrder").mockResponse((req) => ({
					status: 200,
					headers: {},
					body: {
						order_id: req.payload?.customer_id ?? "",
						status: "created",
						total: 100,
					},
				}));

				// Backend should NOT be called
				backend.onRequest<CreateOrderPayload>("CreateOrder").mockResponse((req) => {
					receivedAtBackend = req.payload;
					return {
						status: 200,
						headers: {},
						body: { status: "created", order_id: "ORD-001", total: 0 },
					};
				});

				// Step 3: Handle response
				api.onResponse<CreateOrderResponse>("CreateOrder").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(receivedAtBackend).toBeUndefined();
			expect(responseData).toMatchObject({
				order_id: "ORD-001",
				status: "created",
			});
		});

		it("should allow proxy to block requests", async () => {
			const scenario = new TestScenario({
				name: "gRPC Proxy Block Test",
				components: [
					createMockServer("backend", 5156),
					createProxyServer("gateway", 5157, 5156),
					createClient("api", 5157),
				],
			});

			let responseData!: ErrorResponse;
			let backendCalled = false;

			const tc = testCase("Proxy blocks unauthorized request", (test) => {
				const api = test.client("api");
				const gateway = test.server("gateway");
				const backend = test.server("backend");

				// Step 1: Client sends request
				api.request<{ key: string }>("GetSecretData", { payload: { key: "secret-key" } });

				// Step 2: Proxy blocks
				gateway.onRequest("GetSecretData").mockResponse(() => ({
					status: 403,
					headers: {},
					body: { error: "Access denied", status: 403 },
				}));

				// Backend should NOT be called
				backend.onRequest("GetSecretData").mockResponse(() => {
					backendCalled = true;
					return {
						status: 200,
						headers: {},
						body: { value: "top-secret-value", status: 200 },
					};
				});

				// Step 3: Handle response
				api.onResponse<ErrorResponse>("GetSecretData").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(backendCalled).toBe(false);
			expect(responseData).toMatchObject({
				error: "Access denied",
				status: 403,
			});
		});
	});

	// ============================================================
	// 3.6 gRPC Metadata (Auth)
	// ============================================================
	describe("3.6 gRPC Metadata (Auth)", () => {
		it("should pass request through proxy to backend with metadata", async () => {
			const scenario = new TestScenario({
				name: "gRPC Metadata Proxy Test",
				components: [
					createMockServer("backend", 5158),
					createProxyServer("gateway", 5159, 5158),
					createClient("api", 5159),
				],
			});

			let responseData!: GetUserResponse;
			let receivedPayload: GetUserPayload | undefined;
			let proxyReceivedPayload: GetUserPayload | undefined;

			const tc = testCase("Request with auth metadata", (test) => {
				const api = test.client("api");
				const gateway = test.server("gateway");
				const backend = test.server("backend");

				// Step 1: Client sends request with metadata
				api.request<GetUserPayload>("GetUser", {
					payload: { user_id: 42 },
					metadata: { authorization: "Bearer test-token-123" },
				});

				// Step 2: Proxy forwards
				gateway.onRequest<GetUserPayload>("GetUser").proxy((req) => {
					proxyReceivedPayload = req.payload;
					return req;
				});

				// Step 3: Mock handles
				backend.onRequest<GetUserPayload>("GetUser").mockResponse((req) => {
					receivedPayload = req.payload;
					return {
						status: 200,
						headers: {},
						body: {
							user_id: req.payload?.user_id ?? 0,
							name: "Authenticated User",
							email: "auth@example.com",
						},
					};
				});

				// Step 4: Handle response
				api.onResponse<GetUserResponse>("GetUser").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(proxyReceivedPayload).toMatchObject({ user_id: 42 });
			expect(receivedPayload).toMatchObject({ user_id: 42 });
			expect(responseData).toMatchObject({
				user_id: 42,
				name: "Authenticated User",
			});
		});
	});

	// ============================================================
	// 3.7 gRPC Error Responses
	// ============================================================
	describe("3.7 gRPC Error Responses", () => {
		it("should propagate error response through proxy", async () => {
			const scenario = new TestScenario({
				name: "gRPC Error Response Proxy Test",
				components: [
					createMockServer("backend", 5160),
					createProxyServer("gateway", 5161, 5160),
					createClient("api", 5161),
				],
			});

			let responseData!: ErrorResponse;

			const tc = testCase("Request returns error through proxy", (test) => {
				const api = test.client("api");
				const backend = test.server("backend");

				// Step 1: Client sends request
				api.request<{ key: string }>("GetNotFound", { payload: { key: "nonexistent" } });

				// Step 2: Mock handles
				backend.onRequest("GetNotFound").mockResponse(() => ({
					status: 200,
					headers: {},
					body: {
						code: "404",
						error: "Resource not found",
					},
				}));

				// Step 3: Handle response
				api.onResponse<ErrorResponse>("GetNotFound").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(responseData).toMatchObject({
				code: "404",
				error: "Resource not found",
			});
		});
	});
});
