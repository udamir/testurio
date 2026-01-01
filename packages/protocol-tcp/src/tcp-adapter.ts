/**
 * TCP Protocol
 *
 * Protocol for TCP with Protocol Buffers supporting:
 * - Async bidirectional messaging
 * - Client connections (real TCP sockets)
 * - Mock servers (real TCP servers)
 * - Proxy servers (real TCP proxy)
 */

import * as net from "node:net";
import type {
	ClientProtocolConfig,
	AdapterClientHandle,
	ServerAdapterConfig,
	AdapterServerHandle,
	IAsyncProtocol,
	Message,
	MessageMetadata,
	ProtocolCharacteristics,
	SchemaDefinition,
} from "testurio";
import { BaseAsyncProtocol, generateHandleId } from "testurio";
import type { TcpAdapterTypes, TcpProtocolDefinition } from "./types";

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
 * TCP-specific server handle
 */
interface TcpServerHandle extends AdapterServerHandle {
	_internal: {
		server: net.Server;
		connections: Map<string, net.Socket>;
		isProxy: boolean;
		targetAddress?: { host: string; port: number };
	};
}

/**
 * TCP-specific client handle
 */
interface TcpClientHandle extends AdapterClientHandle {
	_internal: {
		socket: net.Socket;
		pendingMessages: Map<string, PendingMessage>;
		messageQueue: Message[];
		messageHandlers: Map<string, ((message: Message) => void)[]>;
		buffer: string;
	};
}

/**
 * TCP adapter options
 */
export interface TcpAdapterOptions {
	/** Protocol buffer schema path */
	schema?: string;
	/** Connection timeout in milliseconds */
	timeout?: number;
}

/**
 * TCP Protocol Adapter
 *
 * Provides TCP client and server functionality for testing.
 * Uses real TCP servers and sockets for actual network communication.
 *
 * @template M - Message types map for type-safe messaging
 *
 * @example
 * ```typescript
 * type MyMessages = {
 *   Request: { data: string };
 *   Response: { result: string };
 * };
 *
 * const adapter = new TcpAdapter<MyMessages>();
 * const client = new AsyncClient("tcp", { adapter, ... });
 * // client.sendMessage("Request", { data: "test" }) is now type-safe
 * ```
 */
export class TcpAdapter<
		P extends TcpProtocolDefinition = TcpProtocolDefinition,
	>
	extends BaseAsyncProtocol
	implements IAsyncProtocol
{
	/**
	 * Phantom type property for type inference.
	 * Used by components to infer message types.
	 */
	declare readonly __types: TcpAdapterTypes<P>;

	readonly type = "tcp-proto";

	readonly characteristics: ProtocolCharacteristics = {
		type: "tcp-proto",
		async: true,
		supportsProxy: true,
		supportsMock: true,
		streaming: true,
		requiresConnection: true,
		bidirectional: true,
	};

	private options: TcpAdapterOptions;

	// Map server ID to client socket for routing responses
	private serverToClientSocket: Map<string, net.Socket> = new Map();

	constructor(options: TcpAdapterOptions = {}) {
		super();
		this.options = options;
	}

	/**
	 * Get adapter options
	 */
	getOptions(): TcpAdapterOptions {
		return this.options;
	}

	/**
	 * Load Protobuf schema
	 */
	async loadSchema(schemaPath: string | string[]): Promise<SchemaDefinition> {
		const paths = Array.isArray(schemaPath) ? schemaPath : [schemaPath];

		// In a real implementation, this would load and parse .proto files
		return {
			type: "protobuf",
			content: { paths: paths.join(",") },
			validate: true,
		};
	}

	/**
	 * Start a real TCP server (mock or proxy)
	 */
	async startServer(config: ServerAdapterConfig): Promise<TcpServerHandle> {
		const id = generateHandleId("tcp-server");
		const isProxy = !!config.targetAddress;

		return new Promise((resolve, reject) => {
			const connections = new Map<string, net.Socket>();

			const server = net.createServer((socket) => {
				const connId = generateHandleId("conn");
				connections.set(connId, socket);

				// Store socket for response routing
				this.serverToClientSocket.set(id, socket);

				let buffer = "";

				socket.on("data", async (data) => {
					buffer += data.toString();

					// Parse length-prefixed messages
					while (buffer.length > 0) {
						const delimiterIndex = buffer.indexOf("\n");
						if (delimiterIndex === -1) break;

						const messageStr = buffer.slice(0, delimiterIndex);
						buffer = buffer.slice(delimiterIndex + 1);

						try {
							const message = JSON.parse(messageStr) as Message;
							await this.handleIncomingMessage(
								id,
								isProxy,
								config.targetAddress,
								message,
								socket,
							);
						} catch (err) {
							// Failed to parse message
						}
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

			server.listen(
				config.listenAddress.port,
				config.listenAddress.host,
				() => {
					const handle: TcpServerHandle = {
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
				},
			);
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
		clientSocket: net.Socket,
	): Promise<void> {
		// Try hook-based handlers first (declarative API)
		// Each component owns its own HookRegistry, so no componentName lookup needed
		if (this.hookRegistry) {
			const hookResult = await this.hookRegistry.executeHooks(message);

			if (hookResult === null) {
				// Message was dropped by hook
				return;
			}

			// Check if hook transformed message into a response
			if (hookResult.type !== message.type) {
				// Hook returned a different message type (e.g., OrderRequestResponse)
				this.sendToSocket(clientSocket, hookResult);
				return;
			}
		}

		// Fall back to direct handlers
		const handlers = this.getMessageHandlers(serverId, message.type);

		if (handlers.length > 0) {
			const metadata: MessageMetadata = {
				timestamp: Date.now(),
				direction: "inbound",
				...message.metadata,
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
		clientSocket: net.Socket,
	): Promise<void> {
		return new Promise((resolve, reject) => {
			const proxySocket = net.createConnection(targetAddress, () => {
				this.sendToSocket(proxySocket, message);
			});

			let buffer = "";

			proxySocket.on("data", (data) => {
				buffer += data.toString();

				while (buffer.length > 0) {
					const delimiterIndex = buffer.indexOf("\n");
					if (delimiterIndex === -1) break;

					const messageStr = buffer.slice(0, delimiterIndex);
					buffer = buffer.slice(delimiterIndex + 1);

					try {
						const response = JSON.parse(messageStr) as Message;
						// Forward response back to original client
						this.sendToSocket(clientSocket, response);
					} catch (err) {
						// Failed to parse proxy response
					}
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
	 * Send message to socket (length-prefixed JSON)
	 */
	private sendToSocket(socket: net.Socket, message: Message): void {
		const data = `${JSON.stringify(message)}\n`;
		socket.write(data);
	}

	/**
	 * Stop a TCP server
	 */
	async stopServer(server: AdapterServerHandle): Promise<void> {
		const handle = this.servers.get(server.id) as TcpServerHandle | undefined;
		if (!handle) {
			throw new Error(`Server ${server.id} not found`);
		}

		// Close all connections first
		for (const socket of handle._internal.connections.values()) {
			socket.removeAllListeners();
			socket.destroy();
		}
		handle._internal.connections.clear();

		// Clean up server-to-client socket mapping
		this.serverToClientSocket.delete(server.id);

		await new Promise<void>((resolve, reject) => {
			// Prevent new connections
			handle._internal.server.removeAllListeners("connection");

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
	 * Create a real TCP client
	 */
	async createClient(config: ClientAdapterConfig): Promise<TcpClientHandle> {
		const id = generateHandleId("tcp-client");

		return new Promise((resolve, reject) => {
			const socket = net.createConnection(config.targetAddress, () => {
				const handle: TcpClientHandle = {
					id,
					type: this.type,
					address: config.targetAddress,
					isConnected: true,
					_internal: {
						socket,
						pendingMessages: new Map(),
						messageQueue: [],
						messageHandlers: new Map(),
						buffer: "",
					},
				};

				// Handle incoming messages
				socket.on("data", (data) => {
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
	private handleClientData(handle: TcpClientHandle, data: Buffer): void {
		handle._internal.buffer += data.toString();

		while (handle._internal.buffer.length > 0) {
			const delimiterIndex = handle._internal.buffer.indexOf("\n");
			if (delimiterIndex === -1) break;

			const messageStr = handle._internal.buffer.slice(0, delimiterIndex);
			handle._internal.buffer = handle._internal.buffer.slice(
				delimiterIndex + 1,
			);

			try {
				const message = JSON.parse(messageStr) as Message;
				this.deliverMessageToClient(handle, message);
			} catch (err) {
				// Failed to parse client message
			}
		}
	}

	/**
	 * Deliver message to client (execute hooks, check pending or queue)
	 */
	private async deliverMessageToClient(
		handle: TcpClientHandle,
		incomingMessage: Message,
	): Promise<void> {
		// Execute hooks first (for client-side message processing)
		// Each component owns its own HookRegistry
		let processedMessage = incomingMessage;
		if (this.hookRegistry) {
			const hookResult = await this.hookRegistry.executeHooks(incomingMessage);
			if (hookResult === null) {
				// Message was dropped by hook
				return;
			}
			// Use transformed message
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
	 * Close a TCP client
	 */
	async closeClient(client: AdapterClientHandle): Promise<void> {
		const handle = this.clients.get(client.id) as TcpClientHandle | undefined;
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

		// Remove all listeners and destroy socket
		handle._internal.socket.removeAllListeners();
		handle._internal.socket.destroy();
		handle.isConnected = false;
		this.cleanupClient(client.id);
	}

	/**
	 * Send message from client over real TCP
	 */
	async sendMessage<T = unknown>(
		client: AdapterClientHandle,
		messageType: string,
		payload: T,
		metadata?: Partial<MessageMetadata>,
	): Promise<void> {
		const handle = this.clients.get(client.id) as TcpClientHandle | undefined;
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

		// Send over real TCP socket
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
		const handle = this.clients.get(client.id) as TcpClientHandle | undefined;
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
		handle: TcpClientHandle,
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
 * Create TCP adapter factory
 */
export function createTcpAdapter(): TcpAdapter {
	return new TcpAdapter();
}
