/**
 * WebSocket Protocol Adapter
 *
 * Adapter for WebSocket protocol supporting:
 * - Async bidirectional messaging
 * - Client connections (real WebSocket)
 * - Mock servers (real WebSocket servers)
 * - Proxy servers (real WebSocket proxy)
 */

import { WebSocket, WebSocketServer } from "ws";
import type {
	Message,
	MessageMetadata,
	ProtocolCharacteristics,
	SchemaDefinition,
} from "../types";
import { BaseProtocolAdapter, generateHandleId } from "./base-adapter";
import type {
	AdapterClientHandle,
	AdapterServerHandle,
	AdapterClientConfig,
	ServerConfig,
} from "./types";

/**
 * Pending message resolver
 */
interface PendingMessage {
	resolve: (message: Message) => void;
	reject: (error: Error) => void;
	messageType: string | string[];
	matcher?: string | ((payload: unknown) => boolean);
	timeout: NodeJS.Timeout;
}

/**
 * WebSocket-specific server handle
 */
interface WebSocketServerHandle extends AdapterServerHandle {
	_internal: {
		server: WebSocketServer;
		connections: Map<string, WebSocket>;
		isProxy: boolean;
		targetAddress?: { host: string; port: number };
	};
}

/**
 * WebSocket-specific client handle
 */
interface WebSocketClientHandle extends AdapterClientHandle {
	_internal: {
		socket: WebSocket;
		pendingMessages: Map<string, PendingMessage>;
		messageQueue: Message[];
		url: string;
	};
}

/**
 * WebSocket Protocol Adapter
 *
 * Provides WebSocket client and server functionality for testing.
 * Uses real WebSocket servers and connections for actual network communication.
 */
export class WebSocketAdapter extends BaseProtocolAdapter {
	readonly type = "websocket";

	readonly characteristics: ProtocolCharacteristics = {
		type: "websocket",
		async: true,
		supportsProxy: true,
		supportsMock: true,
		streaming: true,
		requiresConnection: true,
		bidirectional: true,
	};

	// Map server ID to client socket for routing responses
	private serverToClientSocket: Map<string, WebSocket> = new Map();

	/**
	 * Load JSON schema
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
	 * Start a real WebSocket server (mock or proxy)
	 */
	async startServer(config: ServerConfig): Promise<WebSocketServerHandle> {
		const id = generateHandleId("ws-server");
		const isProxy = !!config.targetAddress;

		return new Promise((resolve, reject) => {
			const connections = new Map<string, WebSocket>();

			const server = new WebSocketServer({
				host: config.listenAddress.host,
				port: config.listenAddress.port,
			});

			server.on("connection", (socket) => {
				const connId = generateHandleId("conn");
				connections.set(connId, socket);

				// Store socket for response routing
				this.serverToClientSocket.set(id, socket);

				socket.on("message", async (data) => {
					try {
						const message = JSON.parse(data.toString()) as Message;
						await this.handleIncomingMessage(id, isProxy, config.targetAddress, message, socket);
					} catch (err) {
						// Failed to parse message
					}
				});

				socket.on("close", () => {
					connections.delete(connId);
					this.serverToClientSocket.delete(id);
				});

				socket.on("error", () => {
					connections.delete(connId);
				});
			});

			server.on("error", (err) => {
				reject(err);
			});

			server.on("listening", () => {
				const handle: WebSocketServerHandle = {
					id,
					type: this.type,
					address: config.listenAddress,
					isRunning: true,
					_internal: {
						server,
						connections,
						isProxy,
						targetAddress: config.targetAddress,
					},
				};

				this.servers.set(id, handle);
				resolve(handle);
			});
		});
	}

	/**
	 * Handle incoming message on server
	 */
	private async handleIncomingMessage(
		serverId: string,
		isProxy: boolean,
		targetAddress: { host: string; port: number } | undefined,
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
		const handlers = this.getMessageHandlers(serverId, message.type);

		if (handlers.length > 0) {
			const metadata: MessageMetadata = {
				...message.metadata,
				timestamp: Date.now(),
				direction: "inbound",
			};

			for (const handler of handlers) {
				try {
					const result = await handler(message.payload, metadata);
					if (result !== null && result !== undefined) {
						const responseMessage: Message = {
							type: `${message.type}Response`,
							payload: result,
							traceId: message.traceId,
							metadata: {
								timestamp: Date.now(),
								direction: "outbound",
							},
						};
						this.sendToSocket(clientSocket, responseMessage);
					}
				} catch (error) {
					// Handler error
				}
			}
			return;
		}

		// No handler - check if proxy mode
		if (isProxy && targetAddress) {
			await this.proxyMessage(message, targetAddress, clientSocket);
			return;
		}
	}

	/**
	 * Proxy message to target server
	 */
	private async proxyMessage(
		message: Message,
		targetAddress: { host: string; port: number },
		clientSocket: WebSocket,
	): Promise<void> {
		return new Promise((resolve, reject) => {
			const url = `ws://${targetAddress.host}:${targetAddress.port}`;
			const proxySocket = new WebSocket(url);

			proxySocket.on("open", () => {
				this.sendToSocket(proxySocket, message);
			});

			proxySocket.on("message", (data) => {
				try {
					const response = JSON.parse(data.toString()) as Message;
					// Forward response back to original client
					this.sendToSocket(clientSocket, response);
				} catch (err) {
					// Failed to parse proxy response
				}
			});

			proxySocket.on("close", () => {
				resolve();
			});

			proxySocket.on("error", (err) => {
				reject(err);
			});
		});
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
	 * Stop a WebSocket server
	 */
	async stopServer(server: AdapterServerHandle): Promise<void> {
		const handle = this.servers.get(server.id) as WebSocketServerHandle | undefined;
		if (!handle) {
			throw new Error(`Server ${server.id} not found`);
		}

		// Close all connections first
		for (const socket of handle._internal.connections.values()) {
			socket.removeAllListeners();
			socket.close();
		}
		handle._internal.connections.clear();

		// Clean up server-to-client socket mapping
		this.serverToClientSocket.delete(server.id);

		await new Promise<void>((resolve, reject) => {
			handle._internal.server.close((err) => {
				if (err) {
					reject(err);
				} else {
					handle.isRunning = false;
					this.cleanupServer(server.id);
					resolve();
				}
			});
		});

		// Delay to allow OS to release the port
		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	/**
	 * Create a real WebSocket client
	 */
	async createClient(config: AdapterClientConfig): Promise<WebSocketClientHandle> {
		const id = generateHandleId("ws-client");
		const protocol = config.tls?.enabled ? "wss" : "ws";
		const path = config.targetAddress.path || "";
		const url = `${protocol}://${config.targetAddress.host}:${config.targetAddress.port}${path}`;

		return new Promise((resolve, reject) => {
			const socket = new WebSocket(url);

			socket.on("open", () => {
				const handle: WebSocketClientHandle = {
					id,
					type: this.type,
					address: config.targetAddress,
					isConnected: true,
					_internal: {
						socket,
						pendingMessages: new Map(),
						messageQueue: [],
						url,
					},
				};

				// Handle incoming messages
				socket.on("message", (data) => {
					this.handleClientData(handle, data);
				});

				socket.on("close", () => {
					handle.isConnected = false;
				});

				socket.on("error", () => {
					handle.isConnected = false;
				});

				this.clients.set(id, handle);
				resolve(handle);
			});

			socket.on("error", (err) => {
				reject(err);
			});
		});
	}

	/**
	 * Handle incoming data on client socket
	 */
	private handleClientData(handle: WebSocketClientHandle, data: unknown): void {
		try {
			const message = JSON.parse(String(data)) as Message;
			this.deliverMessageToClient(handle, message);
		} catch (err) {
			// Failed to parse client message
		}
	}

	/**
	 * Deliver message to client (execute hooks, check pending or queue)
	 */
	private async deliverMessageToClient(handle: WebSocketClientHandle, incomingMessage: Message): Promise<void> {
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
		for (const [pendingId, pending] of Array.from(
			handle._internal.pendingMessages.entries(),
		)) {
			const types = Array.isArray(pending.messageType)
				? pending.messageType
				: [pending.messageType];

			if (types.includes(processedMessage.type)) {
				if (this.matchesPending(processedMessage, pending)) {
					clearTimeout(pending.timeout);
					handle._internal.pendingMessages.delete(pendingId);
					pending.resolve(processedMessage);
					return;
				}
			}
		}

		// Add to queue if no pending match
		handle._internal.messageQueue.push(processedMessage);
	}

	/**
	 * Close a WebSocket client
	 */
	async closeClient(client: AdapterClientHandle): Promise<void> {
		const handle = this.clients.get(client.id) as WebSocketClientHandle | undefined;
		if (!handle) {
			throw new Error(`Client ${client.id} not found`);
		}

		// Reject all pending messages
		for (const [, pending] of Array.from(
			handle._internal.pendingMessages.entries(),
		)) {
			clearTimeout(pending.timeout);
			pending.reject(new Error("Client disconnected"));
		}
		handle._internal.pendingMessages.clear();
		handle._internal.messageQueue = [];

		// Remove all listeners and close socket
		handle._internal.socket.removeAllListeners();
		handle._internal.socket.close();
		handle.isConnected = false;
		this.cleanupClient(client.id);
	}

	/**
	 * Send message from client over real WebSocket
	 */
	async sendMessage<T = unknown>(
		client: AdapterClientHandle,
		messageType: string,
		payload: T,
		metadata?: Partial<MessageMetadata>,
	): Promise<void> {
		const handle = this.clients.get(client.id) as WebSocketClientHandle | undefined;
		if (!handle) {
			throw new Error(`Client ${client.id} not found`);
		}

		if (!handle.isConnected) {
			throw new Error(`Client ${client.id} is not connected`);
		}

		const message: Message = {
			type: messageType,
			payload,
			traceId: metadata?.traceId as string | undefined,
			metadata: {
				timestamp: Date.now(),
				direction: "outbound",
				...metadata,
			},
		};

		// Send over real WebSocket
		this.sendToSocket(handle._internal.socket, message);
	}

	/**
	 * Wait for message on client
	 */
	async waitForMessage<T = unknown>(
		client: AdapterClientHandle,
		messageType: string | string[],
		matcher?: string | ((payload: T) => boolean),
		timeout = 30000,
	): Promise<Message> {
		const handle = this.clients.get(client.id) as WebSocketClientHandle | undefined;
		if (!handle) {
			throw new Error(`Client ${client.id} not found`);
		}

		if (!handle.isConnected) {
			throw new Error(`Client ${client.id} is not connected`);
		}

		// Check message queue first
		const types = Array.isArray(messageType) ? messageType : [messageType];
		const queuedMessage = this.findInQueue(
			handle,
			types,
			matcher as string | ((payload: unknown) => boolean) | undefined,
		);
		if (queuedMessage) {
			return queuedMessage;
		}

		// Wait for message
		return new Promise<Message>((resolve, reject) => {
			const pendingId = generateHandleId("pending");

			const timeoutHandle = setTimeout(() => {
				handle._internal.pendingMessages.delete(pendingId);
				reject(
					new Error(`Timeout waiting for message type: ${types.join(", ")}`),
				);
			}, timeout);

			handle._internal.pendingMessages.set(pendingId, {
				resolve,
				reject,
				messageType,
				matcher: matcher as
					| string
					| ((payload: unknown) => boolean)
					| undefined,
				timeout: timeoutHandle,
			});
		});
	}

	/**
	 * Find message in queue
	 */
	private findInQueue(
		handle: WebSocketClientHandle,
		types: string[],
		matcher?: string | ((payload: unknown) => boolean),
	): Message | undefined {
		const index = handle._internal.messageQueue.findIndex((msg) => {
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
			return handle._internal.messageQueue.splice(index, 1)[0];
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
}

/**
 * Create WebSocket adapter factory
 */
export function createWebSocketAdapter(): WebSocketAdapter {
	return new WebSocketAdapter();
}
