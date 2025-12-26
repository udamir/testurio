/**
 * WebSocket Protocol Chain Integration Tests
 *
 * Tests the complete component chain: Client → Mock
 * Using async WebSocket protocol with real connections.
 */

import { describe, expect, it } from "vitest";
import { TestScenario, testCase, AsyncServer, AsyncClient } from "testurio";
import { WebSocketAdapter } from "@testurio/adapter-ws";

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

interface PingResponse {
	seq: number;
	pong: boolean;
}

interface OrderItem {
	productId: string;
	quantity: number;
	price: number;
}

interface ShippingAddress {
	street: string;
	city: string;
	zip: string;
}

interface CreateOrderRequest {
	customerId: string;
	items: OrderItem[];
	shippingAddress: ShippingAddress;
}

interface GetAccountRequest {
	accountId: string;
}

interface GetAccountResponse {
	accountId: string;
	balance: number;
	currency: string;
}

type InitTestRequest = Record<string, never>;

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

type WsMessages = {
	GetUserRequest: GetUserRequest;
	GetUserRequestResponse: GetUserResponse;
	LogEvent: LogEvent;
	Subscribe: SubscribeRequest;
	SubscribeResponse: SubscribeResponse;
	Ping: PingRequest;
	PingResponse: PingResponse;
	CreateOrder: CreateOrderRequest;
	GetAccount: GetAccountRequest;
	GetAccountResponse: GetAccountResponse;
	InitTest: InitTestRequest;
	InitTestResponse: InitTestResponse;
	ValidateRequest: ValidateRequest;
	SubscribePrices: SubscribePricesRequest;
	SubscribePricesResponse: SubscribePricesResponse;
	[key: string]: unknown;
};

// Helper functions for creating WebSocket components with typed adapters
const createMockServer = (name: string, port: number) =>
	new AsyncServer(name, {
		adapter: new WebSocketAdapter<WsMessages>(),
		listenAddress: { host: "127.0.0.1", port },
	});

const createClient = (name: string, port: number) =>
	new AsyncClient(name, {
		adapter: new WebSocketAdapter<WsMessages>(),
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

				api.sendMessage("GetUserRequest", { userId: 42 });

				backend.onMessage("GetUserRequest").mockEvent("GetUserRequestResponse", (payload) => {
					return { userId: payload.userId, name: "John Doe", email: "john@example.com" };
				});

				api.onEvent("GetUserRequestResponse").assert((payload) => {
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

				api.sendMessage("LogEvent", {
					level: "info",
					message: "User logged in",
					timestamp: Date.now(),
				});

				backend.waitMessage("LogEvent", { timeout: 1000 }).assert((payload) => {
					receivedPayload = payload as LogEvent;
					return payload.level === "info" && 
						payload.message === "User logged in" && 
						typeof payload.timestamp === "number";
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

				api.sendMessage("Subscribe", { channel: "prices" });

				backend.onMessage("Subscribe").mockEvent("SubscribeResponse", (payload) => ({
					subscriptionId: "sub-123",
					channel: payload.channel,
					status: "active",
				}));

				api.onEvent("SubscribeResponse").assert((payload) => {
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

				api.sendMessage("Ping", { seq: 1 });

				backend.onMessage("Ping").mockEvent("PingResponse", (payload) => ({
					seq: payload.seq,
					pong: true,
				}));

				api.onEvent("PingResponse").assert((payload) => {
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

				api.sendMessage("CreateOrder", {
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

				backend.waitMessage("CreateOrder", { timeout: 1000 }).assert((payload) => {
					receivedPayload = payload as CreateOrderRequest;
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

				api.sendMessage("GetAccount", { accountId: "ACC-001" });

				backend.onMessage("GetAccount").mockEvent("GetAccountResponse", () => ({
					accountId: "ACC-001",
					balance: 10000,
					currency: "USD",
				}));

				api.onEvent("GetAccountResponse").assert((payload) => {
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
				backend.onMessage("InitTest").mockEvent("InitTestResponse", () => ({ initialized: true }));
			});

			const tc = testCase("Verify init ran", (test) => {
				const api = test.use(apiClient);

				api.sendMessage("InitTest", {});
				api.onEvent("InitTestResponse").assert((payload) => {
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

				api.sendMessage("ValidateRequest", { data: "test" });

				backend.waitMessage("ValidateRequest", { timeout: 1000 }).assert((payload) => {
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

				api.sendMessage("SubscribePrices", { symbols: ["EURUSD", "GBPUSD"] });

				backend.onMessage("SubscribePrices").mockEvent("SubscribePricesResponse", (payload) => ({
					subscriptionId: "price-sub-001",
					symbols: payload.symbols,
					status: "subscribed",
				}));

				api.onEvent("SubscribePricesResponse").assert((payload) => {
					return payload.subscriptionId === "price-sub-001" && payload.symbols.length === 2;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});
});
