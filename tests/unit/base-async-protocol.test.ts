/**
 * BaseAsyncProtocol Tests
 * 
 * Tests for the refactored BaseAsyncProtocol (v2)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAsyncProtocol } from "../../packages/core/src/protocols/base/base.protocol";
import type { 
	ServerProtocolConfig, 
	ClientProtocolConfig, 
	Message,
	IServerConnection,
	IClientConnection,
} from "../../packages/core/src/protocols/base/base.types";

// =============================================================================
// Mock Protocol Implementation
// =============================================================================

interface MockSocket {
	id: string;
	connected: boolean;
	messages: Message[];
	onMessageHandler?: (message: Message) => void;
	onCloseHandler?: () => void;
	onErrorHandler?: (error: Error) => void;
}

class MockAsyncProtocol extends BaseAsyncProtocol<object, MockSocket> {
	readonly type = "mock";
	
	// Track calls for testing
	public initServerCalled = false;
	public shutdownServerCalled = false;
	public connectCalled = false;
	public onConnectionCallback?: (connection: IServerConnection) => void;
	
	// Mock sockets
	public mockServerSockets: MockSocket[] = [];
	public mockClientSocket?: MockSocket;

	async startServer(
		config: ServerProtocolConfig,
		onConnection: (connection: IServerConnection) => void,
	): Promise<void> {
		this.initServerCalled = true;
		this.onConnectionCallback = onConnection;
		this.server.isRunning = true;
	}

	async stopServer(): Promise<void> {
		this.shutdownServerCalled = true;
		this.server.isRunning = false;
		// Close all server connections
		for (const socket of this.mockServerSockets) {
			socket.connected = false;
			socket.onCloseHandler?.();
		}
		this.mockServerSockets = [];
	}

	async connect(config: ClientProtocolConfig): Promise<IClientConnection> {
		this.connectCalled = true;
		const socket: MockSocket = {
			id: `client-${Date.now()}`,
			connected: true,
			messages: [],
		};
		this.mockClientSocket = socket;
		this.client.isConnected = true;
		return this.createClientConnection(socket);
	}

	// Simulate incoming client connection (for server mode)
	simulateClientConnect(): IServerConnection {
		const socket: MockSocket = {
			id: `server-conn-${Date.now()}`,
			connected: true,
			messages: [],
		};
		this.mockServerSockets.push(socket);
		const connection = this.createServerConnection(socket);
		this.onConnectionCallback?.(connection);
		return connection;
	}

	// Simulate incoming message on server connection
	simulateServerMessage(socketIndex: number, message: Message): void {
		const socket = this.mockServerSockets[socketIndex];
		if (socket?.onMessageHandler) {
			socket.onMessageHandler(message);
		}
	}

	// Simulate incoming event on client connection
	simulateClientEvent(message: Message): void {
		if (this.mockClientSocket?.onMessageHandler) {
			this.mockClientSocket.onMessageHandler(message);
		}
	}

	// Simulate socket close
	simulateSocketClose(socket: MockSocket): void {
		socket.connected = false;
		socket.onCloseHandler?.();
	}

	// Simulate socket error
	simulateSocketError(socket: MockSocket, error: Error): void {
		socket.onErrorHandler?.(error);
	}

	// Abstract method implementations
	protected async sendToSocket(socket: MockSocket, message: Message): Promise<void> {
		if (!socket.connected) {
			throw new Error("Socket not connected");
		}
		socket.messages.push(message);
	}

	protected async closeSocket(socket: MockSocket): Promise<void> {
		socket.connected = false;
	}

	protected isSocketConnected(socket: MockSocket): boolean {
		return socket.connected;
	}

	protected setupSocketHandlers(
		socket: MockSocket,
		handlers: {
			onMessage: (message: Message) => void;
			onClose: () => void;
			onError: (error: Error) => void;
		},
	): void {
		socket.onMessageHandler = handlers.onMessage;
		socket.onCloseHandler = handlers.onClose;
		socket.onErrorHandler = handlers.onError;
	}

	// Expose protected members for testing
	getServerConnections() {
		return this.serverConnections;
	}

	getClientConnection() {
		return this.clientConnection;
	}
}

// =============================================================================
// Tests
// =============================================================================

describe("BaseAsyncProtocol (Refactored)", () => {
	let protocol: MockAsyncProtocol;

	beforeEach(() => {
		protocol = new MockAsyncProtocol();
	});

	describe("Server Mode", () => {
		it("should call initServer on startServer", async () => {
			const onConnection = vi.fn();
			await protocol.startServer({ listenAddress: { host: "localhost", port: 8080 } }, onConnection);

			expect(protocol.initServerCalled).toBe(true);
		});

		it("should create IServerConnection wrapper for each raw connection", async () => {
			const onConnection = vi.fn();
			await protocol.startServer({ listenAddress: { host: "localhost", port: 8080 } }, onConnection);

			const connection = protocol.simulateClientConnect();

			expect(connection).toBeDefined();
			expect(connection.id).toBeDefined();
			expect(connection.isConnected).toBe(true);
		});

		it("should call onConnection callback with IServerConnection", async () => {
			const onConnection = vi.fn();
			await protocol.startServer({ listenAddress: { host: "localhost", port: 8080 } }, onConnection);

			protocol.simulateClientConnect();

			expect(onConnection).toHaveBeenCalledTimes(1);
			expect(onConnection.mock.calls[0][0]).toHaveProperty("id");
			expect(onConnection.mock.calls[0][0]).toHaveProperty("sendEvent");
			expect(onConnection.mock.calls[0][0]).toHaveProperty("onMessage");
		});

		it("should track connections in serverConnections map", async () => {
			const onConnection = vi.fn();
			await protocol.startServer({ listenAddress: { host: "localhost", port: 8080 } }, onConnection);

			const conn1 = protocol.simulateClientConnect();
			const conn2 = protocol.simulateClientConnect();

			expect(protocol.getServerConnections().size).toBe(2);
			expect(protocol.getServerConnections().has(conn1.id)).toBe(true);
			expect(protocol.getServerConnections().has(conn2.id)).toBe(true);
		});

		it("should remove connection from map on close", async () => {
			const onConnection = vi.fn();
			await protocol.startServer({ listenAddress: { host: "localhost", port: 8080 } }, onConnection);

			const connection = protocol.simulateClientConnect();
			const connId = connection.id;

			expect(protocol.getServerConnections().has(connId)).toBe(true);

			// Simulate socket close
			protocol.simulateSocketClose(protocol.mockServerSockets[0]);

			expect(protocol.getServerConnections().has(connId)).toBe(false);
		});

		it("should call shutdownServer on stopServer", async () => {
			const onConnection = vi.fn();
			await protocol.startServer({ listenAddress: { host: "localhost", port: 8080 } }, onConnection);
			
			await protocol.stopServer();

			expect(protocol.shutdownServerCalled).toBe(true);
		});

		it("should clear all connections on stopServer", async () => {
			const onConnection = vi.fn();
			await protocol.startServer({ listenAddress: { host: "localhost", port: 8080 } }, onConnection);

			protocol.simulateClientConnect();
			protocol.simulateClientConnect();

			expect(protocol.getServerConnections().size).toBe(2);

			await protocol.stopServer();

			expect(protocol.getServerConnections().size).toBe(0);
		});
	});

	describe("Client Mode", () => {
		it("should call createRawSocket on connect", async () => {
			await protocol.connect({ targetAddress: { host: "localhost", port: 8080 } });

			expect(protocol.connectCalled).toBe(true);
		});

		it("should return IClientConnection wrapper", async () => {
			const connection = await protocol.connect({ targetAddress: { host: "localhost", port: 8080 } });

			expect(connection).toBeDefined();
			expect(connection.id).toBeDefined();
			expect(connection.isConnected).toBe(true);
			expect(typeof connection.sendMessage).toBe("function");
			expect(typeof connection.onEvent).toBe("function");
		});

		it("should store clientConnection reference", async () => {
			await protocol.connect({ targetAddress: { host: "localhost", port: 8080 } });

			expect(protocol.getClientConnection()).toBeDefined();
		});

		it("should call closeRawSocket on connection.close()", async () => {
			const connection = await protocol.connect({ targetAddress: { host: "localhost", port: 8080 } });

			await connection.close();

			expect(protocol.mockClientSocket?.connected).toBe(false);
		});
	});

	describe("Message Dispatch", () => {
		it("should dispatch message to server connection handlers", async () => {
			const onConnection = vi.fn();
			await protocol.startServer({ listenAddress: { host: "localhost", port: 8080 } }, onConnection);

			const connection = protocol.simulateClientConnect();
			const handler = vi.fn();
			connection.onMessage(handler);

			protocol.simulateServerMessage(0, { type: "Login", payload: { user: "test" } });

			// Wait for async dispatch
			await new Promise((r) => setTimeout(r, 10));

			expect(handler).toHaveBeenCalledWith({ type: "Login", payload: { user: "test" } });
		});

		it("should dispatch event to client connection handlers", async () => {
			const connection = await protocol.connect({ targetAddress: { host: "localhost", port: 8080 } });
			const handler = vi.fn();
			connection.onEvent(handler);

			protocol.simulateClientEvent({ type: "LoginResponse", payload: { token: "abc" } });

			// Wait for async dispatch
			await new Promise((r) => setTimeout(r, 10));

			expect(handler).toHaveBeenCalledWith({ type: "LoginResponse", payload: { token: "abc" } });
		});
	});

	describe("Lifecycle", () => {
		it("should cleanup all resources on dispose", async () => {
			const onConnection = vi.fn();
			await protocol.startServer({ listenAddress: { host: "localhost", port: 8080 } }, onConnection);
			protocol.simulateClientConnect();
			await protocol.connect({ targetAddress: { host: "localhost", port: 9090 } });

			expect(protocol.getServerConnections().size).toBe(1);
			expect(protocol.getClientConnection()).toBeDefined();

			await protocol.dispose();

			expect(protocol.getServerConnections().size).toBe(0);
			expect(protocol.getClientConnection()).toBeUndefined();
		});

		it("should close all server connections on dispose", async () => {
			const onConnection = vi.fn();
			await protocol.startServer({ listenAddress: { host: "localhost", port: 8080 } }, onConnection);

			const closeHandler = vi.fn();
			const connection = protocol.simulateClientConnect();
			connection.onClose(closeHandler);

			await protocol.dispose();

			expect(closeHandler).toHaveBeenCalled();
		});

		it("should close client connection on dispose", async () => {
			const connection = await protocol.connect({ targetAddress: { host: "localhost", port: 8080 } });

			expect(connection.isConnected).toBe(true);

			await protocol.dispose();

			// Connection should be closed (socket marked as disconnected)
			expect(protocol.mockClientSocket?.connected).toBe(false);
			// Client connection reference should be cleared
			expect(protocol.getClientConnection()).toBeUndefined();
		});
	});

});
