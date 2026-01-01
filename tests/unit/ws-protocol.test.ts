/**
 * WebSocket Protocol Tests
 *
 * Tests use real WebSocket server and client connections.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocketProtocol, type WsServiceDefinition } from "@testurio/protocol-ws";

// Type-safe WebSocket service definition for tests
interface TestWsService extends WsServiceDefinition {
	clientMessages: {
		TestMessage: { data: string };
		TestRequest: { data: string };
		Ping: Record<string, never>;
	};
	serverMessages: {
		TestMessageResponse: { response: string };
		TestRequestResponse: { response: string };
		PingResponse: { pong: boolean };
	};
}

describe("WebSocketProtocol", () => {
	let protocol: WebSocketProtocol<TestWsService>;
	let port: number;

	beforeEach(() => {
		protocol = new WebSocketProtocol<TestWsService>();
		// Use random port to avoid conflicts
		port = 10000 + Math.floor(Math.random() * 50000);
	});

	afterEach(async () => {
		await protocol.dispose();
	});

	describe("characteristics", () => {
		it("should have correct type", () => {
			expect(protocol.type).toBe("websocket");
		});

		it("should have correct characteristics", () => {
			expect(protocol.characteristics).toEqual({
				type: "websocket",
				async: true,
				supportsProxy: true,
				supportsMock: true,
				streaming: true,
				requiresConnection: true,
				bidirectional: true,
			});
		});
	});

	describe("loadSchema", () => {
		it("should load single schema path", async () => {
			const schema = await protocol.loadSchema("path/to/schema.json");

			expect(schema.type).toBe("json-schema");
			expect(schema.content).toEqual({ paths: "path/to/schema.json" });
			expect(schema.validate).toBe(true);
		});

		it("should load multiple schema paths", async () => {
			const schema = await protocol.loadSchema(["path/to/a.json", "path/to/b.json"]);

			expect(schema.type).toBe("json-schema");
			expect(schema.content).toEqual({ paths: "path/to/a.json,path/to/b.json" });
		});
	});

	describe("startServer", () => {
		it("should start server with listen address", async () => {
			await protocol.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			expect(protocol.server.isRunning).toBe(true);
			expect(protocol.server.ref).toBeDefined();
		});
	});

	describe("stopServer", () => {
		it("should stop running server", async () => {
			await protocol.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			await protocol.stopServer();

			expect(protocol.server.isRunning).toBe(false);
			expect(protocol.server.ref).toBeUndefined();
		});

		it("should handle stopping non-existent server gracefully", async () => {
			// Should not throw
			await protocol.stopServer();
		});
	});

	describe("createClient", () => {
		it("should create client connection", async () => {
			await protocol.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			await protocol.createClient({
				targetAddress: { host: "127.0.0.1", port },
			});

			expect(protocol.client.isConnected).toBe(true);
			expect(protocol.client.ref).toBeDefined();
		});
	});

	describe("closeClient", () => {
		it("should close client connection", async () => {
			await protocol.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			await protocol.createClient({
				targetAddress: { host: "127.0.0.1", port },
			});

			await protocol.closeClient();

			expect(protocol.client.isConnected).toBe(false);
			expect(protocol.client.ref).toBeUndefined();
		});

		it("should handle closing non-existent client gracefully", async () => {
			// Should not throw
			await protocol.closeClient();
		});
	});

	describe("sendMessage", () => {
		it("should throw when client not connected", async () => {
			await expect(protocol.sendMessage("TestMessage", { data: "test" }))
				.rejects.toThrow("Client not connected");
		});

		it("should send message successfully", async () => {
			await protocol.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});
			await protocol.createClient({
				targetAddress: { host: "127.0.0.1", port },
			});

			// Should not throw
			await protocol.sendMessage("TestMessage", { data: "test" });
		});
	});

	describe("waitForMessage", () => {
		it("should throw when client not connected", async () => {
			await expect(protocol.waitForMessage("TestMessage"))
				.rejects.toThrow("Client not connected");
		});

		it("should timeout when no message received", async () => {
			await protocol.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			await protocol.createClient({
				targetAddress: { host: "127.0.0.1", port },
			});

			await expect(protocol.waitForMessage("TestMessage", undefined, 50))
				.rejects.toThrow("Timeout waiting for message type: TestMessage");
		});
	});

	describe("message routing", () => {
		it("should route message to server handler", async () => {
			await protocol.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			await protocol.createClient({
				targetAddress: { host: "127.0.0.1", port },
			});

			const handlerFn = vi.fn().mockResolvedValue({ response: "ok" });
			protocol.onMessage("TestRequest", handlerFn);

			// Start waiting for response before sending (response confirms handler was called)
			const responsePromise = protocol.waitForMessage("TestRequestResponse");

			await protocol.sendMessage("TestRequest", { data: "test" });

			// Wait for response to ensure handler was called
			await responsePromise;

			expect(handlerFn).toHaveBeenCalledWith({ data: "test" });
		});

		it("should route response back to client", async () => {
			await protocol.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			await protocol.createClient({
				targetAddress: { host: "127.0.0.1", port },
			});

			protocol.onMessage("Ping", async () => ({ pong: true }));

			// Start waiting for response
			const responsePromise = protocol.waitForMessage("PingResponse");

			// Send message
			await protocol.sendMessage("Ping", {});

			const response = await responsePromise;
			expect(response.payload).toEqual({ pong: true });
		});
	});

	describe("dispose", () => {
		it("should clean up all resources", async () => {
			await protocol.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			await protocol.createClient({
				targetAddress: { host: "127.0.0.1", port },
			});

			await protocol.dispose();

			expect(protocol.server.isRunning).toBe(false);
			expect(protocol.client.isConnected).toBe(false);
		});
	});
});
