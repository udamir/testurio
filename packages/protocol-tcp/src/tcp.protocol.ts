/**
 * TCP Protocol
 *
 * Implements async bidirectional messaging over TCP.
 * Supports:
 * - Client connections (real TCP sockets)
 * - Mock servers (real TCP servers)
 * - Proxy servers (real TCP proxy)
 *
 * @template S - Service definition type with clientMessages/serverMessages
 */

import type {
	ClientProtocolConfig,
	ServerProtocolConfig,
	IAsyncProtocol,
	Message,
	SchemaDefinition,
} from "testurio";
import { BaseAsyncProtocol, generateId } from "testurio";
import * as net from "node:net";
import type { TcpServiceDefinition, TcpProtocolOptions, PendingMessage } from "./types";

/**
 * TCP Protocol
 *
 * Provides TCP client and server functionality for testing.
 * Uses real TCP servers and sockets for actual network communication.
 *
 * @template S - Service definition with clientMessages/serverMessages
 *
 * @example
 * ```typescript
 * interface MyTcpService extends TcpServiceDefinition {
 *   clientMessages: {
 *     OrderRequest: { orderId: string; quantity: number };
 *   };
 *   serverMessages: {
 *     OrderResponse: { orderId: string; status: string };
 *   };
 * }
 *
 * const protocol = new TcpProtocol<MyTcpService>();
 * const client = new AsyncClient("tcp", { protocol, ... });
 * // client.sendMessage("OrderRequest", { orderId: "123", quantity: 5 }) is now type-safe
 * ```
 */
export class TcpProtocol<S extends TcpServiceDefinition = TcpServiceDefinition>
	extends BaseAsyncProtocol<S>
	implements IAsyncProtocol
{
	readonly type = "tcp";

	/** Public server/client handles */
	public server: { isRunning: boolean; ref?: net.Server } = {
		isRunning: false,
	};
	public client: { isConnected: boolean; ref?: net.Socket } = {
		isConnected: false,
	};

	/** Protocol options */
	private protocolOptions: TcpProtocolOptions;

	/** Active TCP server */
	private tcpServer?: net.Server;

	/** Active TCP client socket */
	private tcpClient?: net.Socket;

	/** Server connections map */
	private connections = new Map<string, net.Socket>();

	/** Current client socket (for server to respond) */
	private currentClientSocket?: net.Socket;

	/** Pending messages waiting for response */
	private pendingMessages = new Map<string, PendingMessage>();

	/** Message queue for received messages */
	private messageQueue: Message[] = [];

	/** Buffer for incomplete messages (client side) */
	private clientBuffer = "";

	constructor(options: TcpProtocolOptions = {}) {
		super();
		this.protocolOptions = options;
	}

	/**
	 * Get protocol options
	 */
	getOptions(): TcpProtocolOptions {
		return this.protocolOptions;
	}

	/**
	 * Get message delimiter
	 */
	private get delimiter(): string {
		return this.protocolOptions.delimiter ?? "\n";
	}

	/**
	 * Load Protobuf schema (optional for TCP)
	 */
	async loadSchema(schemaPath: string | string[]): Promise<SchemaDefinition> {
		const paths = Array.isArray(schemaPath) ? schemaPath : [schemaPath];
		return {
			type: "protobuf",
			content: { paths: paths.join(",") },
			validate: true,
		};
	}

	/**
	 * Start a TCP server (mock mode)
	 * For proxy mode, AsyncServer will also call createClient() to connect to target
	 */
	async startServer(config: ServerProtocolConfig): Promise<void> {
		return new Promise((resolve, reject) => {
			const server = net.createServer((socket) => {
				const connId = generateId("conn");
				this.connections.set(connId, socket);
				this.currentClientSocket = socket;

				let buffer = "";

				socket.on("data", async (data) => {
					buffer += data.toString();

					// Parse delimiter-separated messages
					while (buffer.length > 0) {
						const delimiterIndex = buffer.indexOf(this.delimiter);
						if (delimiterIndex === -1) break;

						const messageStr = buffer.slice(0, delimiterIndex);
						buffer = buffer.slice(delimiterIndex + this.delimiter.length);

						try {
							const message = JSON.parse(messageStr) as Message;
							await this.handleIncomingMessage(message, socket);
						} catch (_err) {
							// Failed to parse message
						}
					}
				});

				socket.on("close", () => {
					this.connections.delete(connId);
					if (this.currentClientSocket === socket) {
						this.currentClientSocket = undefined;
					}
				});

				socket.on("error", () => {
					this.connections.delete(connId);
				});
			});

			server.on("error", (err) => {
				reject(err);
			});

			server.listen(config.listenAddress.port, config.listenAddress.host, () => {
				this.tcpServer = server;
				this.server.isRunning = true;
				this.server.ref = server;
				resolve();
			});
		});
	}

	/**
	 * Handle incoming message on server
	 */
	private async handleIncomingMessage(
		message: Message,
		clientSocket: net.Socket,
	): Promise<void> {
		// Try hook-based handlers first
		if (this.hookRegistry) {
			const hookResult = await this.hookRegistry.executeHooks(message);

			if (hookResult === null) {
				// Message was dropped by hook
				return;
			}

			// Check if hook transformed message into a response
			if (hookResult.type !== message.type) {
				this.sendToSocket(clientSocket, hookResult);
				return;
			}
		}

		// Fall back to direct handlers
		const handlers = this.messageHandlers.get(message.type);

		if (handlers && handlers.length > 0) {
			for (const handler of handlers) {
				try {
					const result = await handler(message.payload);
					if (result !== null && result !== undefined) {
						const responseMessage: Message = {
							type: `${message.type}Response`,
							payload: result,
							traceId: message.traceId,
						};
						this.sendToSocket(clientSocket, responseMessage);
					}
				} catch (_error) {
					// Handler error
				}
			}
			return;
		}

		// If in proxy mode (client connected to target), forward message
		if (this.client.isConnected && this.tcpClient) {
			this.sendToSocket(this.tcpClient, message);
		}
	}

	/**
	 * Send message to socket (delimiter-separated JSON)
	 */
	private sendToSocket(socket: net.Socket, message: Message): void {
		if (!socket.destroyed) {
			const data = `${JSON.stringify(message)}${this.delimiter}`;
			socket.write(data);
		}
	}

	/**
	 * Stop the TCP server
	 */
	async stopServer(): Promise<void> {
		if (!this.tcpServer) {
			return;
		}

		// Close all connections first
		for (const socket of this.connections.values()) {
			socket.removeAllListeners();
			socket.destroy();
		}
		this.connections.clear();
		this.currentClientSocket = undefined;

		const server = this.tcpServer;
		return new Promise<void>((resolve, reject) => {
			// Prevent new connections
			server.removeAllListeners("connection");

			server.close((err) => {
				if (err) {
					reject(err);
				} else {
					this.tcpServer = undefined;
					this.server.isRunning = false;
					this.server.ref = undefined;
					resolve();
				}
			});
		});
	}

	/**
	 * Create a TCP client connection
	 */
	async createClient(config: ClientProtocolConfig): Promise<void> {
		return new Promise((resolve, reject) => {
			const socket = net.createConnection(
				{
					host: config.targetAddress.host,
					port: config.targetAddress.port,
				},
				() => {
					this.tcpClient = socket;
					this.client.isConnected = true;
					this.client.ref = socket;

					// Handle incoming messages
					socket.on("data", (data) => {
						this.handleClientData(data);
					});

					socket.on("close", () => {
						this.client.isConnected = false;
					});

					socket.on("error", () => {
						this.client.isConnected = false;
					});

					resolve();
				},
			);

			socket.on("error", (err) => {
				reject(err);
			});
		});
	}

	/**
	 * Handle incoming data on client socket
	 */
	private handleClientData(data: Buffer): void {
		this.clientBuffer += data.toString();

		while (this.clientBuffer.length > 0) {
			const delimiterIndex = this.clientBuffer.indexOf(this.delimiter);
			if (delimiterIndex === -1) break;

			const messageStr = this.clientBuffer.slice(0, delimiterIndex);
			this.clientBuffer = this.clientBuffer.slice(delimiterIndex + this.delimiter.length);

			try {
				const message = JSON.parse(messageStr) as Message;
				this.deliverMessageToClient(message);
			} catch (_err) {
				// Failed to parse client message
			}
		}
	}

	/**
	 * Deliver message to client (execute hooks, check pending or queue)
	 */
	private async deliverMessageToClient(incomingMessage: Message): Promise<void> {
		// Execute hooks first
		let processedMessage = incomingMessage;
		if (this.hookRegistry) {
			const hookResult = await this.hookRegistry.executeHooks(incomingMessage);
			if (hookResult === null) {
				// Message was dropped by hook
				return;
			}
			processedMessage = hookResult;
		}

		// Check pending messages
		for (const [pendingId, pending] of Array.from(this.pendingMessages.entries())) {
			const types = Array.isArray(pending.messageType)
				? pending.messageType
				: [pending.messageType];

			if (types.includes(processedMessage.type)) {
				if (this.matchesPending(processedMessage, pending)) {
					clearTimeout(pending.timeout);
					this.pendingMessages.delete(pendingId);
					pending.resolve(processedMessage);
					return;
				}
			}
		}

		// Add to queue if no pending match
		this.messageQueue.push(processedMessage);

		// In proxy mode, forward to connected clients
		if (this.server.isRunning && this.currentClientSocket) {
			this.sendToSocket(this.currentClientSocket, processedMessage);
		}
	}

	/**
	 * Close the TCP client
	 */
	async closeClient(): Promise<void> {
		if (!this.tcpClient) {
			return;
		}

		// Reject all pending messages
		for (const [, pending] of Array.from(this.pendingMessages.entries())) {
			clearTimeout(pending.timeout);
			pending.reject(new Error("Client disconnected"));
		}
		this.pendingMessages.clear();
		this.messageQueue = [];
		this.clientBuffer = "";

		// Remove all listeners and destroy socket
		this.tcpClient.removeAllListeners();
		this.tcpClient.destroy();
		this.tcpClient = undefined;
		this.client.isConnected = false;
		this.client.ref = undefined;
	}

	/**
	 * Send message from client
	 */
	async sendMessage<T = unknown>(
		messageType: string,
		payload: T,
		traceId?: string,
	): Promise<void> {
		if (!this.tcpClient) {
			throw new Error("Client not connected");
		}

		if (!this.client.isConnected) {
			throw new Error("Client is not connected");
		}

		const message: Message = {
			type: messageType,
			payload,
			traceId: traceId || generateId(messageType),
		};

		this.sendToSocket(this.tcpClient, message);
	}

	/**
	 * Wait for message on client
	 */
	async waitForMessage<T = unknown>(
		messageType: string | string[],
		matcher?: string | ((payload: T) => boolean),
		timeout = 30000,
	): Promise<Message> {
		if (!this.tcpClient) {
			throw new Error("Client not connected");
		}

		if (!this.client.isConnected) {
			throw new Error("Client is not connected");
		}

		// Check message queue first
		const types = Array.isArray(messageType) ? messageType : [messageType];
		const queuedMessage = this.findInQueue(
			types,
			matcher as string | ((payload: unknown) => boolean) | undefined,
		);
		if (queuedMessage) {
			return queuedMessage;
		}

		// Wait for message
		return new Promise<Message>((resolve, reject) => {
			const pendingId = generateId("pending");

			const timeoutHandle = setTimeout(() => {
				this.pendingMessages.delete(pendingId);
				reject(new Error(`Timeout waiting for message type: ${types.join(", ")}`));
			}, timeout);

			this.pendingMessages.set(pendingId, {
				resolve,
				reject,
				messageType,
				matcher: matcher as string | ((payload: unknown) => boolean) | undefined,
				timeout: timeoutHandle,
			});
		});
	}

	/**
	 * Find message in queue
	 */
	private findInQueue(
		types: string[],
		matcher?: string | ((payload: unknown) => boolean),
	): Message | undefined {
		const index = this.messageQueue.findIndex((msg) => {
			if (!types.includes(msg.type)) return false;

			if (matcher) {
				if (typeof matcher === "string") {
					return msg.traceId === matcher;
				}
				return matcher(msg.payload);
			}

			return true;
		});

		if (index >= 0) {
			return this.messageQueue.splice(index, 1)[0];
		}

		return undefined;
	}

	/**
	 * Check if message matches pending request
	 */
	private matchesPending(message: Message, pending: PendingMessage): boolean {
		if (!pending.matcher) return true;

		if (typeof pending.matcher === "string") {
			return message.traceId === pending.matcher;
		}

		return pending.matcher(message.payload);
	}

	/**
	 * Dispose protocol and release all resources
	 */
	override async dispose(): Promise<void> {
		await this.closeClient();
		await this.stopServer();
		await super.dispose();
	}
}

/**
 * Create TCP protocol factory
 */
export function createTcpProtocol<S extends TcpServiceDefinition>(
	options?: TcpProtocolOptions,
): TcpProtocol<S> {
	return new TcpProtocol<S>(options);
}
