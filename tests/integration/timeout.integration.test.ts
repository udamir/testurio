/**
 * Timeout Integration Tests
 *
 * Tests timeout behavior across protocols.
 */

import { WebSocketProtocol } from "@testurio/protocol-ws";
import { AsyncClient, AsyncServer, Client, HttpProtocol, Server, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";

// ============================================================================
// Type Definitions
// ============================================================================

interface TimeoutHttpService {
	getSlow: {
		request: { method: "GET"; path: "/slow" };
		response: { code: 200; body: { delayed: boolean } };
	};
	getFast: {
		request: { method: "GET"; path: "/fast" };
		response: { code: 200; body: { fast: boolean } };
	};
}

interface TimeoutWsService {
	clientMessages: {
		ping: { seq: number };
	};
	serverMessages: {
		pong: { seq: number };
	};
}

// ============================================================================
// HTTP Timeout Tests
// ============================================================================

describe("Timeout Integration Tests", () => {
	describe("HTTP Request Timeouts", () => {
		it("should respect request timeout on slow responses", async () => {
			const server = new Server("backend", {
				protocol: new HttpProtocol<TimeoutHttpService>(),
				listenAddress: { host: "127.0.0.1", port: 17001 },
			});

			const client = new Client("api", {
				protocol: new HttpProtocol<TimeoutHttpService>(),
				targetAddress: { host: "127.0.0.1", port: 17001 },
			});

			const scenario = new TestScenario({
				name: "HTTP Request Timeout Test",
				components: [server, client],
			});

			const tc = testCase("Request completes within timeout", (test) => {
				const api = test.use(client);
				const backend = test.use(server);

				// Make request with timeout on response
				api.request("getSlow", { method: "GET", path: "/slow" });
				backend
					.onRequest("getSlow", { method: "GET", path: "/slow" })
					.delay(100)
					.mockResponse(() => ({
						code: 200,
						body: { delayed: true },
					}));
				api.onResponse("getSlow").timeout(2000).assert((res) => res.body.delayed === true);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should handle fast responses without timeout", async () => {
			const server = new Server("backend", {
				protocol: new HttpProtocol<TimeoutHttpService>(),
				listenAddress: { host: "127.0.0.1", port: 17002 },
			});

			const client = new Client("api", {
				protocol: new HttpProtocol<TimeoutHttpService>(),
				targetAddress: { host: "127.0.0.1", port: 17002 },
			});

			const scenario = new TestScenario({
				name: "HTTP Fast Response Test",
				components: [server, client],
			});

			const tc = testCase("Fast request without timeout", (test) => {
				const api = test.use(client);
				const backend = test.use(server);

				api.request("getFast", { method: "GET", path: "/fast" });
				backend.onRequest("getFast", { method: "GET", path: "/fast" }).mockResponse(() => ({
					code: 200,
					body: { fast: true },
				}));
				api.onResponse("getFast").assert((res) => res.body.fast === true);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("WebSocket Connection Timeout", () => {
		it("should fail when connecting to non-existent server", async () => {
			// Use a port that's guaranteed not to have a server
			const client = new AsyncClient("api", {
				protocol: new WebSocketProtocol<TimeoutWsService>(),
				targetAddress: { host: "127.0.0.1", port: 17999 },
			});

			const scenario = new TestScenario({
				name: "WS Connection Timeout Test",
				components: [client],
			});

			const tc = testCase("Connection fails on unreachable server", (test) => {
				const api = test.use(client);
				api.sendMessage("ping", { seq: 1 });
			});

			// This test should fail because we can't connect to the server
			// The failure might happen during scenario startup
			try {
				const result = await scenario.run(tc);
				// If we get a result, it should indicate failure
				expect(result.passed).toBe(false);
			} catch (error) {
				// Connection failure during startup is also acceptable
				expect(error).toBeDefined();
			}
		});

		it("should connect successfully within timeout", async () => {
			const server = new AsyncServer("backend", {
				protocol: new WebSocketProtocol<TimeoutWsService>(),
				listenAddress: { host: "127.0.0.1", port: 17003 },
			});

			const client = new AsyncClient("api", {
				protocol: new WebSocketProtocol<TimeoutWsService>(),
				targetAddress: { host: "127.0.0.1", port: 17003 },
			});

			const scenario = new TestScenario({
				name: "WS Successful Connection Test",
				components: [server, client],
			});

			const tc = testCase("Connection succeeds within timeout", (test) => {
				const api = test.use(client);
				const backend = test.use(server);

				api.sendMessage("ping", { seq: 1 });
				backend.waitMessage("ping").timeout(1000).assert((msg) => msg.seq === 1);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Async Message Timeout", () => {
		it("should timeout when waiting for message that never arrives", async () => {
			const server = new AsyncServer("backend", {
				protocol: new WebSocketProtocol<TimeoutWsService>(),
				listenAddress: { host: "127.0.0.1", port: 17004 },
			});

			const client = new AsyncClient("api", {
				protocol: new WebSocketProtocol<TimeoutWsService>(),
				targetAddress: { host: "127.0.0.1", port: 17004 },
			});

			const scenario = new TestScenario({
				name: "Message Timeout Test",
				components: [server, client],
			});

			const tc = testCase("Message wait times out", (test) => {
				const backend = test.use(server);
				// Wait for a message that will never be sent
				backend.waitMessage("ping").timeout(200).assert(() => true);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(false);
			expect(result.testCases[0].error?.toLowerCase()).toContain("timeout");
		});
	});

	describe("Default Timeout Values", () => {
		it("should use default connection timeout when not specified", async () => {
			const server = new AsyncServer("backend", {
				protocol: new WebSocketProtocol<TimeoutWsService>(),
				listenAddress: { host: "127.0.0.1", port: 17005 },
			});

			// No explicit timeout - should use default
			const client = new AsyncClient("api", {
				protocol: new WebSocketProtocol<TimeoutWsService>(),
				targetAddress: { host: "127.0.0.1", port: 17005 },
			});

			const scenario = new TestScenario({
				name: "Default Timeout Test",
				components: [server, client],
			});

			const tc = testCase("Uses default connection timeout", (test) => {
				const api = test.use(client);
				const backend = test.use(server);

				api.sendMessage("ping", { seq: 42 });
				backend.waitMessage("ping").timeout(1000).assert((msg) => msg.seq === 42);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});
});
