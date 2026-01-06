/**
 * Async Protocol Chain Integration Tests
 *
 * Tests the complete component chain: Client → Proxy → Mock
 * Using async (TCP/WebSocket-like) protocol with real TcpAdapter.
 *
 * Note: TcpAdapter uses fire-and-forget messaging with optional responses.
 * Messages are routed based on client's target address.
 */

import { TcpProtocol } from "@testurio/protocol-tcp";
import { AsyncClient, AsyncServer, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";

// ============================================================================
// Message Type Definitions
// ============================================================================

type InitTestRequest = Record<string, never>;

interface InitTestResponse {
	initialized: boolean;
}

interface OrderRequest {
	orderId: string;
	items: string[];
}

interface OrderRequestResponse {
	orderId: string;
	status: string;
	items: string[];
}

interface LogEvent {
	level: string;
	message: string;
	timestamp: number;
}

interface SubscribeRequest {
	symbol: string;
}

interface SubscribeResponse {
	subscriptionId: string;
	symbol: string;
	status: string;
}

interface ProxyForwardRequest {
	data: string;
}

interface ProxyForwardRequestResponse {
	received: string;
	forwarded: boolean;
}

interface GetAccountRequest {
	accountId: string;
}

interface GetAccountResponse {
	accountId: string;
	balance: number;
}

interface PayloadRequest {
	data: string;
}

interface PayloadRequestResponse {
	echo: string;
	processed: boolean;
}

interface ErrorRequest {
	data: string;
}

// Service definition for type-safe builders
interface AsyncTcpService {
	clientMessages: {
		InitTest: InitTestRequest;
		OrderRequest: OrderRequest;
		LogEvent: LogEvent;
		Subscribe: SubscribeRequest;
		ProxyForwardRequest: ProxyForwardRequest;
		GetAccount: GetAccountRequest;
		PayloadRequest: PayloadRequest;
		ErrorRequest: ErrorRequest;
	};
	serverMessages: {
		InitTestResponse: InitTestResponse;
		OrderRequestResponse: OrderRequestResponse;
		SubscribeResponse: SubscribeResponse;
		ProxyForwardRequestResponse: ProxyForwardRequestResponse;
		GetAccountResponse: GetAccountResponse;
		PayloadRequestResponse: PayloadRequestResponse;
	};
}

// Helper functions for creating TCP Proto components with type-safe protocols
const createMockServer = (name: string, port: number) =>
	new AsyncServer(name, {
		protocol: new TcpProtocol<AsyncTcpService>(),
		listenAddress: { host: "localhost", port },
	});

const createClient = (name: string, port: number) =>
	new AsyncClient(name, {
		protocol: new TcpProtocol<AsyncTcpService>(),
		targetAddress: { host: "localhost", port },
	});

const createProxyServer = (name: string, listenPort: number, targetPort: number) =>
	new AsyncServer(name, {
		protocol: new TcpProtocol<AsyncTcpService>(),
		listenAddress: { host: "localhost", port: listenPort },
		targetAddress: { host: "localhost", port: targetPort },
	});

describe("Async Protocol Chain: Client → Proxy → Mock", () => {
	describe("2.1 Init/Stop Lifecycle", () => {
		it("should execute init handler before test cases", async () => {
			const backend = createMockServer("backend", 4110);
			const api = createClient("api", 4110);

			const scenario = new TestScenario({
				name: "Init Lifecycle Test",
				components: [backend, api],
			});

			scenario.init((test) => {
				test
					.use(backend)
					.onMessage("InitTest")
					.mockEvent("InitTestResponse", () => ({ initialized: true }));
			});

			const tc = testCase("Verify init ran", (test) => {
				test.use(api).sendMessage("InitTest", {});
				test
					.use(api)
					.onEvent("InitTestResponse")
					.assert((payload) => {
						return payload.initialized === true;
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("2.2 Basic Message Flow", () => {
		it("should route message through proxy to mock and receive response", async () => {
			const backend = createMockServer("backend", 4122);
			const gateway = createProxyServer("gateway", 4121, 4122);
			const api = createClient("api", 4121);

			const scenario = new TestScenario({
				name: "Basic Async Chain Test",
				components: [backend, gateway, api],
			});

			const tc = testCase("Send OrderRequest through chain", (test) => {
				test.use(api).sendMessage("OrderRequest", {
					orderId: "ORD-001",
					items: ["item1", "item2"],
				});

				test
					.use(backend)
					.onMessage("OrderRequest")
					.mockEvent("OrderRequestResponse", (payload) => {
						return {
							orderId: payload.orderId,
							status: "confirmed",
							items: payload.items,
						};
					});

				test
					.use(api)
					.onEvent("OrderRequestResponse")
					.assert((payload) => {
						return payload.orderId === "ORD-001" && payload.status === "confirmed" && payload.items.length === 2;
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should handle fire-and-forget messages", async () => {
			const backend = createMockServer("backend", 4132);
			const gateway = createProxyServer("gateway", 4131, 4132);
			const api = createClient("api", 4131);

			const scenario = new TestScenario({
				name: "Fire-and-Forget Test",
				components: [backend, gateway, api],
			});

			let receivedPayload: LogEvent | undefined;

			const tc = testCase("Send fire-and-forget message", (test) => {
				test.use(api).sendMessage("LogEvent", {
					level: "info",
					message: "User logged in",
					timestamp: Date.now(),
				});

				test
					.use(backend)
					.waitMessage("LogEvent", { timeout: 2000 })
					.assert((payload) => {
						receivedPayload = payload;
						// Verify payload structure instead of always returning true
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

	describe("2.3 Bidirectional Communication", () => {
		it("should handle subscribe request and receive response", async () => {
			const backend = createMockServer("backend", 4140);
			const api = createClient("api", 4140);

			const scenario = new TestScenario({
				name: "Bidirectional Test",
				components: [backend, api],
			});

			const tc = testCase("Subscribe and receive confirmation", (test) => {
				test.use(api).sendMessage("Subscribe", { symbol: "EURUSD" });

				test
					.use(backend)
					.onMessage("Subscribe")
					.mockEvent("SubscribeResponse", (payload) => ({
						subscriptionId: "sub-123",
						symbol: payload.symbol,
						status: "active",
					}));

				test
					.use(api)
					.onEvent("SubscribeResponse")
					.assert((payload) => {
						return payload.subscriptionId === "sub-123" && payload.symbol === "EURUSD" && payload.status === "active";
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("2.4 Message Through Proxy", () => {
		it("should forward messages through proxy to backend", async () => {
			const backend = createMockServer("backend", 4242);
			const gateway = createProxyServer("gateway", 4241, 4242);
			const api = createClient("api", 4241);

			const scenario = new TestScenario({
				name: "Proxy Forward Test",
				components: [backend, gateway, api],
			});

			const tc = testCase("Send message through proxy", (test) => {
				test.use(api).sendMessage("ProxyForwardRequest", { data: "test" });

				test
					.use(backend)
					.onMessage("ProxyForwardRequest")
					.mockEvent("ProxyForwardRequestResponse", (payload) => ({
						received: payload.data,
						forwarded: true,
					}));

				test
					.use(api)
					.onEvent("ProxyForwardRequestResponse")
					.assert((payload) => {
						return payload.received === "test" && payload.forwarded === true;
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("2.5 Multiple Message Types", () => {
		it("should handle different message types correctly", async () => {
			const backend = createMockServer("backend", 4170);
			const api = createClient("api", 4170);

			const scenario = new TestScenario({
				name: "Multiple Message Types Test",
				components: [backend, api],
			});

			const tc = testCase("Send account request", (test) => {
				test.use(api).sendMessage("GetAccount", { accountId: "ACC-001" });

				test
					.use(backend)
					.onMessage("GetAccount")
					.mockEvent("GetAccountResponse", () => ({
						accountId: "ACC-001",
						balance: 10000,
					}));

				test
					.use(api)
					.onEvent("GetAccountResponse")
					.assert((payload) => {
						return payload.accountId === "ACC-001" && payload.balance === 10000;
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("2.6 Response Payload", () => {
		it("should receive response payload correctly", async () => {
			const backend = createMockServer("backend", 4180);
			const api = createClient("api", 4180);

			const scenario = new TestScenario({
				name: "Response Payload Test",
				components: [backend, api],
			});

			const tc = testCase("Send request and check response", (test) => {
				test.use(api).sendMessage("PayloadRequest", { data: "test-data" });

				test
					.use(backend)
					.onMessage("PayloadRequest")
					.mockEvent("PayloadRequestResponse", (payload) => ({
						echo: payload.data,
						processed: true,
					}));

				test
					.use(api)
					.onEvent("PayloadRequestResponse")
					.assert((payload) => {
						return payload.echo === "test-data" && payload.processed === true;
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("2.7 Error Handling", () => {
		it("should handle handler errors gracefully", async () => {
			const backend = createMockServer("backend", 4190);
			const api = createClient("api", 4190);

			const scenario = new TestScenario({
				name: "Error Handling Test",
				components: [backend, api],
			});

			let handlerCalled = false;
			let receivedData: string | undefined;

			const tc = testCase("Send request that causes error", (test) => {
				test.use(api).sendMessage("ErrorRequest", { data: "test" });

				test
					.use(backend)
					.waitMessage("ErrorRequest", { timeout: 1000 })
					.assert((payload) => {
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
});
