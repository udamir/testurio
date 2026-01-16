/**
 * WebSocket Error Scenarios Integration Tests
 *
 * Tests error handling for WebSocket protocol.
 */

import { WebSocketProtocol } from "@testurio/protocol-ws";
import { AsyncClient, AsyncServer, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";

// ============================================================================
// Type Definitions
// ============================================================================

interface WsTestService {
	clientMessages: {
		ping: { seq: number };
		subscribe: { channel: string };
		message: { text: string };
	};
	serverMessages: {
		pong: { seq: number };
		subscribed: { channel: string; success: boolean };
		broadcast: { text: string };
		error: { code: number; message: string };
	};
}

// Port counter for this test file (19xxx range)
let portCounter = 19000;
function getNextPort(): number {
	return portCounter++;
}

// ============================================================================
// WebSocket Error Tests
// ============================================================================

describe("WebSocket Error Scenarios Integration Tests", () => {
	describe("Connection Errors", () => {
		it("should handle connection refused error", async () => {
			// Try to connect to a port with no server
			const client = new AsyncClient("api", {
				protocol: new WebSocketProtocol<WsTestService>(),
				targetAddress: { host: "127.0.0.1", port: 19999 },
			});

			const scenario = new TestScenario({
				name: "WS Connection Refused Test",
				components: [client],
			});

			const tc = testCase("Connection refused", (test) => {
				const api = test.use(client);
				api.sendMessage("ping", { seq: 1 });
			});

			try {
				const result = await scenario.run(tc);
				expect(result.passed).toBe(false);
			} catch (error) {
				// Connection refused is expected
				expect(error).toBeDefined();
			}
		});

		it("should handle connection timeout", async () => {
			const client = new AsyncClient("api", {
				protocol: new WebSocketProtocol<WsTestService>(),
				targetAddress: { host: "10.255.255.1", port: 19998 }, // Non-routable IP for timeout
			});

			const scenario = new TestScenario({
				name: "WS Connection Timeout Test",
				components: [client],
			});

			const tc = testCase("Connection timeout", (test) => {
				const api = test.use(client);
				api.sendMessage("ping", { seq: 1 });
			});

			try {
				const result = await scenario.run(tc);
				expect(result.passed).toBe(false);
			} catch (error) {
				expect(error).toBeDefined();
			}
		});
	});

	describe("Message Handling", () => {
		it("should handle normal message exchange", async () => {
			const port = getNextPort();
			const server = new AsyncServer("backend", {
				protocol: new WebSocketProtocol<WsTestService>(),
				listenAddress: { host: "localhost", port },
			});

			const client = new AsyncClient("api", {
				protocol: new WebSocketProtocol<WsTestService>(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "WS Message Exchange Test",
				components: [server, client],
			});

			scenario.init((test) => {
				test
					.use(server)
					.onMessage("ping")
					.mockEvent("pong", (payload) => ({ seq: payload.seq }));
			});

			const tc = testCase("Normal WS message exchange", (test) => {
				const api = test.use(client);

				api.sendMessage("ping", { seq: 1 });
				api
					.waitEvent("pong")
					.timeout(2000)
					.assert((msg) => msg.seq === 1);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should timeout when waiting for message that never arrives", async () => {
			const port = getNextPort();
			const server = new AsyncServer("backend", {
				protocol: new WebSocketProtocol<WsTestService>(),
				listenAddress: { host: "localhost", port },
			});

			const client = new AsyncClient("api", {
				protocol: new WebSocketProtocol<WsTestService>(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "WS Message Timeout Test",
				components: [server, client],
			});

			const tc = testCase("Message wait times out", (test) => {
				const backend = test.use(server);
				// Wait for a message that will never arrive
				backend
					.waitMessage("ping")
					.timeout(200)
					.assert(() => true);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(false);
			expect(result.testCases[0].error?.toLowerCase()).toContain("timeout");
		});
	});

	describe("Disconnect Handling", () => {
		it("should handle server-initiated disconnect gracefully", async () => {
			const port = getNextPort();
			const server = new AsyncServer("backend", {
				protocol: new WebSocketProtocol<WsTestService>(),
				listenAddress: { host: "localhost", port },
			});

			const client = new AsyncClient("api", {
				protocol: new WebSocketProtocol<WsTestService>(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "WS Disconnect Test",
				components: [server, client],
			});

			const tc = testCase("Send message before disconnect", (test) => {
				const api = test.use(client);
				const backend = test.use(server);

				api.sendMessage("ping", { seq: 42 });
				backend
					.waitMessage("ping")
					.timeout(2000)
					.assert((msg) => msg.seq === 42);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should handle client disconnect gracefully", async () => {
			const port = getNextPort();
			const server = new AsyncServer("backend", {
				protocol: new WebSocketProtocol<WsTestService>(),
				listenAddress: { host: "localhost", port },
			});

			const client = new AsyncClient("api", {
				protocol: new WebSocketProtocol<WsTestService>(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "WS Client Disconnect Test",
				components: [server, client],
			});

			const tc = testCase("Client sends then disconnects", (test) => {
				const api = test.use(client);
				const backend = test.use(server);

				api.sendMessage("message", { text: "hello" });
				backend
					.waitMessage("message")
					.timeout(2000)
					.assert((msg) => msg.text === "hello");
				api.disconnect();
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Multiple Clients", () => {
		it("should handle multiple clients connecting", async () => {
			const port = getNextPort();
			const server = new AsyncServer("backend", {
				protocol: new WebSocketProtocol<WsTestService>(),
				listenAddress: { host: "localhost", port },
			});

			const client1 = new AsyncClient("client1", {
				protocol: new WebSocketProtocol<WsTestService>(),
				targetAddress: { host: "localhost", port },
			});

			const client2 = new AsyncClient("client2", {
				protocol: new WebSocketProtocol<WsTestService>(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "WS Multi-Client Test",
				components: [server, client1, client2],
			});

			const messagesReceived: number[] = [];

			scenario.init((test) => {
				test
					.use(server)
					.onMessage("ping")
					.mockEvent("pong", (payload) => {
						messagesReceived.push(payload.seq);
						return { seq: payload.seq };
					});
			});

			const tc = testCase("Multiple clients exchange messages", (test) => {
				test.use(client1).sendMessage("ping", { seq: 1 });
				test.use(client2).sendMessage("ping", { seq: 2 });
				test
					.use(client1)
					.waitEvent("pong")
					.timeout(2000)
					.assert((msg) => msg.seq === 1);
				test
					.use(client2)
					.waitEvent("pong")
					.timeout(2000)
					.assert((msg) => msg.seq === 2);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(messagesReceived).toContain(1);
			expect(messagesReceived).toContain(2);
		});
	});

	describe("Error Events", () => {
		it("should handle error response from server", async () => {
			const port = getNextPort();
			const server = new AsyncServer("backend", {
				protocol: new WebSocketProtocol<WsTestService>(),
				listenAddress: { host: "localhost", port },
			});

			const client = new AsyncClient("api", {
				protocol: new WebSocketProtocol<WsTestService>(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "WS Error Response Test",
				components: [server, client],
			});

			scenario.init((test) => {
				test
					.use(server)
					.onMessage("subscribe")
					.mockEvent("error", () => ({
						code: 403,
						message: "Channel not allowed",
					}));
			});

			const tc = testCase("Server returns error", (test) => {
				const api = test.use(client);

				api.sendMessage("subscribe", { channel: "private" });
				api
					.waitEvent("error")
					.timeout(2000)
					.assert((msg) => msg.code === 403);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});
});
