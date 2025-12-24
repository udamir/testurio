/**
 * WebSocket Adapter Tests
 *
 * Tests use real WebSocket server and client connections.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocketAdapter } from "@testurio/adapter-ws";

describe("WebSocketAdapter", () => {
	let adapter: WebSocketAdapter;
	let port: number;

	beforeEach(() => {
		adapter = new WebSocketAdapter();
		// Use random port to avoid conflicts
		port = 10000 + Math.floor(Math.random() * 50000);
	});

	afterEach(async () => {
		await adapter.dispose();
	});

	describe("characteristics", () => {
		it("should have correct type", () => {
			expect(adapter.type).toBe("websocket");
		});

		it("should have correct characteristics", () => {
			expect(adapter.characteristics).toEqual({
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
			const schema = await adapter.loadSchema("path/to/schema.json");

			expect(schema.type).toBe("json-schema");
			expect(schema.content).toEqual({ paths: "path/to/schema.json" });
			expect(schema.validate).toBe(true);
		});

		it("should load multiple schema paths", async () => {
			const schema = await adapter.loadSchema(["path/to/a.json", "path/to/b.json"]);

			expect(schema.type).toBe("json-schema");
			expect(schema.content).toEqual({ paths: "path/to/a.json,path/to/b.json" });
		});
	});

	describe("startServer", () => {
		it("should start server with listen address", async () => {
			const handle = await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			expect(handle.id).toMatch(/^ws-server-/);
			expect(handle.type).toBe("websocket");
			expect(handle.address).toEqual({ host: "127.0.0.1", port });
			expect(handle.isRunning).toBe(true);
		});

		it("should start proxy server with target address", async () => {
			const handle = await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
				targetAddress: { host: "backend", port: 9090 },
			});

			expect(handle.isRunning).toBe(true);
			expect(handle._internal.isProxy).toBe(true);
			expect(handle._internal.targetAddress).toEqual({ host: "backend", port: 9090 });
		});

		it("should initialize empty connections map", async () => {
			const handle = await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			expect(handle._internal.connections.size).toBe(0);
		});
	});

	describe("stopServer", () => {
		it("should stop running server", async () => {
			const handle = await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			await adapter.stopServer(handle);

			expect(handle.isRunning).toBe(false);
		});

		it("should throw for unknown server", async () => {
			await expect(adapter.stopServer({
				id: "unknown",
				type: "websocket",
				address: { host: "127.0.0.1", port },
				isRunning: true,
			})).rejects.toThrow("Server unknown not found");
		});
	});

	describe("createClient", () => {
		it("should create client with ws:// URL", async () => {
			await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			const handle = await adapter.createClient({
				targetAddress: { host: "127.0.0.1", port },
			});

			expect(handle.id).toMatch(/^ws-client-/);
			expect(handle.type).toBe("websocket");
			expect(handle.isConnected).toBe(true);
			expect(handle._internal.url).toBe(`ws://127.0.0.1:${port}`);
		});

		it("should include path in URL", async () => {
			await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			const handle = await adapter.createClient({
				targetAddress: { host: "127.0.0.1", port, path: "/ws/v1" },
			});

			expect(handle._internal.url).toBe(`ws://127.0.0.1:${port}/ws/v1`);
		});

		it("should initialize empty message queue", async () => {
			await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			const handle = await adapter.createClient({
				targetAddress: { host: "127.0.0.1", port },
			});

			expect(handle._internal.messageQueue).toEqual([]);
			expect(handle._internal.pendingMessages.size).toBe(0);
		});
	});

	describe("closeClient", () => {
		it("should close client connection", async () => {
			await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			const handle = await adapter.createClient({
				targetAddress: { host: "127.0.0.1", port },
			});

			await adapter.closeClient(handle);

			expect(handle.isConnected).toBe(false);
		});

		it("should throw for unknown client", async () => {
			await expect(adapter.closeClient({
				id: "unknown",
				type: "websocket",
				address: { host: "127.0.0.1", port },
				isConnected: true,
			})).rejects.toThrow("Client unknown not found");
		});

		it("should reject pending messages on close", async () => {
			await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			const handle = await adapter.createClient({
				targetAddress: { host: "127.0.0.1", port },
			});

			const rejectFn = vi.fn();
			const timeoutHandle = setTimeout(() => {}, 10000);
			handle._internal.pendingMessages.set("pending-1", {
				resolve: vi.fn(),
				reject: rejectFn,
				messageType: "TestMessage",
				timeout: timeoutHandle,
			});

			await adapter.closeClient(handle);

			expect(rejectFn).toHaveBeenCalledWith(expect.any(Error));
			expect(rejectFn.mock.calls[0][0].message).toBe("Client disconnected");
		});
	});

	describe("sendMessage", () => {
		it("should throw for unknown client", async () => {
			await expect(adapter.sendMessage(
				{ id: "unknown", type: "websocket", address: { host: "127.0.0.1", port }, isConnected: true },
				"TestMessage",
				{ data: "test" },
			)).rejects.toThrow("Client unknown not found");
		});

		it("should throw for closed client", async () => {
			await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			const handle = await adapter.createClient({
				targetAddress: { host: "127.0.0.1", port },
			});
			await adapter.closeClient(handle);

			await expect(adapter.sendMessage(handle, "TestMessage", {}))
				.rejects.toThrow("not found");
		});

		it("should send message successfully", async () => {
			await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});
			const client = await adapter.createClient({
				targetAddress: { host: "127.0.0.1", port },
			});

			// Should not throw
			await adapter.sendMessage(client, "TestMessage", { data: "test" });
		});
	});

	describe("waitForMessage", () => {
		it("should throw for unknown client", async () => {
			await expect(adapter.waitForMessage(
				{ id: "unknown", type: "websocket", address: { host: "127.0.0.1", port }, isConnected: true },
				"TestMessage",
			)).rejects.toThrow("Client unknown not found");
		});

		it("should throw for closed client", async () => {
			await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			const handle = await adapter.createClient({
				targetAddress: { host: "127.0.0.1", port },
			});
			await adapter.closeClient(handle);

			await expect(adapter.waitForMessage(handle, "TestMessage"))
				.rejects.toThrow("not found");
		});

		it("should timeout when no message received", async () => {
			await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			const client = await adapter.createClient({
				targetAddress: { host: "127.0.0.1", port },
			});

			await expect(adapter.waitForMessage(client, "TestMessage", undefined, 50))
				.rejects.toThrow("Timeout waiting for message type: TestMessage");
		});
	});

	describe("message routing", () => {
		it("should route message to server handler", async () => {
			const server = await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			// Small delay to ensure server is ready
			await new Promise((r) => setTimeout(r, 50));

			const client = await adapter.createClient({
				targetAddress: { host: "127.0.0.1", port },
			});

			const handlerFn = vi.fn().mockResolvedValue({ response: "ok" });
			adapter.onMessage(server, "TestRequest", handlerFn);

			await adapter.sendMessage(client, "TestRequest", { data: "test" });

			// Wait for message to be processed
			await new Promise((r) => setTimeout(r, 50));

			expect(handlerFn).toHaveBeenCalledWith(
				{ data: "test" },
				expect.objectContaining({ direction: "inbound" }),
			);
		});

		it("should route response back to client", async () => {
			const server = await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			await new Promise((r) => setTimeout(r, 50));

			const client = await adapter.createClient({
				targetAddress: { host: "127.0.0.1", port },
			});

			adapter.onMessage(server, "Ping", async () => ({ pong: true }));

			// Start waiting for response
			const responsePromise = adapter.waitForMessage(client, "PingResponse");

			// Send message
			await adapter.sendMessage(client, "Ping", {});

			const response = await responsePromise;
			expect(response.payload).toEqual({ pong: true });
		});

		it("should handle multiple clients", async () => {
			const server = await adapter.startServer({
				listenAddress: { host: "127.0.0.1", port },
			});

			await new Promise((r) => setTimeout(r, 50));

			const client1 = await adapter.createClient({
				targetAddress: { host: "127.0.0.1", port },
			});
			const client2 = await adapter.createClient({
				targetAddress: { host: "127.0.0.1", port },
			});

			let callCount = 0;
			adapter.onMessage(server, "Count", async () => {
				callCount++;
				return { count: callCount };
			});

			await adapter.sendMessage(client1, "Count", {});
			await adapter.sendMessage(client2, "Count", {});

			await new Promise((r) => setTimeout(r, 100));

			expect(callCount).toBe(2);
		});
	});
});
