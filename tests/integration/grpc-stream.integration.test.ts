/**
 * gRPC Streaming Protocol Chain Integration Tests
 *
 * Tests the complete component chain: Client → Proxy → Mock
 * Using async (streaming) gRPC protocol with real connections.
 */

import { GrpcStreamProtocol } from "@testurio/protocol-grpc";
import { AsyncClient, AsyncServer, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";

// ============================================================================
// Message Type Definitions
// ============================================================================

interface PingMessage {
	request_id: string;
	ping: { timestamp: number };
}

interface PongMessage {
	request_id: string;
	pong: { timestamp: number };
}

interface DataMessage {
	request_id: string;
	data: { key: string; value?: Buffer; status?: string };
}

interface SubscribeMessage {
	request_id: string;
	subscribe: { channel: string; topics?: string[]; success?: boolean };
}

interface ErrorMessage {
	request_id: string;
	error: { code: number; message: string };
}

// Service definition for type-safe gRPC streaming
// Uses separate clientMessages and serverMessages maps
interface GrpcStreamMessages {
	clientMessages: {
		ping: PingMessage;
		data: DataMessage;
		subscribe: SubscribeMessage;
		error: ErrorMessage;
	};
	serverMessages: {
		pong: PongMessage;
		data: DataMessage;
		subscribe: SubscribeMessage;
		error: ErrorMessage;
	};
}

// Proto file path for test service
const TEST_PROTO = "tests/proto/test-service.proto";
const STREAM_SERVICE = "test.v1.StreamTestService";
const STREAM_METHOD = "DeliveryMessage";

// Helper functions for creating components with typed adapters
const createMockServer = (name: string, port: number) =>
	new AsyncServer(name, {
		protocol: new GrpcStreamProtocol<GrpcStreamMessages>({ schema: TEST_PROTO }),
		listenAddress: { host: "127.0.0.1", port },
	});

const createClient = (name: string, port: number) =>
	new AsyncClient(name, {
		protocol: new GrpcStreamProtocol<GrpcStreamMessages>({
			schema: TEST_PROTO,
			serviceName: STREAM_SERVICE,
			methodName: STREAM_METHOD,
		}),
		targetAddress: { host: "127.0.0.1", port },
	});

const createProxyServer = (name: string, listenPort: number, targetPort: number) =>
	new AsyncServer(name, {
		protocol: new GrpcStreamProtocol<GrpcStreamMessages>({ schema: TEST_PROTO }),
		listenAddress: { host: "127.0.0.1", port: listenPort },
		targetAddress: { host: "127.0.0.1", port: targetPort },
	});

describe("gRPC Streaming Protocol Chain: Client → Mock", () => {
	// ============================================================
	// 4.1 Basic Streaming Flow
	// ============================================================
	describe("4.1 Basic Streaming Flow", () => {
		it("should route streaming message to mock and receive response", async () => {
			const backendServer = createMockServer("backend", 5202);
			const apiClient = createClient("api", 5202);

			const scenario = new TestScenario({
				name: "Basic gRPC Stream Chain Test",
				components: [backendServer, apiClient],
			});

			const tc = testCase("Send ping request through chain", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.sendMessage("ping", {
					request_id: "REQ-001",
					ping: { timestamp: Date.now() },
				});

				backend.onMessage("ping").mockEvent("pong", (payload) => {
					return { request_id: payload.request_id, pong: { timestamp: payload.ping.timestamp } };
				});

				api.onEvent("pong").assert((payload) => {
					return payload.request_id === "REQ-001" && payload.pong?.timestamp !== undefined;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should handle multiple streaming messages", async () => {
			const backendServer = createMockServer("backend", 5212);
			const apiClient = createClient("api", 5212);

			const scenario = new TestScenario({
				name: "Multiple Stream Messages Test",
				components: [backendServer, apiClient],
			});

			const tc = testCase("Send multiple stream messages", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.sendMessage("data", {
					request_id: "DATA-001",
					data: { key: "test-key", value: Buffer.from("test-value") },
				});

				backend.onMessage("data").mockEvent("data", (payload) => ({
					request_id: payload.request_id,
					data: { key: payload.data.key, value: Buffer.from("response"), status: "ok" },
				}));

				api.onEvent("data").assert((payload) => {
					return payload.request_id === "DATA-001" && payload.data?.status === "ok";
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	// ============================================================
	// 4.2 Bidirectional Streaming
	// ============================================================
	describe("4.2 Bidirectional Streaming", () => {
		it("should handle subscribe request and receive confirmation", async () => {
			const backendServer = createMockServer("backend", 5220);
			const apiClient = createClient("api", 5220);

			const scenario = new TestScenario({
				name: "Bidirectional Stream Test",
				components: [backendServer, apiClient],
			});

			const tc = testCase("Subscribe and receive confirmation", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.sendMessage("subscribe", {
					request_id: "SUB-001",
					subscribe: { channel: "quotes", topics: ["EURUSD", "GBPUSD"] },
				});

				backend.onMessage("subscribe").mockEvent("subscribe", (payload) => ({
					request_id: payload.request_id,
					subscribe: { channel: "quotes", success: true },
				}));

				api.onEvent("subscribe").assert((payload) => {
					return payload.request_id === "SUB-001" && payload.subscribe?.success === true;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	// ============================================================
	// 4.3 Direct Message Flow
	// ============================================================
	describe("4.3 Direct Message Flow", () => {
		it("should forward streaming messages to backend", async () => {
			const backendServer = createMockServer("backend", 5232);
			const apiClient = createClient("api", 5232);

			const scenario = new TestScenario({
				name: "Direct Stream Test",
				components: [backendServer, apiClient],
			});

			const tc = testCase("Send message to backend", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.sendMessage("ping", {
					request_id: "DIR-001",
					ping: { timestamp: 1234567890 },
				});

				backend.onMessage("ping").mockEvent("pong", (payload) => ({
					request_id: payload.request_id,
					pong: { timestamp: payload.ping.timestamp },
				}));

				api.onEvent("pong").assert((payload) => {
					return payload.request_id === "DIR-001" && payload.pong?.timestamp === 1234567890;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	// ============================================================
	// 4.4 Multiple Message Types
	// ============================================================
	describe("4.4 Multiple Message Types", () => {
		it("should handle different streaming message types correctly", async () => {
			const backendServer = createMockServer("backend", 5240);
			const apiClient = createClient("api", 5240);

			const scenario = new TestScenario({
				name: "Multiple Stream Message Types Test",
				components: [backendServer, apiClient],
			});

			const tc = testCase("Send data request", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.sendMessage("data", {
					request_id: "ACC-001",
					data: { key: "account", value: Buffer.from("get-balance") },
				});

				backend.onMessage("data").mockEvent("data", (payload) => {
					return {
						request_id: payload.request_id,
						data: { key: "account", value: Buffer.from("50000"), status: "success" },
					};
				});

				api.onEvent("data").assert((payload) => {
					return payload.request_id === "ACC-001" && payload.data?.status === "success";
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	// ============================================================
	// 4.5 Init/Stop Lifecycle
	// ============================================================
	describe("4.5 Init/Stop Lifecycle", () => {
		it("should execute init handler before streaming test cases", async () => {
			const backendServer = createMockServer("backend", 5250);
			const apiClient = createClient("api", 5250);

			const scenario = new TestScenario({
				name: "Stream Init Lifecycle Test",
				components: [backendServer, apiClient],
			});

			scenario.init((test) => {
				const backend = test.use(backendServer);
				// Use request data in response to verify correlation
				backend.onMessage("ping").mockEvent("pong", (payload) => ({
					request_id: payload.request_id, // Echo back request_id
					pong: { timestamp: payload.ping.timestamp },
				}));
			});

			const tc = testCase("Verify init ran for streaming", (test) => {
				const api = test.use(apiClient);

				api.sendMessage("ping", {
					request_id: "init-test",
					ping: { timestamp: 1234567890 },
				});
				api.onEvent("pong").assert((payload) => {
					return payload.request_id === "init-test" && payload.pong?.timestamp === 1234567890;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	// ============================================================
	// 4.6 Error Handling
	// ============================================================
	describe("4.6 Error Handling", () => {
		it("should handle streaming errors gracefully", async () => {
			const backendServer = createMockServer("backend", 5260);
			const apiClient = createClient("api", 5260);

			const scenario = new TestScenario({
				name: "Stream Error Handling Test",
				components: [backendServer, apiClient],
			});

			const tc = testCase("Send request and receive error response", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.sendMessage("data", {
					request_id: "ERR-001",
					data: { key: "invalid", value: Buffer.from("") },
				});

				// Use request data in response to verify correlation - echo back request_id
				backend.onMessage("data").mockEvent("error", (payload) => ({
					request_id: payload.request_id,
					error: { code: 400, message: "Invalid request" },
				}));

				// Verify the response correlates with the request by checking echoed request_id
				api.onEvent("error").assert((payload) => {
					return (
						payload.request_id === "ERR-001" &&
						payload.error?.code === 400 &&
						payload.error?.message === "Invalid request"
					);
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});
});

describe("gRPC Streaming Protocol Chain: Client → Proxy → Mock", () => {
	// ============================================================
	// 4.7 Proxy Forwarding (Streaming)
	// ============================================================
	describe("4.7 Proxy Forwarding (Streaming)", () => {
		it("should forward streaming messages through proxy to backend", async () => {
			const backendServer = createMockServer("backend", 5270);
			const gatewayProxy = createProxyServer("gateway", 5271, 5270);
			const apiClient = createClient("api", 5271);

			const scenario = new TestScenario({
				name: "gRPC Stream Proxy Chain Test",
				components: [backendServer, gatewayProxy, apiClient],
			});

			const tc = testCase("Forward stream message through proxy", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.sendMessage("ping", {
					request_id: "REQ-PROXY-001",
					ping: { timestamp: 9999999 },
				});

				backend.onMessage("ping").mockEvent("pong", (payload) => ({
					request_id: payload.request_id,
					pong: { timestamp: payload.ping.timestamp },
				}));

				api.onEvent("pong").assert((payload) => {
					return payload.request_id === "REQ-PROXY-001" && payload.pong?.timestamp === 9999999;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should allow proxy to intercept streaming messages", async () => {
			const backendServer = createMockServer("backend", 5272);
			const gatewayProxy = createProxyServer("gateway", 5273, 5272);
			const apiClient = createClient("api", 5273);

			const scenario = new TestScenario({
				name: "gRPC Stream Proxy Intercept Test",
				components: [backendServer, gatewayProxy, apiClient],
			});

			let backendReceived = false;

			const tc = testCase("Proxy intercepts stream message", (test) => {
				const api = test.use(apiClient);
				const gateway = test.use(gatewayProxy);
				const backend = test.use(backendServer);

				api.sendMessage("subscribe", {
					request_id: "AUTH-001",
					subscribe: { channel: "private", topics: ["secret"] },
				});

				gateway.onMessage("subscribe").mockEvent("error", () => ({
					request_id: "AUTH-001",
					error: { code: 403, message: "Access denied - blocked by proxy" },
				}));

				backend.onMessage("subscribe").mockEvent("subscribe", () => {
					backendReceived = true;
					return { request_id: "AUTH-001", subscribe: { channel: "private", success: true } };
				});

				api.onEvent("error").assert((payload) => {
					return payload.error?.code === 403 && payload.error?.message.includes("blocked by proxy");
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(backendReceived).toBe(false);
		});

		it("should handle bidirectional streaming through proxy", async () => {
			const backendServer = createMockServer("backend", 5274);
			const gatewayProxy = createProxyServer("gateway", 5275, 5274);
			const apiClient = createClient("api", 5275);

			const scenario = new TestScenario({
				name: "gRPC Bidirectional Stream Proxy Test",
				components: [backendServer, gatewayProxy, apiClient],
			});

			const tc = testCase("Bidirectional stream through proxy", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.sendMessage("subscribe", {
					request_id: "SUB-PROXY-001",
					subscribe: { channel: "prices", topics: ["EURUSD", "GBPUSD", "USDJPY"] },
				});

				backend.onMessage("subscribe").mockEvent("subscribe", (payload) => ({
					request_id: payload.request_id,
					subscribe: { channel: "prices", success: true },
				}));

				api.onEvent("subscribe").assert((payload) => {
					return (
						payload.request_id === "SUB-PROXY-001" &&
						payload.subscribe?.channel === "prices" &&
						payload.subscribe?.success === true
					);
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});
});
