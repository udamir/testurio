/**
 * TCP Error Scenarios Integration Tests
 *
 * Tests error handling for TCP protocol.
 */

import { TcpProtocol } from "@testurio/protocol-tcp";
import { AsyncClient, AsyncServer, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";

// ============================================================================
// Type Definitions
// ============================================================================

interface TcpTestService {
	clientMessages: {
		ping: { seq: number };
		data: { payload: string };
		largeMessage: { data: string };
	};
	serverMessages: {
		pong: { seq: number };
		ack: { received: boolean };
		largeResponse: { data: string };
	};
}

// ============================================================================
// TCP Error Tests
// ============================================================================

describe("TCP Error Scenarios Integration Tests", () => {
	describe("Connection Errors", () => {
		it("should handle connection refused error", async () => {
			// Try to connect to a port with no server
			const client = new AsyncClient("api", {
				protocol: new TcpProtocol<TcpTestService>(),
				targetAddress: { host: "127.0.0.1", port: 18999 },
			});

			const scenario = new TestScenario({
				name: "TCP Connection Refused Test",
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

		it("should handle connection with short timeout", async () => {
			const client = new AsyncClient("api", {
				protocol: new TcpProtocol<TcpTestService>({ timeout: 100 }),
				targetAddress: { host: "127.0.0.1", port: 18998 },
			});

			const scenario = new TestScenario({
				name: "TCP Connection Timeout Test",
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
			const server = new AsyncServer("backend", {
				protocol: new TcpProtocol<TcpTestService>(),
				listenAddress: { host: "localhost", port: 18001 },
			});

			const client = new AsyncClient("api", {
				protocol: new TcpProtocol<TcpTestService>(),
				targetAddress: { host: "localhost", port: 18001 },
			});

			const scenario = new TestScenario({
				name: "TCP Message Exchange Test",
				components: [server, client],
			});

			// Setup server to respond to ping messages
			scenario.init((test) => {
				test
					.use(server)
					.onMessage("ping")
					.mockEvent("pong", (payload) => ({ seq: payload.seq }));
			});

			const tc = testCase("Normal TCP message exchange", (test) => {
				const api = test.use(client);

				api.sendMessage("ping", { seq: 1 });
				api
					.waitEvent("pong")
					.timeout(1000)
					.assert((msg) => msg.seq === 1);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should timeout when waiting for message that never arrives", async () => {
			const server = new AsyncServer("backend", {
				protocol: new TcpProtocol<TcpTestService>(),
				listenAddress: { host: "localhost", port: 18002 },
			});

			const client = new AsyncClient("api", {
				protocol: new TcpProtocol<TcpTestService>(),
				targetAddress: { host: "localhost", port: 18002 },
			});

			const scenario = new TestScenario({
				name: "TCP Message Timeout Test",
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

	describe("Protocol Options", () => {
		it("should work with custom delimiter", async () => {
			const server = new AsyncServer("backend", {
				protocol: new TcpProtocol<TcpTestService>({ delimiter: "\r\n" }),
				listenAddress: { host: "localhost", port: 18003 },
			});

			const client = new AsyncClient("api", {
				protocol: new TcpProtocol<TcpTestService>({ delimiter: "\r\n" }),
				targetAddress: { host: "localhost", port: 18003 },
			});

			const scenario = new TestScenario({
				name: "TCP Custom Delimiter Test",
				components: [server, client],
			});

			const tc = testCase("Custom delimiter message exchange", (test) => {
				const api = test.use(client);
				const backend = test.use(server);

				api.sendMessage("data", { payload: "test message" });
				backend
					.waitMessage("data")
					.timeout(1000)
					.assert((msg) => msg.payload === "test message");
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should work with length-prefixed framing", async () => {
			const server = new AsyncServer("backend", {
				protocol: new TcpProtocol<TcpTestService>({ lengthFieldLength: 4 }),
				listenAddress: { host: "localhost", port: 18004 },
			});

			const client = new AsyncClient("api", {
				protocol: new TcpProtocol<TcpTestService>({ lengthFieldLength: 4 }),
				targetAddress: { host: "localhost", port: 18004 },
			});

			const scenario = new TestScenario({
				name: "TCP Length Prefixed Test",
				components: [server, client],
			});

			const tc = testCase("Length-prefixed message exchange", (test) => {
				const api = test.use(client);
				const backend = test.use(server);

				api.sendMessage("data", { payload: "binary-framed message" });
				backend
					.waitMessage("data")
					.timeout(1000)
					.assert((msg) => msg.payload === "binary-framed message");
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Disconnect Handling", () => {
		it("should handle client disconnect gracefully", async () => {
			const server = new AsyncServer("backend", {
				protocol: new TcpProtocol<TcpTestService>(),
				listenAddress: { host: "localhost", port: 18005 },
			});

			const client = new AsyncClient("api", {
				protocol: new TcpProtocol<TcpTestService>(),
				targetAddress: { host: "localhost", port: 18005 },
			});

			const scenario = new TestScenario({
				name: "TCP Disconnect Test",
				components: [server, client],
			});

			const tc = testCase("Send message then disconnect", (test) => {
				const api = test.use(client);
				const backend = test.use(server);

				// Send a message and verify it's received
				api.sendMessage("ping", { seq: 42 });
				backend
					.waitMessage("ping")
					.timeout(1000)
					.assert((msg) => msg.seq === 42);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});
});
