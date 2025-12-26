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
	from_cache: boolean;
}

interface ErrorResponse {
	error: string;
	status: number;
}

// Service definition for type-safe gRPC calls
interface TestService {
	GetUser: { request: GetUserPayload; response: GetUserResponse };
	CreateOrder: { request: CreateOrderPayload; response: CreateOrderResponse };
	GetCachedData: { request: { key: string }; response: CachedDataResponse };
	GetNotFound: { request: { key: string }; response: ErrorResponse };
	GetSecretData: { request: { key: string }; response: { success: { value: string } } | { error: { message: string } } };
	ListUsers: { request: { limit: number }; response: { users: Array<{ id: number }>; total: number } };
	DeleteUser: { request: { user_id: number }; response: { deleted: boolean } };
}

// Proto file path for test service
const TEST_PROTO = "tests/proto/test-service.proto";
const TEST_SERVICE = "test.v1.TestService";

// Helper functions for creating components with typed adapters
const createMockServer = (name: string, port: number) =>
	new Server(name, {
		adapter: new GrpcUnaryAdapter<TestService>({ schema: TEST_PROTO }),
		listenAddress: { host: "127.0.0.1", port },
	});

const createClient = (name: string, port: number) =>
	new Client(name, {
		adapter: new GrpcUnaryAdapter<TestService>({ schema: TEST_PROTO, serviceName: TEST_SERVICE }),
		targetAddress: { host: "127.0.0.1", port },
	});

const createProxyServer = (name: string, listenPort: number, targetPort: number) =>
	new Server(name, {
		adapter: new GrpcUnaryAdapter<TestService>({ schema: TEST_PROTO }),
		listenAddress: { host: "127.0.0.1", port: listenPort },
		targetAddress: { host: "127.0.0.1", port: targetPort },
	});

describe("gRPC Unary Protocol Chain: Client → Mock", () => {
	// ============================================================
	// 3.1 Basic Unary Request Flow
	// ============================================================
	describe("3.1 Basic Unary Request Flow", () => {
		it("should route unary request to mock and back", async () => {
			const backendServer = createMockServer("backend", 5102);
			const apiClient = createClient("api", 5102);

			const scenario = new TestScenario({
				name: "Basic gRPC Unary Chain Test",
				components: [backendServer, apiClient],
			});

			let responseData!: GetUserResponse;
			let receivedPayload: GetUserPayload | undefined;

			const tc = testCase("GetUser through chain", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				// Step 1: Client sends gRPC request (type-safe via adapter generic)
				api.request("GetUser", { payload: { user_id: 42 } });

				// Step 2: Mock handles request (payload is GetUserPayload directly)
				backend.onRequest("GetUser").mockResponse((payload) => {
					receivedPayload = payload;
					return {
						status: 200,
						headers: {},
						body: {
							user_id: payload.user_id,
							name: "John Doe",
							email: "john@example.com",
						},
					};
				});

				// Step 3: Handle response (type inferred from service definition)
				api.onResponse("GetUser").assert((res) => {
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
			const backendServer = createMockServer("backend", 5112);
			const apiClient = createClient("api", 5112);

			const scenario = new TestScenario({
				name: "Complex Payload gRPC Test",
				components: [backendServer, apiClient],
			});

			let receivedPayload: CreateOrderPayload | undefined;
			let responseData!: CreateOrderResponse;

			const tc = testCase("CreateOrder with complex payload", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				// Step 1: Client sends gRPC request
				api.request("CreateOrder", {
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
				backend.onRequest("CreateOrder").mockResponse((payload) => {
					receivedPayload = payload;
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
				api.onResponse("CreateOrder").assert((res) => {
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
			const backendServer = createMockServer("backend", 5122);
			const apiClient = createClient("api", 5122);

			const scenario = new TestScenario({
				name: "Direct Mock gRPC Test",
				components: [backendServer, apiClient],
			});

			let responseData!: CachedDataResponse;
			let receivedKey: string | undefined;

			const tc = testCase("Mock responds directly", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				// Step 1: Client sends request
				api.request("GetCachedData", { payload: { key: "user:123" } });

				// Step 2: Mock handles
				backend.onRequest("GetCachedData").mockResponse((payload) => {
					receivedKey = payload.key;
					return {
						status: 200,
						headers: {},
						body: { key: payload.key, value: "cached-value", from_cache: true },
					};
				});

				// Step 3: Handle response
				api.onResponse("GetCachedData").assert((res) => {
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
			const backendServer = createMockServer("backend", 5132);
			const apiClient = createClient("api", 5132);

			const scenario = new TestScenario({
				name: "gRPC Error Propagation Test",
				components: [backendServer, apiClient],
			});

			let responseData!: ErrorResponse;
			let receivedKey: string | undefined;

			const tc = testCase("Error response from backend", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				// Step 1: Client sends request
				api.request("GetNotFound", { payload: { key: "nonexistent" } });

				// Step 2: Mock handles
				backend.onRequest("GetNotFound").mockResponse((payload) => {
					receivedKey = payload.key;
					return {
						status: 404,
						headers: {},
						body: { error: "Resource not found", status: 404 },
					};
				});

				// Step 3: Handle response
				api.onResponse("GetNotFound").assert((res) => {
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
			const backendServer = createMockServer("backend", 5142);
			const apiClient = createClient("api", 5142);

			const scenario = new TestScenario({
				name: "Multiple gRPC Methods Test",
				components: [backendServer, apiClient],
			});

			const responses: Record<string, unknown> = {};

			const tc = testCase("Multiple method calls", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

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
			const backendServer = createMockServer("backend", 5152);
			const gatewayProxy = createProxyServer("gateway", 5153, 5152);
			const apiClient = createClient("api", 5153);

			const scenario = new TestScenario({
				name: "gRPC Unary Proxy Chain Test",
				components: [backendServer, gatewayProxy, apiClient],
			});

			let receivedAtBackend: GetUserPayload | undefined;
			let responseData!: GetUserResponse;
			let proxyReceivedPayload: GetUserPayload | undefined;

			const tc = testCase("Forward request through proxy", (test) => {
				const api = test.use(apiClient);
				const gateway = test.use(gatewayProxy);
				const backend = test.use(backendServer);

				// Step 1: Client sends request
				api.request("GetUser", { payload: { user_id: 100 } });

				// Step 2: Proxy captures and forwards
				gateway.onRequest("GetUser").proxy((payload) => {
					proxyReceivedPayload = payload;
					return payload;
				});

				// Step 3: Mock handles request
				backend.onRequest("GetUser").mockResponse((payload) => {
					receivedAtBackend = payload;
					return {
						status: 200,
						headers: {},
						body: {
							user_id: payload.user_id,
							name: "Proxied User",
							email: "proxied@example.com",
						},
					};
				});

				// Step 4: Handle response
				api.onResponse("GetUser").assert((res) => {
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
			const backendServer = createMockServer("backend", 5154);
			const gatewayProxy = createProxyServer("gateway", 5155, 5154);
			const apiClient = createClient("api", 5155);

			const scenario = new TestScenario({
				name: "gRPC Proxy Transform Test",
				components: [backendServer, gatewayProxy, apiClient],
			});

			let receivedAtBackend: CreateOrderPayload | undefined;
			let responseData!: CreateOrderResponse;

			const tc = testCase("Proxy transforms request", (test) => {
				const api = test.use(apiClient);
				const gateway = test.use(gatewayProxy);
				const backend = test.use(backendServer);

				// Step 1: Client sends request
				api.request("CreateOrder", {
					payload: { customer_id: "ORD-001", items: [], shipping_address: {} },
				});

				// Step 2: Proxy intercepts and responds
				gateway.onRequest("CreateOrder").mockResponse((payload) => ({
					status: 200,
					headers: {},
					body: {
						order_id: payload.customer_id,
						status: "created",
						total: 100,
					},
				}));

				// Backend should NOT be called
				backend.onRequest("CreateOrder").mockResponse((payload) => {
					receivedAtBackend = payload;
					return {
						status: 200,
						headers: {},
						body: { status: "created", order_id: "ORD-001", total: 0 },
					};
				});

				// Step 3: Handle response
				api.onResponse("CreateOrder").assert((res) => {
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
			const backendServer = createMockServer("backend", 5156);
			const gatewayProxy = createProxyServer("gateway", 5157, 5156);
			const apiClient = createClient("api", 5157);

			const scenario = new TestScenario({
				name: "gRPC Proxy Block Test",
				components: [backendServer, gatewayProxy, apiClient],
			});

			let responseData!: ErrorResponse;
			let backendCalled = false;

			const tc = testCase("Proxy blocks unauthorized request", (test) => {
				const api = test.use(apiClient);
				const gateway = test.use(gatewayProxy);
				const backend = test.use(backendServer);

				// Step 1: Client sends request
				api.request("GetSecretData", { payload: { key: "secret-key" } });

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
						body: { value: "top-secret-value" },
					};
				});

				// Step 3: Handle response
				api.onResponse("GetSecretData").assert((res) => {
					responseData = res as unknown as ErrorResponse;
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
			const backendServer = createMockServer("backend", 5158);
			const gatewayProxy = createProxyServer("gateway", 5159, 5158);
			const apiClient = createClient("api", 5159);

			const scenario = new TestScenario({
				name: "gRPC Metadata Proxy Test",
				components: [backendServer, gatewayProxy, apiClient],
			});

			let responseData!: GetUserResponse;
			let receivedPayload: GetUserPayload | undefined;
			let proxyReceivedPayload: GetUserPayload | undefined;

			const tc = testCase("Request with auth metadata", (test) => {
				const api = test.use(apiClient);
				const gateway = test.use(gatewayProxy);
				const backend = test.use(backendServer);

				// Step 1: Client sends request with metadata
				api.request("GetUser", {
					payload: { user_id: 42 },
					metadata: { authorization: "Bearer test-token-123" },
				});

				// Step 2: Proxy forwards
				gateway.onRequest("GetUser").proxy((payload) => {
					proxyReceivedPayload = payload;
					return payload;
				});

				// Step 3: Mock handles
				backend.onRequest("GetUser").mockResponse((payload) => {
					receivedPayload = payload;
					return {
						status: 200,
						headers: {},
						body: {
							user_id: payload.user_id,
							name: "Authenticated User",
							email: "auth@example.com",
						},
					};
				});

				// Step 4: Handle response
				api.onResponse("GetUser").assert((res) => {
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
			const backendServer = createMockServer("backend", 5160);
			const gatewayProxy = createProxyServer("gateway", 5161, 5160);
			const apiClient = createClient("api", 5161);

			const scenario = new TestScenario({
				name: "gRPC Error Response Proxy Test",
				components: [backendServer, gatewayProxy, apiClient],
			});

			let responseData!: ErrorResponse;

			const tc = testCase("Request returns error through proxy", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				// Step 1: Client sends request
				api.request("GetNotFound", { payload: { key: "nonexistent" } });

				// Step 2: Mock handles
				backend.onRequest("GetNotFound").mockResponse(() => ({
					status: 200,
					headers: {},
					body: {
						error: "Resource not found",
						code: "404",
					},
				}));

				// Step 3: Handle response
				api.onResponse("GetNotFound").assert((res) => {
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
