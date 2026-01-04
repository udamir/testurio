/**
 * WebSocket Protocol Tests (v2)
 *
 * Tests use real WebSocket server and client connections.
 * Updated for v2 API with connection wrappers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocketProtocol, type WsServiceDefinition } from "@testurio/protocol-ws";
import type { IServerConnection, IClientConnection } from "testurio";

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
			const onConnection = vi.fn();
			await protocol.startServer(
				{ listenAddress: { host: "127.0.0.1", port } },
				onConnection,
			);

			expect(protocol.server.isRunning).toBe(true);
		});

		it("should call onConnection when client connects", async () => {
			const onConnection = vi.fn();
			await protocol.startServer(
				{ listenAddress: { host: "127.0.0.1", port } },
				onConnection,
			);

			// Connect a client
			const clientProtocol = new WebSocketProtocol<TestWsService>();
			await clientProtocol.connect({ targetAddress: { host: "127.0.0.1", port } });

			// Wait for connection callback
			await new Promise((r) => setTimeout(r, 50));

			expect(onConnection).toHaveBeenCalledTimes(1);
			const serverConn = onConnection.mock.calls[0][0] as IServerConnection;
			expect(serverConn.id).toBeDefined();
			expect(serverConn.isConnected).toBe(true);

			await clientProtocol.dispose();
		});
	});

	describe("stopServer", () => {
		it("should stop running server", async () => {
			await protocol.startServer(
				{ listenAddress: { host: "127.0.0.1", port } },
				() => {},
			);

			await protocol.stopServer();

			expect(protocol.server.isRunning).toBe(false);
		});

		it("should handle stopping non-existent server gracefully", async () => {
			// Should not throw
			await protocol.stopServer();
		});
	});

	describe("connect", () => {
		it("should return IClientConnection", async () => {
			await protocol.startServer(
				{ listenAddress: { host: "127.0.0.1", port } },
				() => {},
			);

			const clientProtocol = new WebSocketProtocol<TestWsService>();
			const connection = await clientProtocol.connect({
				targetAddress: { host: "127.0.0.1", port },
			});

			expect(connection).toBeDefined();
			expect(connection.id).toBeDefined();
			expect(connection.isConnected).toBe(true);
			expect(typeof connection.sendMessage).toBe("function");
			expect(typeof connection.onEvent).toBe("function");

			await clientProtocol.dispose();
		});
	});

	describe("connection.sendMessage", () => {
		it("should send message to server", async () => {
			const receivedMessages: unknown[] = [];

			await protocol.startServer(
				{ listenAddress: { host: "127.0.0.1", port } },
				(serverConn) => {
					serverConn.onMessage((message) => {
						if (message.type === "TestMessage") {
							receivedMessages.push(message.payload);
						}
					});
				},
			);

			const clientProtocol = new WebSocketProtocol<TestWsService>();
			const clientConn = await clientProtocol.connect({
				targetAddress: { host: "127.0.0.1", port },
			});

			await clientConn.sendMessage("TestMessage", { data: "hello" });

			// Wait for message to be processed
			await new Promise((r) => setTimeout(r, 50));

			expect(receivedMessages).toHaveLength(1);
			expect(receivedMessages[0]).toEqual({ data: "hello" });

			await clientProtocol.dispose();
		});
	});

	describe("connection.onEvent", () => {
		it("should receive events from server", async () => {
			let serverConnection: IServerConnection | undefined;

			await protocol.startServer(
				{ listenAddress: { host: "127.0.0.1", port } },
				(conn) => {
					serverConnection = conn;
				},
			);

			const clientProtocol = new WebSocketProtocol<TestWsService>();
			const clientConn = await clientProtocol.connect({
				targetAddress: { host: "127.0.0.1", port },
			});

			const receivedEvents: unknown[] = [];
			clientConn.onEvent((event) => {
				if (event.type === "TestMessageResponse") {
					receivedEvents.push(event.payload);
				}
			});

			// Wait for connection to be established
			await new Promise((r) => setTimeout(r, 50));

			// Server sends event
			await serverConnection?.sendEvent("TestMessageResponse", { response: "world" });

			// Wait for event to be received
			await new Promise((r) => setTimeout(r, 50));

			expect(receivedEvents).toHaveLength(1);
			expect(receivedEvents[0]).toEqual({ response: "world" });

			await clientProtocol.dispose();
		});
	});

	describe("message routing", () => {
		it("should route message to server handler and send response", async () => {
			await protocol.startServer(
				{ listenAddress: { host: "127.0.0.1", port } },
				(serverConn) => {
					serverConn.onMessage(async (message) => {
						if (message.type === "Ping") {
							await serverConn.sendEvent("PingResponse", { pong: true });
						}
					});
				},
			);

			const clientProtocol = new WebSocketProtocol<TestWsService>();
			const clientConn = await clientProtocol.connect({
				targetAddress: { host: "127.0.0.1", port },
			});

			const receivedResponses: unknown[] = [];
			clientConn.onEvent((event) => {
				if (event.type === "PingResponse") {
					receivedResponses.push(event.payload);
				}
			});

			await clientConn.sendMessage("Ping", {});

			// Wait for response
			await new Promise((r) => setTimeout(r, 100));

			expect(receivedResponses).toHaveLength(1);
			expect(receivedResponses[0]).toEqual({ pong: true });

			await clientProtocol.dispose();
		});
	});

	describe("dispose", () => {
		it("should clean up all resources", async () => {
			await protocol.startServer(
				{ listenAddress: { host: "127.0.0.1", port } },
				() => {},
			);

			const clientProtocol = new WebSocketProtocol<TestWsService>();
			await clientProtocol.connect({
				targetAddress: { host: "127.0.0.1", port },
			});

			await protocol.dispose();
			await clientProtocol.dispose();

			expect(protocol.server.isRunning).toBe(false);
		});
	});

	describe("multiple clients", () => {
		it("should handle multiple clients sending messages simultaneously", async () => {
			const receivedMessages: Array<{ data: string }> = [];

			await protocol.startServer(
				{ listenAddress: { host: "127.0.0.1", port } },
				(serverConn) => {
					serverConn.onMessage((message) => {
						if (message.type === "TestMessage") {
							receivedMessages.push(message.payload as { data: string });
						}
					});
				},
			);

			// Connect multiple clients
			const client1 = new WebSocketProtocol<TestWsService>();
			const client2 = new WebSocketProtocol<TestWsService>();
			const client3 = new WebSocketProtocol<TestWsService>();

			const conn1 = await client1.connect({ targetAddress: { host: "127.0.0.1", port } });
			const conn2 = await client2.connect({ targetAddress: { host: "127.0.0.1", port } });
			const conn3 = await client3.connect({ targetAddress: { host: "127.0.0.1", port } });

			// Each client sends a message
			await conn1.sendMessage("TestMessage", { data: "client1" });
			await conn2.sendMessage("TestMessage", { data: "client2" });
			await conn3.sendMessage("TestMessage", { data: "client3" });

			// Wait for messages to be processed
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(receivedMessages.length).toBe(3);
			const messages = receivedMessages.map((m) => m.data);
			expect(messages).toContain("client1");
			expect(messages).toContain("client2");
			expect(messages).toContain("client3");

			await client1.dispose();
			await client2.dispose();
			await client3.dispose();
		});

		it("should handle client disconnection without affecting other clients", async () => {
			const serverConnections: IServerConnection[] = [];

			await protocol.startServer(
				{ listenAddress: { host: "127.0.0.1", port } },
				(conn) => {
					serverConnections.push(conn);
					conn.onMessage(async (message) => {
						if (message.type === "TestRequest") {
							const data = (message.payload as { data: string }).data;
							await conn.sendEvent("TestRequestResponse", { response: `response-for-${data}` });
						}
					});
				},
			);

			const client1 = new WebSocketProtocol<TestWsService>();
			const client2 = new WebSocketProtocol<TestWsService>();

			const conn1 = await client1.connect({ targetAddress: { host: "127.0.0.1", port } });
			const conn2 = await client2.connect({ targetAddress: { host: "127.0.0.1", port } });

			// Disconnect client1
			await conn1.close();
			await new Promise((resolve) => setTimeout(resolve, 50));

			// client2 should still work
			const receivedResponses: unknown[] = [];
			conn2.onEvent((event) => {
				if (event.type === "TestRequestResponse") {
					receivedResponses.push(event.payload);
				}
			});

			await conn2.sendMessage("TestRequest", { data: "still-working" });
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(receivedResponses).toHaveLength(1);
			expect((receivedResponses[0] as { response: string }).response).toBe("response-for-still-working");

			await client1.dispose();
			await client2.dispose();
		});
	});
});
