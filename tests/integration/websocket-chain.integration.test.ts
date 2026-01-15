/**
 * WebSocket Protocol Chain Integration Tests
 *
 * Tests the complete component chain: Client → Mock
 * Using async WebSocket protocol with real connections.
 */

import { WebSocketProtocol } from "@testurio/protocol-ws";
import { AsyncClient, AsyncServer, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";

// ============================================================================
// Message Type Definitions
// ============================================================================

interface GetUserRequest {
	userId: number;
}

interface GetUserResponse {
	userId: number;
	name: string;
	email: string;
}

interface LogEvent {
	level: string;
	message: string;
	timestamp: number;
}

interface SubscribeRequest {
	channel: string;
}

interface SubscribeResponse {
	subscriptionId: string;
	channel: string;
	status: string;
}

interface PingRequest {
	seq: number;
}

interface PongResponse {
	seq: number;
	pong: boolean;
}

interface CreateOrderRequest {
	customerId: string;
	items: Array<{ productId: string; quantity: number; price: number }>;
	shippingAddress: { street: string; city: string; zip: string };
}

interface GetAccountRequest {
	accountId: string;
}

interface GetAccountResponse {
	accountId: string;
	balance: number;
	currency: string;
}

interface InitTestRequest {
	init?: boolean;
}

interface InitTestResponse {
	initialized: boolean;
}

interface ValidateRequest {
	data: string;
}

interface SubscribePricesRequest {
	symbols: string[];
}

interface SubscribePricesResponse {
	subscriptionId: string;
	symbols: string[];
	status: string;
}

// Service definition for type-safe WebSocket messaging
// Uses separate clientMessages and serverMessages maps
interface WsMessages {
	clientMessages: {
		getUser: GetUserRequest;
		logEvent: LogEvent;
		subscribe: SubscribeRequest;
		ping: PingRequest;
		createOrder: CreateOrderRequest;
		getAccount: GetAccountRequest;
		initTest: InitTestRequest;
		validateRequest: ValidateRequest;
		subscribePrices: SubscribePricesRequest;
	};
	serverMessages: {
		user: GetUserResponse;
		subscribed: SubscribeResponse;
		pong: PongResponse;
		account: GetAccountResponse;
		initTestResponse: InitTestResponse;
		subscribePricesResponse: SubscribePricesResponse;
	};
}

// Helper functions for creating WebSocket components with typed protocol
const createMockServer = (name: string, port: number) =>
	new AsyncServer(name, {
		protocol: new WebSocketProtocol<WsMessages>(),
		listenAddress: { host: "127.0.0.1", port },
	});

const createClient = (name: string, port: number) =>
	new AsyncClient(name, {
		protocol: new WebSocketProtocol<WsMessages>(),
		targetAddress: { host: "127.0.0.1", port },
	});

describe("WebSocket Protocol Chain: Client → Mock", () => {
	// ============================================================
	// 5.1 Basic Message Flow
	// ============================================================
	describe("5.1 Basic Message Flow", () => {
		it("should route message to mock and receive response", async () => {
			const backendServer = createMockServer("backend", 6102);
			const apiClient = createClient("api", 6102);

			const scenario = new TestScenario({
				name: "Basic WebSocket Chain Test",
				components: [backendServer, apiClient],
			});

			const tc = testCase("Send WebSocket message and receive response", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.sendMessage("getUser", { userId: 42 });

				backend.onMessage("getUser").mockEvent("user", (payload) => {
					return { userId: payload.userId, name: "John Doe", email: "john@example.com" };
				});

				api.onEvent("user").assert((payload) => {
					return payload.userId === 42 && payload.name === "John Doe";
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should handle fire-and-forget messages", async () => {
			const backendServer = createMockServer("backend", 6112);
			const apiClient = createClient("api", 6112);

			const scenario = new TestScenario({
				name: "Fire-and-Forget WebSocket Test",
				components: [backendServer, apiClient],
			});

			let receivedPayload: LogEvent | undefined;

			const tc = testCase("Send fire-and-forget WebSocket message", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.sendMessage("logEvent", {
					level: "info",
					message: "User logged in",
					timestamp: Date.now(),
				});

				backend.waitMessage("logEvent").timeout(1000).assert((payload) => {
					receivedPayload = payload;
					return (
						payload.level === "info" && payload.message === "User logged in" && typeof payload.timestamp === "number"
					);
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(receivedPayload).toMatchObject({
				level: "info",
				message: "User logged in",
			});
		});
	});

	// ============================================================
	// 5.2 Bidirectional Communication
	// ============================================================
	describe("5.2 Bidirectional Communication", () => {
		it("should handle subscribe request and receive confirmation", async () => {
			const backendServer = createMockServer("backend", 6120);
			const apiClient = createClient("api", 6120);

			const scenario = new TestScenario({
				name: "Bidirectional WebSocket Test",
				components: [backendServer, apiClient],
			});

			const tc = testCase("Subscribe and receive confirmation", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.sendMessage("subscribe", { channel: "prices" });

				backend.onMessage("subscribe").mockEvent("subscribed", (payload) => ({
					subscriptionId: "sub-123",
					channel: payload.channel,
					status: "active",
				}));

				api.onEvent("subscribed").assert((payload) => {
					return payload.subscriptionId === "sub-123" && payload.channel === "prices" && payload.status === "active";
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should handle multiple message exchanges", async () => {
			const backendServer = createMockServer("backend", 6125);
			const apiClient = createClient("api", 6125);

			const scenario = new TestScenario({
				name: "Multiple Exchange WebSocket Test",
				components: [backendServer, apiClient],
			});

			const tc = testCase("Multiple message exchanges", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.sendMessage("ping", { seq: 1 });

				backend.onMessage("ping").mockEvent("pong", (payload) => ({
					seq: payload.seq,
					pong: true,
				}));

				api.onEvent("pong").assert((payload) => {
					return payload.seq === 1 && payload.pong === true;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	// ============================================================
	// 5.3 Complex Payloads
	// ============================================================
	describe("5.3 Complex Payloads", () => {
		it("should handle complex nested payloads", async () => {
			const backendServer = createMockServer("backend", 6130);
			const apiClient = createClient("api", 6130);

			const scenario = new TestScenario({
				name: "Complex Payload WebSocket Test",
				components: [backendServer, apiClient],
			});

			let receivedPayload: CreateOrderRequest | undefined;

			const tc = testCase("Send complex nested payload", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.sendMessage("createOrder", {
					customerId: "CUST-001",
					items: [
						{ productId: "PROD-1", quantity: 2, price: 29.99 },
						{ productId: "PROD-2", quantity: 1, price: 49.99 },
					],
					shippingAddress: {
						street: "123 Main St",
						city: "New York",
						zip: "10001",
					},
				});

				backend.waitMessage("createOrder").timeout(1000).assert((payload) => {
					receivedPayload = payload;
					return payload.customerId === "CUST-001" && payload.items.length === 2;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(receivedPayload).toMatchObject({
				customerId: "CUST-001",
				items: expect.arrayContaining([expect.objectContaining({ productId: "PROD-1" })]),
			});
		});
	});

	// ============================================================
	// 5.4 Multiple Message Types
	// ============================================================
	describe("5.4 Multiple Message Types", () => {
		it("should handle different message types correctly", async () => {
			const backendServer = createMockServer("backend", 6140);
			const apiClient = createClient("api", 6140);

			const scenario = new TestScenario({
				name: "Multiple Message Types WebSocket Test",
				components: [backendServer, apiClient],
			});

			const tc = testCase("Send account request", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.sendMessage("getAccount", { accountId: "ACC-001" });

				backend.onMessage("getAccount").mockEvent("account", () => ({
					accountId: "ACC-001",
					balance: 10000,
					currency: "USD",
				}));

				api.onEvent("account").assert((payload) => {
					return payload.accountId === "ACC-001" && payload.balance === 10000 && payload.currency === "USD";
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	// ============================================================
	// 5.5 Init/Stop Lifecycle
	// ============================================================
	describe("5.5 Init/Stop Lifecycle", () => {
		it("should execute init handler before test cases", async () => {
			const backendServer = createMockServer("backend", 6150);
			const apiClient = createClient("api", 6150);

			const scenario = new TestScenario({
				name: "WebSocket Init Lifecycle Test",
				components: [backendServer, apiClient],
			});

			scenario.init((test) => {
				const backend = test.use(backendServer);
				backend.onMessage("initTest").mockEvent("initTestResponse", () => ({ initialized: true }));
			});

			const tc = testCase("Verify init ran", (test) => {
				const api = test.use(apiClient);

				api.sendMessage("initTest", {});
				api.onEvent("initTestResponse").assert((payload) => {
					return payload.initialized === true;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	// ============================================================
	// 5.6 Error Handling
	// ============================================================
	describe("5.6 Error Handling", () => {
		it("should handle message validation", async () => {
			const backendServer = createMockServer("backend", 6160);
			const apiClient = createClient("api", 6160);

			const scenario = new TestScenario({
				name: "WebSocket Error Handling Test",
				components: [backendServer, apiClient],
			});

			let handlerCalled = false;
			let receivedData: string | undefined;

			const tc = testCase("Send request and validate", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.sendMessage("validateRequest", { data: "test" });

				backend.waitMessage("validateRequest").timeout(1000).assert((payload) => {
					handlerCalled = true;
					receivedData = payload.data;
					return payload.data === "test";
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(handlerCalled).toBe(true);
			expect(receivedData).toBe("test");
		});
	});

	// ============================================================
	// 5.7 Real-time Updates
	// ============================================================
	describe("5.7 Real-time Updates", () => {
		it("should handle real-time price updates", async () => {
			const backendServer = createMockServer("backend", 6170);
			const apiClient = createClient("api", 6170);

			const scenario = new TestScenario({
				name: "Real-time Updates WebSocket Test",
				components: [backendServer, apiClient],
			});

			const tc = testCase("Subscribe to price updates", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.sendMessage("subscribePrices", { symbols: ["EURUSD", "GBPUSD"] });

				backend.onMessage("subscribePrices").mockEvent("subscribePricesResponse", (payload) => ({
					subscriptionId: "price-sub-001",
					symbols: payload.symbols,
					status: "subscribed",
				}));

				api.onEvent("subscribePricesResponse").assert((payload) => {
					return payload.subscriptionId === "price-sub-001" && payload.symbols.length === 2;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});
});
