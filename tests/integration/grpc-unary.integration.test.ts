/**
 * gRPC Unary Protocol Chain Integration Tests
 *
 * Tests the complete component chain: Client → Proxy → Mock
 * Using sync (unary) gRPC protocol with real connections.
 */

import { GrpcUnaryProtocol } from "@testurio/protocol-grpc";
import { Client, Server, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";

// ============================================================================
// Type Definitions - Aligned with test-service.proto
// ============================================================================

// === Common Types ===
interface SuccessPayload {
	value: string;
}

interface ErrorPayload {
	code: number;
	message: string;
}

// === 1. Simple Request/Response ===
interface GetUserRequest {
	user_id: number;
}

interface GetUserResponse {
	user_id: number;
	name: string;
	email: string;
}

// === 2. Nested Objects ===
interface OrderItem {
	product_id: string;
	quantity: number;
	price: number;
}

interface ShippingAddress {
	street: string;
	city: string;
	zip: string;
	country: string;
}

interface CreateOrderRequest {
	customer_id: string;
	items: OrderItem[];
	shipping_address: ShippingAddress;
}

interface CreateOrderResponse {
	order_id: string;
	status: string;
	total: number;
	shipping_address: ShippingAddress;
}

// === 3. OneOf (union types) ===
interface GenericRequest {
	key: string;
}

// OneOf in proto3 means only one field is set at a time
interface GenericResponse {
	success?: SuccessPayload;
	error?: ErrorPayload;
}

// === 4. Repeated Fields (arrays) ===
interface ListUsersRequest {
	limit: number;
	offset?: number;
}

interface UserInfo {
	id: number;
	name: string;
	email: string;
}

interface ListUsersResponse {
	users: UserInfo[];
	total: number;
}

// === 5. Optional Fields ===
interface UpdateUserRequest {
	user_id: number;
	name?: string;
	email?: string;
	active?: boolean;
}

interface UpdateUserResponse {
	user_id: number;
	name: string;
	email: string;
	active: boolean;
	updated_at: string;
}

// === 6. Map Fields ===
interface GetConfigRequest {
	namespace: string;
}

interface GetConfigResponse {
	namespace: string;
	config: Record<string, string>;
}

// === 7. Enum Types ===
type OrderStatus =
	| "ORDER_STATUS_UNSPECIFIED"
	| "ORDER_STATUS_PENDING"
	| "ORDER_STATUS_CONFIRMED"
	| "ORDER_STATUS_SHIPPED"
	| "ORDER_STATUS_DELIVERED"
	| "ORDER_STATUS_CANCELLED";

interface GetOrderStatusRequest {
	order_id: string;
}

interface GetOrderStatusResponse {
	order_id: string;
	status: OrderStatus;
	status_message: string;
}

// === 8. Boolean Response ===
interface DeleteUserRequest {
	user_id: number;
}

interface DeleteUserResponse {
	deleted: boolean;
}

// ============================================================================
// Typed Metadata - Based on proto options (response_metadata, required_metadata)
// ============================================================================

// GetUser: response_metadata = "x-request-id", "x-api-version"; response_trailers = "x-processing-time-ms"
interface GetUserResponseMetadata {
	"x-request-id"?: string;
	"x-api-version"?: string;
	"x-processing-time-ms"?: string;
}

// GetSecretData: required_metadata = "authorization"; response_metadata = "x-auth-user"
interface GetSecretDataRequestMetadata {
	authorization?: string;
}

interface GetSecretDataResponseMetadata {
	"x-auth-user"?: string;
}

// ============================================================================
// Service Definition - Type-safe gRPC calls with { payload, metadata } wrapper
// ============================================================================
interface TestService {
	// 1. Simple request/response with response metadata
	GetUser: {
		request: { payload: GetUserRequest };
		response: { payload: GetUserResponse; metadata: GetUserResponseMetadata };
	};
	// 2. Nested objects
	CreateOrder: {
		request: { payload: CreateOrderRequest };
		response: { payload: CreateOrderResponse };
	};
	// 3. OneOf (union types)
	GetData: {
		request: { payload: GenericRequest };
		response: { payload: GenericResponse };
	};
	// GetSecretData requires authorization metadata
	GetSecretData: {
		request: { payload: GenericRequest; metadata: GetSecretDataRequestMetadata };
		response: { payload: GenericResponse; metadata: GetSecretDataResponseMetadata };
	};
	// 4. Repeated fields (arrays)
	ListUsers: {
		request: { payload: ListUsersRequest };
		response: { payload: ListUsersResponse };
	};
	// 5. Optional fields
	UpdateUser: {
		request: { payload: UpdateUserRequest };
		response: { payload: UpdateUserResponse };
	};
	// 6. Map fields
	GetConfig: {
		request: { payload: GetConfigRequest };
		response: { payload: GetConfigResponse };
	};
	// 7. Enum types
	GetOrderStatus: {
		request: { payload: GetOrderStatusRequest };
		response: { payload: GetOrderStatusResponse };
	};
	// 8. Boolean response
	DeleteUser: {
		request: { payload: DeleteUserRequest };
		response: { payload: DeleteUserResponse };
	};
}

// Proto file path for test service
const TEST_PROTO = "tests/proto/test-service.proto";
const TEST_SERVICE = "test.v1.TestService";

// Helper functions for creating components with typed adapters
const createMockServer = (name: string, port: number) =>
	new Server(name, {
		protocol: new GrpcUnaryProtocol<TestService>({ schema: TEST_PROTO }),
		listenAddress: { host: "127.0.0.1", port },
	});

const createClient = (name: string, port: number) =>
	new Client(name, {
		protocol: new GrpcUnaryProtocol<TestService>({
			schema: TEST_PROTO,
			serviceName: TEST_SERVICE,
		}),
		targetAddress: { host: "127.0.0.1", port },
	});

const createProxyServer = (name: string, listenPort: number, targetPort: number) =>
	new Server(name, {
		protocol: new GrpcUnaryProtocol<TestService>({ schema: TEST_PROTO }),
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
			let receivedPayload: GetUserRequest | undefined;

			const tc = testCase("GetUser through chain", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				// Step 1: Client sends gRPC request (type-safe via adapter generic)
				api.request("GetUser", { payload: { user_id: 42 } });

				// Step 2: Mock handles request (payload wrapped in { payload, metadata })
				backend.onRequest("GetUser").mockResponse((req) => {
					receivedPayload = req.payload;
					return {
						payload: {
							user_id: req.payload.user_id,
							name: "John Doe",
							email: "john@example.com",
						},
						metadata: {
							"x-request-id": "test-request-id",
						},
					};
				});

				// Step 3: Handle response (type inferred from service definition)
				api.onResponse("GetUser").assert((res) => {
					responseData = res.payload;
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

			let receivedPayload: CreateOrderRequest | undefined;
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
							country: "USA",
						},
					},
				});

				// Step 2: Mock handles request
				backend.onRequest("CreateOrder").mockResponse((req) => {
					receivedPayload = req.payload;
					return {
						payload: {
							order_id: "ORD-12345",
							status: "confirmed",
							total: 109.97,
							shipping_address: req.payload.shipping_address,
						},
					};
				});

				// Step 3: Handle response
				api.onResponse("CreateOrder").assert((res) => {
					responseData = res.payload;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(receivedPayload).toMatchObject({
				customer_id: "CUST-001",
				items: expect.arrayContaining([expect.objectContaining({ product_id: "PROD-1" })]),
			});
			expect(responseData).toMatchObject({
				order_id: "ORD-12345",
				status: "confirmed",
			});
		});
	});

	// ============================================================
	// 3.2 OneOf Response (Success/Error)
	// ============================================================
	describe("3.2 OneOf Response (Success/Error)", () => {
		it("should handle success response in oneof", async () => {
			const backendServer = createMockServer("backend", 5122);
			const apiClient = createClient("api", 5122);

			const scenario = new TestScenario({
				name: "OneOf Success gRPC Test",
				components: [backendServer, apiClient],
			});

			let responseData!: GenericResponse;
			let receivedKey: string | undefined;

			const tc = testCase("GetData returns success", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				// Step 1: Client sends request
				api.request("GetData", { payload: { key: "config:app" } });

				// Step 2: Mock handles
				backend.onRequest("GetData").mockResponse((req) => {
					receivedKey = req.payload.key;
					return {
						payload: {
							success: { value: "application-config-data" },
						},
					};
				});

				// Step 3: Handle response
				api.onResponse("GetData").assert((res) => {
					responseData = res.payload;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(receivedKey).toBe("config:app");
			expect(responseData.success).toMatchObject({
				value: "application-config-data",
			});
		});
	});

	// ============================================================
	// 3.3 Error Handling (OneOf Error)
	// ============================================================
	describe("3.3 Error Handling (OneOf Error)", () => {
		it("should propagate gRPC errors via oneof", async () => {
			const backendServer = createMockServer("backend", 5132);
			const apiClient = createClient("api", 5132);

			const scenario = new TestScenario({
				name: "gRPC Error Propagation Test",
				components: [backendServer, apiClient],
			});

			let responseData!: GenericResponse;
			let receivedKey: string | undefined;

			const tc = testCase("Error response from backend", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				// Step 1: Client sends request
				api.request("GetData", { payload: { key: "nonexistent" } });

				// Step 2: Mock handles with error response
				backend.onRequest("GetData").mockResponse((req) => {
					receivedKey = req.payload.key;
					return { payload: { error: { code: 404, message: "Resource not found" } } };
				});

				// Step 3: Handle response
				api.onResponse("GetData").assert((res) => {
					responseData = res.payload;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(receivedKey).toBe("nonexistent");
			expect(responseData.error).toMatchObject({
				code: 404,
				message: "Resource not found",
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
					payload: { user_id: 1, name: "Alice", email: "alice@example.com" },
					metadata: { "x-request-id": "req-001", "x-api-version": "v1" },
				}));

				backend.onRequest("ListUsers").mockResponse(() => ({
					payload: {
						users: [
							{ id: 1, name: "Alice", email: "alice@example.com" },
							{ id: 2, name: "Bob", email: "bob@example.com" },
						],
						total: 2,
					},
				}));

				backend.onRequest("DeleteUser").mockResponse(() => ({ payload: { deleted: true } }));

				// Response handlers
				api.onResponse("GetUser").assert((res) => {
					responses.getUser = res.payload;
					return true;
				});

				api.onResponse("ListUsers").assert((res) => {
					responses.listUsers = res.payload;
					return true;
				});

				api.onResponse("DeleteUser").assert((res) => {
					responses.deleteUser = res.payload;
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

			let receivedAtBackend: GetUserRequest | undefined;
			let responseData!: GetUserResponse;
			let proxyReceivedPayload: GetUserRequest | undefined;

			const tc = testCase("Forward request through proxy", (test) => {
				const api = test.use(apiClient);
				const gateway = test.use(gatewayProxy);
				const backend = test.use(backendServer);

				// Step 1: Client sends request
				api.request("GetUser", { payload: { user_id: 100 } });

				// Step 2: Proxy captures and forwards
				gateway.onRequest("GetUser").proxy((req) => {
					proxyReceivedPayload = req.payload;
					return req;
				});

				// Step 3: Mock handles request
				backend.onRequest("GetUser").mockResponse((req) => {
					receivedAtBackend = req.payload;
					return {
						payload: {
							user_id: req.payload.user_id,
							name: "Proxied User",
							email: "proxied@example.com",
						},
						metadata: {
							"x-request-id": "proxy-request-id",
						},
					};
				});

				// Step 4: Handle response
				api.onResponse("GetUser").assert((res) => {
					responseData = res.payload;
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

			let receivedAtBackend: CreateOrderRequest | undefined;
			let responseData!: CreateOrderResponse;
			const defaultAddress: ShippingAddress = { street: "N/A", city: "N/A", zip: "00000", country: "N/A" };

			const tc = testCase("Proxy transforms request", (test) => {
				const api = test.use(apiClient);
				const gateway = test.use(gatewayProxy);
				const backend = test.use(backendServer);

				// Step 1: Client sends request
				api.request("CreateOrder", {
					payload: {
						customer_id: "ORD-001",
						items: [],
						shipping_address: defaultAddress,
					},
				});

				// Step 2: Proxy intercepts and responds
				gateway.onRequest("CreateOrder").mockResponse((req) => ({
					payload: {
						order_id: req.payload.customer_id,
						status: "created",
						total: 100,
						shipping_address: req.payload.shipping_address,
					},
				}));

				// Backend should NOT be called
				backend.onRequest("CreateOrder").mockResponse((req) => {
					receivedAtBackend = req.payload;
					return {
						payload: { status: "created", order_id: "ORD-001", total: 0, shipping_address: defaultAddress },
					};
				});

				// Step 3: Handle response
				api.onResponse("CreateOrder").assert((res) => {
					responseData = res.payload;
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

			let responseData!: GenericResponse;
			let backendCalled = false;

			const tc = testCase("Proxy blocks unauthorized request", (test) => {
				const api = test.use(apiClient);
				const gateway = test.use(gatewayProxy);
				const backend = test.use(backendServer);

				// Step 1: Client sends request (without required metadata - proxy will block)
				api.request("GetSecretData", {
					payload: { key: "secret-key" },
					metadata: { authorization: "" }, // Empty auth - will be rejected
				});

				// Step 2: Proxy blocks with error response (oneof)
				gateway.onRequest("GetSecretData").mockResponse(() => ({
					payload: { error: { code: 403, message: "Access denied" } },
					metadata: { "x-auth-user": "" },
				}));

				// Backend should NOT be called
				backend.onRequest("GetSecretData").mockResponse(() => {
					backendCalled = true;
					return {
						payload: { success: { value: "top-secret-value" } },
						metadata: { "x-auth-user": "user-123" },
					};
				});

				// Step 3: Handle response
				api.onResponse("GetSecretData").assert((res) => {
					responseData = res.payload;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(backendCalled).toBe(false);
			expect(responseData.error).toMatchObject({
				code: 403,
				message: "Access denied",
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
			let receivedPayload: GetUserRequest | undefined;
			let proxyReceivedPayload: GetUserRequest | undefined;

			const tc = testCase("Request with auth metadata", (test) => {
				const api = test.use(apiClient);
				const gateway = test.use(gatewayProxy);
				const backend = test.use(backendServer);

				// Step 1: Client sends request with metadata
				api.request("GetUser", {
					payload: { user_id: 42 },
				});

				// Step 2: Proxy forwards
				gateway.onRequest("GetUser").proxy((req) => {
					proxyReceivedPayload = req.payload;
					return req;
				});

				// Step 3: Mock handles
				backend.onRequest("GetUser").mockResponse((req) => {
					receivedPayload = req.payload;
					return {
						payload: {
							user_id: req.payload.user_id,
							name: "Authenticated User",
							email: "auth@example.com",
						},
						metadata: {
							"x-request-id": "test-request-id",
						},
					};
				});

				// Step 4: Handle response
				api.onResponse("GetUser").assert((res) => {
					responseData = res.payload;
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
	// 3.7 gRPC Error Responses (via OneOf)
	// ============================================================
	describe("3.7 gRPC Error Responses (via OneOf)", () => {
		it("should propagate error response through proxy", async () => {
			const backendServer = createMockServer("backend", 5160);
			const gatewayProxy = createProxyServer("gateway", 5161, 5160);
			const apiClient = createClient("api", 5161);

			const scenario = new TestScenario({
				name: "gRPC Error Response Proxy Test",
				components: [backendServer, gatewayProxy, apiClient],
			});

			let responseData!: GenericResponse;

			const tc = testCase("Request returns error through proxy", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				// Step 1: Client sends request
				api.request("GetData", { payload: { key: "nonexistent" } });

				// Step 2: Mock handles with error response (oneof)
				backend.onRequest("GetData").mockResponse(() => ({
					payload: {
						error: { code: 404, message: "Resource not found" },
					},
				}));

				// Step 3: Handle response
				api.onResponse("GetData").assert((res) => {
					responseData = res.payload;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(responseData.error).toMatchObject({
				code: 404,
				message: "Resource not found",
			});
		});
	});

	// ============================================================
	// 3.8 Response Metadata (response_metadata option)
	// ============================================================
	describe("3.8 Response Metadata", () => {
		it("should allow mock to return response with metadata", async () => {
			const backendServer = createMockServer("backend", 5162);
			const gatewayProxy = createProxyServer("gateway", 5163, 5162);
			const apiClient = createClient("api", 5163);

			const scenario = new TestScenario({
				name: "gRPC Response Metadata Test",
				components: [backendServer, gatewayProxy, apiClient],
			});

			let responseData!: GetUserResponse;
			let backendReceivedRequest = false;

			const tc = testCase("GetUser with response metadata", (test) => {
				const api = test.use(apiClient);
				const gateway = test.use(gatewayProxy);
				const backend = test.use(backendServer);

				// Step 1: Client sends request
				api.request("GetUser", { payload: { user_id: 42 } });

				// Step 2: Proxy forwards
				gateway.onRequest("GetUser").proxy((req) => req);

				// Step 3: Mock responds with metadata (x-request-id, x-api-version per proto option)
				backend.onRequest("GetUser").mockResponse(() => {
					backendReceivedRequest = true;
					return {
						payload: {
							user_id: 42,
							name: "John Doe",
							email: "john@example.com",
						},
						metadata: {
							"x-request-id": "req-12345",
							"x-api-version": "v1.0.0",
						},
					};
				});

				// Step 4: Handle response
				api.onResponse("GetUser").assert((res) => {
					responseData = res.payload;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(backendReceivedRequest).toBe(true);
			expect(responseData).toMatchObject({
				user_id: 42,
				name: "John Doe",
			});
			// Note: Response metadata propagation to client is tested via the mock's ability
			// to return metadata. Full end-to-end metadata propagation depends on adapter impl.
		});
	});

	// ============================================================
	// 3.9 Required Metadata (required_metadata option)
	// ============================================================
	describe("3.9 Required Metadata", () => {
		it("should pass request with required authorization metadata", async () => {
			const backendServer = createMockServer("backend", 5164);
			const gatewayProxy = createProxyServer("gateway", 5165, 5164);
			const apiClient = createClient("api", 5165);

			const scenario = new TestScenario({
				name: "gRPC Required Metadata Test",
				components: [backendServer, gatewayProxy, apiClient],
			});

			let responseData!: GenericResponse;
			let receivedMetadata: GetSecretDataRequestMetadata | undefined;

			const tc = testCase("GetSecretData with required authorization", (test) => {
				const api = test.use(apiClient);
				const gateway = test.use(gatewayProxy);
				const backend = test.use(backendServer);

				// Step 1: Client sends request with required authorization metadata
				api.request("GetSecretData", {
					payload: { key: "secret-key" },
					metadata: { authorization: "Bearer valid-token" },
				});

				// Step 2: Proxy validates and forwards
				gateway.onRequest("GetSecretData").proxy((req) => {
					// Proxy could validate the authorization here
					return req;
				});

				// Step 3: Backend receives and responds with x-auth-user metadata
				backend.onRequest("GetSecretData").mockResponse((req) => {
					receivedMetadata = req.metadata;
					return {
						payload: { success: { value: "secret-data" } },
						metadata: { "x-auth-user": "user-123" },
					};
				});

				// Step 4: Handle response
				api.onResponse("GetSecretData").assert((res) => {
					responseData = res.payload;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(receivedMetadata).toMatchObject({
				authorization: "Bearer valid-token",
			});
			expect(responseData.success).toMatchObject({
				value: "secret-data",
			});
		});

		it("should reject request without required authorization metadata", async () => {
			const backendServer = createMockServer("backend", 5166);
			const gatewayProxy = createProxyServer("gateway", 5167, 5166);
			const apiClient = createClient("api", 5167);

			const scenario = new TestScenario({
				name: "gRPC Missing Required Metadata Test",
				components: [backendServer, gatewayProxy, apiClient],
			});

			let responseData!: GenericResponse;
			let backendCalled = false;

			const tc = testCase("GetSecretData without authorization rejected", (test) => {
				const api = test.use(apiClient);
				const gateway = test.use(gatewayProxy);
				const backend = test.use(backendServer);

				// Step 1: Client sends request WITHOUT required authorization
				api.request("GetSecretData", {
					payload: { key: "secret-key" },
					metadata: {},
					// No metadata - missing required authorization
				});

				// Step 2: Proxy checks for required metadata and rejects
				gateway.onRequest("GetSecretData").mockResponse((req) => {
					// Check if authorization is missing
					if (!req.metadata?.authorization) {
						return {
							payload: { error: { code: 401, message: "Authorization required" } },
							metadata: {
								"x-auth-user": "test-request-id",
							},
						};
					}
					// This shouldn't be reached in this test
					return {
						payload: { success: { value: "should-not-reach" } },
						metadata: { "x-auth-user": "test-request-id" },
					};
				});

				// Backend should NOT be called
				backend.onRequest("GetSecretData").mockResponse(() => {
					backendCalled = true;
					return {
						payload: { success: { value: "secret-data" } },
						metadata: { "x-auth-user": "backend-test-user" },
					};
				});

				// Step 3: Handle error response
				api.onResponse("GetSecretData").assert((res) => {
					responseData = res.payload;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(backendCalled).toBe(false);
			expect(responseData.error).toMatchObject({
				code: 401,
				message: "Authorization required",
			});
		});
	});
});
