/**
 * WebSocket Protocol
 *
 * Implements async bidirectional messaging over WebSocket.
 * Supports:
 * - Client connections (real WebSocket)
 * - Mock servers (real WebSocket servers)
 * - Proxy servers (real WebSocket proxy)
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
import { WebSocket, WebSocketServer } from "ws";
import type { WsServiceDefinition, WsProtocolOptions, PendingMessage } from "./types";

/**
 * WebSocket Protocol
 *
 * Provides WebSocket client and server functionality for testing.
 * Uses real WebSocket servers and connections for actual network communication.
 *
 * @template S - Service definition with clientMessages/serverMessages
 *
 * @example
 * ```typescript
 * interface MyWsService extends WsServiceDefinition {
 *   clientMessages: {
 *     ping: { seq: number };
 *     subscribe: { channel: string };
 *   };
 *   serverMessages: {
 *     pong: { seq: number };
 *     subscribed: { channel: string; success: boolean };
 *   };
 * }
 *
 * const protocol = new WebSocketProtocol<MyWsService>();
 * const client = new AsyncClient("ws", { protocol, ... });
 * // client.sendMessage("ping", { seq: 1 }) is now type-safe
 * ```
 */
export class WebSocketProtocol<S extends WsServiceDefinition = WsServiceDefinition>
	extends BaseAsyncProtocol<S>
	implements IAsyncProtocol
{
	readonly type = "websocket";

	/** Public server/client handles */
	public server: { isRunning: boolean; ref?: WebSocketServer } = {
		isRunning: false,
	};
	public client: { isConnected: boolean; ref?: WebSocket } = {
		isConnected: false,
	};

	/** Protocol options */
	private protocolOptions: WsProtocolOptions;

	/** Active WebSocket server */
	private wsServer?: WebSocketServer;

	/** Active WebSocket client */
	private wsClient?: WebSocket;

	/** Server connections map */
	private connections = new Map<string, WebSocket>();

	/** Current client socket (for server to respond) */
	private currentClientSocket?: WebSocket;

	/** Pending messages waiting for response */
	private pendingMessages = new Map<string, PendingMessage>();

	/** Message queue for received messages */
	private messageQueue: Message[] = [];

	constructor(options: WsProtocolOptions = {}) {
		super();
		this.protocolOptions = options;
	}

	/**
	 * Get protocol options
	 */
	getOptions(): WsProtocolOptions {
		return this.protocolOptions;
	}

	/**
	 * Load JSON schema (optional for WebSocket)
	 */
	async loadSchema(schemaPath: string | string[]): Promise<SchemaDefinition> {
		const paths = Array.isArray(schemaPath) ? schemaPath : [schemaPath];
		return {
			type: "json-schema",
			content: { paths: paths.join(",") },
			validate: true,
		};
	}

	/**
	 * Start a WebSocket server (mock mode)
	 * For proxy mode, AsyncServer will also call createClient() to connect to target
	 */
	async startServer(config: ServerProtocolConfig): Promise<void> {
		return new Promise((resolve, reject) => {
			const server = new WebSocketServer({
				host: config.listenAddress.host,
				port: config.listenAddress.port,
			});

			server.on("connection", (socket) => {
				const connId = generateId("conn");
				this.connections.set(connId, socket);
				this.currentClientSocket = socket;

				socket.on("message", async (data) => {
					try {
						const message = JSON.parse(data.toString()) as Message;
						await this.handleIncomingMessage(message, socket);
					} catch (_err) {
						// Failed to parse message
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

			server.on("listening", () => {
				this.wsServer = server;
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
		clientSocket: WebSocket,
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
		if (this.client.isConnected && this.wsClient) {
			this.sendToSocket(this.wsClient, message);
		}
	}

	/**
	 * Send message to WebSocket
	 */
	private sendToSocket(socket: WebSocket, message: Message): void {
		if (socket.readyState === WebSocket.OPEN) {
			socket.send(JSON.stringify(message));
		}
	}

	/**
	 * Stop the WebSocket server
	 */
	async stopServer(): Promise<void> {
		if (!this.wsServer) {
			return;
		}

		// Close all connections first
		for (const socket of this.connections.values()) {
			socket.removeAllListeners();
			socket.close();
		}
		this.connections.clear();
		this.currentClientSocket = undefined;

		const server = this.wsServer;
		return new Promise<void>((resolve, reject) => {
			server.close((err) => {
				if (err) {
					reject(err);
				} else {
					this.wsServer = undefined;
					this.server.isRunning = false;
					this.server.ref = undefined;
					resolve();
				}
			});
		});
	}

	/**
	 * Create a WebSocket client connection
	 */
	async createClient(config: ClientProtocolConfig): Promise<void> {
		const protocol = config.tls?.enabled ? "wss" : "ws";
		const path = config.targetAddress.path || "";
		const url = `${protocol}://${config.targetAddress.host}:${config.targetAddress.port}${path}`;

		return new Promise((resolve, reject) => {
			const socket = new WebSocket(url);

			socket.on("open", () => {
				this.wsClient = socket;
				this.client.isConnected = true;
				this.client.ref = socket;

				// Handle incoming messages
				socket.on("message", (data) => {
					this.handleClientMessage(data);
				});

				socket.on("close", () => {
					this.client.isConnected = false;
				});

				socket.on("error", () => {
					this.client.isConnected = false;
				});

				resolve();
			});

			socket.on("error", (err) => {
				reject(err);
			});
		});
	}

	/**
	 * Handle incoming message on client
	 */
	private async handleClientMessage(data: unknown): Promise<void> {
		try {
			const message = JSON.parse(String(data)) as Message;
			await this.deliverMessageToClient(message);
		} catch (_err) {
			// Failed to parse client message
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
	 * Close the WebSocket client
	 */
	async closeClient(): Promise<void> {
		if (!this.wsClient) {
			return;
		}

		// Reject all pending messages
		for (const [, pending] of Array.from(this.pendingMessages.entries())) {
			clearTimeout(pending.timeout);
			pending.reject(new Error("Client disconnected"));
		}
		this.pendingMessages.clear();
		this.messageQueue = [];

		// Remove all listeners and close socket
		this.wsClient.removeAllListeners();
		this.wsClient.close();
		this.wsClient = undefined;
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
		if (!this.wsClient) {
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

		this.sendToSocket(this.wsClient, message);
	}

	/**
	 * Wait for message on client
	 */
	async waitForMessage<T = unknown>(
		messageType: string | string[],
		matcher?: string | ((payload: T) => boolean),
		timeout = 30000,
	): Promise<Message> {
		if (!this.wsClient) {
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
 * Create WebSocket protocol factory
 */
export function createWebSocketProtocol<S extends WsServiceDefinition>(
	options?: WsProtocolOptions,
): WebSocketProtocol<S> {
	return new WebSocketProtocol<S>(options);
}
