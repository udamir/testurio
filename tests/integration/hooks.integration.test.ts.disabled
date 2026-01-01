/**
 * Hook System Integration Tests
 *
 * Tests hook registration, priority, chaining, and message transformation.
 *
 * Rules Applied:
 * - No manual adapter registration (TestScenario auto-registers)
 * - No beforeEach/afterEach for adapter setup
 * - Handlers defined inside testCase() using declarative API
 * - scenario.init() only for lifecycle tests
 */

import { describe, expect, it } from "vitest";
import { TestScenario, testCase, AsyncServer, AsyncClient } from "testurio";
import { TcpAdapter } from "@testurio/adapter-tcp";

// ============================================================================
// Message Type Definitions
// ============================================================================

interface TestRequest {
	data: string;
}

interface TestRequestResponse {
	received: string;
	processed: boolean;
}

interface ProxyTestRequest {
	value: number;
}

interface ProxyTestResponse {
	doubled: number;
}

interface LogEvent {
	event: string;
	userId: number;
}

interface OrderRequest {
	orderId: string;
}

interface OrderRequestResponse {
	orderId: string;
	status: string;
}

interface HandlerRequest {
	data: string;
}

interface HandlerRequestResponse {
	success: boolean;
	message: string;
}

type HookMessages = {
	TestRequest: TestRequest;
	TestRequestResponse: TestRequestResponse;
	ProxyTest: ProxyTestRequest;
	ProxyTestResponse: ProxyTestResponse;
	LogEvent: LogEvent;
	OrderRequest: OrderRequest;
	OrderRequestResponse: OrderRequestResponse;
	HandlerRequest: HandlerRequest;
	HandlerRequestResponse: HandlerRequestResponse;
	[key: string]: unknown;
};

// Helper functions for creating TCP components with typed adapters
const createMockServer = (name: string, port: number) =>
	new AsyncServer(name, {
		adapter: new TcpAdapter<HookMessages>(),
		listenAddress: { host: "localhost", port },
	});

const createClient = (name: string, port: number) =>
	new AsyncClient(name, {
		adapter: new TcpAdapter<HookMessages>(),
		targetAddress: { host: "localhost", port },
	});

const createProxyServer = (name: string, listenPort: number, targetPort: number) =>
	new AsyncServer(name, {
		adapter: new TcpAdapter<HookMessages>(),
		listenAddress: { host: "localhost", port: listenPort },
		targetAddress: { host: "localhost", port: targetPort },
	});

describe("Suite 3: Hook System Integration", () => {
	// ============================================================================
	// 3.1 Basic Mock Response
	// ============================================================================
	describe("3.1 Basic Mock Response", () => {
		it("should respond to messages using declarative mock handler", async () => {
			const backendServer = createMockServer("backend", 5110);
			const apiClient = createClient("api", 5110);

			const scenario = new TestScenario({
				name: "Basic Mock Response Test",
				components: [backendServer, apiClient],
			});

			const tc = testCase("Send message and receive response", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.sendMessage("TestRequest", { data: "hello" });

				backend.onMessage("TestRequest").mockEvent("TestRequestResponse", (payload) => ({
					received: payload.data,
					processed: true,
				}));

				api.onEvent("TestRequestResponse").assert((payload) => {
					return payload.received === "hello" && payload.processed === true;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	// ============================================================================
	// 3.2 Message Through Proxy
	// ============================================================================
	describe("3.2 Message Through Proxy", () => {
		it("should route messages through proxy to mock", async () => {
			const backendServer = createMockServer("backend", 5120);
			const gatewayProxy = createProxyServer("gateway", 5121, 5120);
			const apiClient = createClient("api", 5121);

			const scenario = new TestScenario({
				name: "Proxy Routing Test",
				components: [backendServer, gatewayProxy, apiClient],
			});

			const tc = testCase("Send message through proxy", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.sendMessage("ProxyTest", { value: 42 });

				backend.onMessage("ProxyTest").mockEvent("ProxyTestResponse", (payload) => ({
					doubled: payload.value * 2,
				}));

				api.onEvent("ProxyTestResponse").assert((payload) => {
					return payload.doubled === 84;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	// ============================================================================
	// 3.3 Fire-and-Forget Messages
	// ============================================================================
	describe("3.3 Fire-and-Forget Messages", () => {
		it("should handle fire-and-forget messages", async () => {
			const backendServer = createMockServer("backend", 5130);
			const apiClient = createClient("api", 5130);

			const scenario = new TestScenario({
				name: "Fire-and-Forget Test",
				components: [backendServer, apiClient],
			});

			let receivedPayload: LogEvent | undefined;

			const tc = testCase("Send fire-and-forget message", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.sendMessage("LogEvent", { event: "user_login", userId: 123 });
				backend.waitMessage("LogEvent", { timeout: 1000 }).assert((payload) => {
					receivedPayload = payload;
					return true;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(receivedPayload).toMatchObject({
				event: "user_login",
				userId: 123,
			});
		});
	});

	// ============================================================================
	// 3.4 Single Message Type
	// ============================================================================
	describe("3.4 Single Message Type", () => {
		it("should handle single message type correctly", async () => {
			const backendServer = createMockServer("backend", 5140);
			const apiClient = createClient("api", 5140);

			const scenario = new TestScenario({
				name: "Single Message Type Test",
				components: [backendServer, apiClient],
			});

			const tc = testCase("Send order request", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.sendMessage("OrderRequest", { orderId: "ORD-001" });

				backend.onMessage("OrderRequest").mockEvent("OrderRequestResponse", (payload) => ({
					orderId: payload.orderId,
					status: "confirmed",
				}));

				api.onEvent("OrderRequestResponse").assert((payload) => {
					return payload.orderId === "ORD-001" && payload.status === "confirmed";
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	// ============================================================================
	// 3.5 Request with Response Handler
	// ============================================================================
	describe("3.5 Request with Response Handler", () => {
		it("should execute response handler correctly", async () => {
			const backendServer = createMockServer("backend", 5150);
			const apiClient = createClient("api", 5150);

			const scenario = new TestScenario({
				name: "Response Handler Test",
				components: [backendServer, apiClient],
			});

			let handlerCalled = false;

			const tc = testCase("Send request and handle response", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.sendMessage("HandlerRequest", { data: "test" });

				backend.onMessage("HandlerRequest").mockEvent("HandlerRequestResponse", () => ({
					success: true,
					message: "handled",
				}));

				api.waitEvent("HandlerRequestResponse", { timeout: 1000 }).assert((payload) => {
					handlerCalled = true;
					return payload.success === true && payload.message === "handled";
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(handlerCalled).toBe(true);
		});
	});
});
