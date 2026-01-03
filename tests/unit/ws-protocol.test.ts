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

	describe("type", () => {
		it("should have correct type", () => {
			expect(protocol.type).toBe("websocket");
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

	describe("multiple clients", () => {
		it("should handle multiple clients sending messages simultaneously", async () => {
			const protocol1 = new WebSocketProtocol<TestWsService>();
			const protocol2 = new WebSocketProtocol<TestWsService>();
			const protocol3 = new WebSocketProtocol<TestWsService>();

			const receivedMessages: Array<{ data: string }> = [];

			// Start server
			await protocol.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			protocol.onMessage("TestMessage", async (payload) => {
				receivedMessages.push(payload as { data: string });
				return { response: `received-${(payload as { data: string }).data}` };
			});

			// Connect multiple clients
			await protocol1.createClient({ targetAddress: { host: "127.0.0.1", port } });
			await protocol2.createClient({ targetAddress: { host: "127.0.0.1", port } });
			await protocol3.createClient({ targetAddress: { host: "127.0.0.1", port } });

			// Each client sends a message
			await protocol1.sendMessage("TestMessage", { data: "client1" });
			await protocol2.sendMessage("TestMessage", { data: "client2" });
			await protocol3.sendMessage("TestMessage", { data: "client3" });

			// Wait for messages to be processed
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(receivedMessages.length).toBe(3);
			const messages = receivedMessages.map((m) => m.data);
			expect(messages).toContain("client1");
			expect(messages).toContain("client2");
			expect(messages).toContain("client3");

			await protocol1.dispose();
			await protocol2.dispose();
			await protocol3.dispose();
		});

		it("should route responses to correct clients", async () => {
			const protocol1 = new WebSocketProtocol<TestWsService>();
			const protocol2 = new WebSocketProtocol<TestWsService>();

			// Start server
			await protocol.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			protocol.onMessage("TestRequest", async (payload) => {
				const data = (payload as { data: string }).data;
				return { response: `response-for-${data}` };
			});

			// Connect clients
			await protocol1.createClient({ targetAddress: { host: "127.0.0.1", port } });
			await protocol2.createClient({ targetAddress: { host: "127.0.0.1", port } });

			// Send messages and wait for responses
			const response1Promise = protocol1.waitForMessage("TestRequestResponse");
			const response2Promise = protocol2.waitForMessage("TestRequestResponse");

			await protocol1.sendMessage("TestRequest", { data: "msg1" });
			await protocol2.sendMessage("TestRequest", { data: "msg2" });

			const response1 = await response1Promise;
			const response2 = await response2Promise;

			// Each client should receive its own response
			expect((response1.payload as { response: string }).response).toBe("response-for-msg1");
			expect((response2.payload as { response: string }).response).toBe("response-for-msg2");

			await protocol1.dispose();
			await protocol2.dispose();
		});

		it("should handle client disconnection without affecting other clients", async () => {
			const protocol1 = new WebSocketProtocol<TestWsService>();
			const protocol2 = new WebSocketProtocol<TestWsService>();

			// Start server
			await protocol.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			protocol.onMessage("TestRequest", async (payload) => {
				const data = (payload as { data: string }).data;
				return { response: `response-for-${data}` };
			});

			// Connect clients
			await protocol1.createClient({ targetAddress: { host: "127.0.0.1", port } });
			await protocol2.createClient({ targetAddress: { host: "127.0.0.1", port } });

			// Disconnect client1
			await protocol1.closeClient();
			await new Promise((resolve) => setTimeout(resolve, 50));

			// client2 should still work
			const responsePromise = protocol2.waitForMessage("TestRequestResponse");
			await protocol2.sendMessage("TestRequest", { data: "still-working" });
			const response = await responsePromise;

			expect((response.payload as { response: string }).response).toBe("response-for-still-working");

			await protocol1.dispose();
			await protocol2.dispose();
		});
	});
});
