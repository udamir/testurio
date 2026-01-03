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
import type { TcpServiceDefinition, TcpProtocolOptions, ISocket } from "./types";
import { TcpClient } from "./tcp.client";
import { TcpServer } from "./tcp.server";

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
	extends BaseAsyncProtocol<S, TcpClient>
	implements IAsyncProtocol
{
	readonly type = "tcp";

	/** Public server/client handles */
	public server: { isRunning: boolean } = {
		isRunning: false,
	};
	public client: { isConnected: boolean } = {
		isConnected: false,
	};

	/** Protocol options */
	private protocolOptions: TcpProtocolOptions;

	/** Active TCP server */
	private tcpServer?: TcpServer;

	/** Active TCP client socket (for client mode) */
	private tcpClient?: TcpClient;

	/** Server connections map: socketId -> incoming socket */
	private connections = new Map<string, ISocket>();

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
		this.tcpServer = new TcpServer();

		this.tcpServer.on("connection", (socket) => {
			this.connections.set(socket.id, socket);

			// In proxy mode, create dedicated outgoing connection for this client
			if (this.proxyTargetConfig) {
				const connectionPromise = this.createProxyClientForSocket(socket.id).catch(() => {
					// Connection to backend failed - close incoming socket
					socket.close();
				});
				this.pendingProxyConnections.set(socket.id, connectionPromise);
			}
		});

		this.tcpServer.on("message", async (socket, data) => {
			try {
				const str = typeof data === "string" ? data : new TextDecoder().decode(data);
				const message = JSON.parse(str) as Message;
				await this.handleIncomingMessage(message, socket);
			} catch (_err) {
				// Failed to parse message
			}
		});

		this.tcpServer.on("disconnect", (socket) => {
			this.connections.delete(socket.id);
			this.removeProxyClient(socket.id);
		});

		this.tcpServer.on("error", (_err, socket) => {
			if (socket) {
				this.connections.delete(socket.id);
				this.removeProxyClient(socket.id);
			}
		});

		await this.tcpServer.listen(
			config.listenAddress.host,
			config.listenAddress.port,
			{
				timeout: this.protocolOptions.timeout,
				lengthFieldLength: this.protocolOptions.lengthFieldLength ?? 0,
				maxLength: this.protocolOptions.maxLength,
				encoding: this.protocolOptions.lengthFieldLength ? "binary" : "utf-8",
				delimiter: this.protocolOptions.delimiter ?? "\n",
				tls: config.tls?.enabled,
				cert: config.tls?.cert,
				key: config.tls?.key,
			},
		);

		this.server.isRunning = true;
		this.serverListenConfig = { host: config.listenAddress.host, port: config.listenAddress.port };
	}

	/**
	 * Handle incoming message on server
	 */
	private async handleIncomingMessage(
		message: Message,
		clientSocket: ISocket,
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
				await this.sendToSocket(clientSocket, hookResult);
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
						await this.sendToSocket(clientSocket, responseMessage);
					}
				} catch (_error) {
					// Handler error
				}
			}
			return;
		}

		// If in proxy mode, forward message through the dedicated proxy client
		await this.waitForProxyConnection(clientSocket.id);

		const proxyClient = this.getProxyClient(clientSocket.id);
		if (proxyClient) {
			await this.sendToProxyClient(proxyClient, message);
		}
	}

	/**
	 * Send message to socket
	 */
	private async sendToSocket(socket: ISocket, message: Message): Promise<void> {
		if (!socket.connected) return;

		const json = JSON.stringify(message);

		if (this.protocolOptions.lengthFieldLength) {
			// Binary mode - use framed send
			const data = new TextEncoder().encode(json);
			await socket.send(data);
		} else {
			// Text mode - add delimiter
			const data = new TextEncoder().encode(json + this.delimiter);
			await socket.write(data);
		}
	}

	/**
	 * Stop the TCP server
	 */
	async stopServer(): Promise<void> {
		if (!this.tcpServer) {
			return;
		}

		await this.tcpServer.close();
		this.connections.clear();
		this.clearProxyState();
		this.tcpServer = undefined;
		this.server.isRunning = false;
	}

	/**
	 * Create a TCP client connection
	 * In proxy mode (server already running and connecting to different target),
	 * this stores config for per-connection clients.
	 * In client/loopback mode, this creates a single client connection.
	 */
	async createClient(config: ClientProtocolConfig): Promise<void> {
		if (this.isProxyMode(config)) {
			this.proxyTargetConfig = config;
			// Create proxy clients for existing connections
			for (const socketId of this.connections.keys()) {
				await this.createProxyClientForSocket(socketId);
			}
			this.client.isConnected = true;
			return;
		}

		// Client mode - create single client connection
		this.tcpClient = new TcpClient();

		this.tcpClient.on("message", (data) => {
			try {
				const str = typeof data === "string" ? data : new TextDecoder().decode(data);
				const message = JSON.parse(str) as Message;
				this.deliverMessageToClient(message);
			} catch (_err) {
				// Failed to parse client message
			}
		});

		this.tcpClient.on("error", () => {
			this.client.isConnected = false;
		});

		this.tcpClient.on("end", () => {
			this.client.isConnected = false;
		});

		await this.tcpClient.connect(
			config.targetAddress.host,
			config.targetAddress.port,
			{
				timeout: this.protocolOptions.timeout,
				lengthFieldLength: this.protocolOptions.lengthFieldLength ?? 0,
				maxLength: this.protocolOptions.maxLength,
				encoding: this.protocolOptions.lengthFieldLength ? "binary" : "utf-8",
				delimiter: this.protocolOptions.delimiter ?? "\n",
				tls: this.protocolOptions.tls,
				serverName: this.protocolOptions.serverName,
				insecureSkipVerify: this.protocolOptions.insecureSkipVerify,
			},
		);

		this.client.isConnected = true;
	}

	/**
	 * Close a specific proxy client (implements abstract method)
	 */
	protected closeProxyClient(client: TcpClient): void {
		client.close();
	}

	/**
	 * Create a proxy client for a specific incoming connection
	 */
	private async createProxyClientForSocket(socketId: string): Promise<void> {
		if (!this.proxyTargetConfig) return;

		const proxyClient = new TcpClient();
		const incomingSocket = this.connections.get(socketId);

		proxyClient.on("message", async (data) => {
			try {
				const str = typeof data === "string" ? data : new TextDecoder().decode(data);
				const message = JSON.parse(str) as Message;
				// Forward response back to the linked incoming socket
				if (incomingSocket?.connected) {
					await this.sendToSocket(incomingSocket, message);
				}
			} catch (_err) {
				// Failed to parse message
			}
		});

		proxyClient.on("error", () => {
			this.proxyClients.delete(socketId);
		});

		proxyClient.on("end", () => {
			this.proxyClients.delete(socketId);
		});

		await proxyClient.connect(
			this.proxyTargetConfig.targetAddress.host,
			this.proxyTargetConfig.targetAddress.port,
			{
				timeout: this.protocolOptions.timeout,
				lengthFieldLength: this.protocolOptions.lengthFieldLength ?? 0,
				maxLength: this.protocolOptions.maxLength,
				encoding: this.protocolOptions.lengthFieldLength ? "binary" : "utf-8",
				delimiter: this.protocolOptions.delimiter ?? "\n",
				tls: this.proxyTargetConfig.tls?.enabled,
				serverName: this.protocolOptions.serverName,
				insecureSkipVerify: this.protocolOptions.insecureSkipVerify,
			},
		);

		this.proxyClients.set(socketId, proxyClient);
	}

	/**
	 * Send message through a proxy client (protocol-specific framing)
	 */
	private async sendToProxyClient(proxyClient: TcpClient, message: Message): Promise<void> {
		const json = JSON.stringify(message);

		if (this.protocolOptions.lengthFieldLength) {
			const data = new TextEncoder().encode(json);
			await proxyClient.send(data);
		} else {
			const data = new TextEncoder().encode(json + this.delimiter);
			await proxyClient.write(data);
		}
	}

	/**
	 * Close the TCP client
	 */
	async closeClient(): Promise<void> {
		this.rejectAllPendingMessages(new Error("Client disconnected"));
		this.closeAllProxyClients();
		this.proxyTargetConfig = undefined;

		// Close single client
		if (this.tcpClient) {
			this.tcpClient.close();
			this.tcpClient = undefined;
		}

		this.client.isConnected = false;
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

		await this.sendToClient(message);
	}

	/**
	 * Send message to client socket
	 */
	private async sendToClient(message: Message): Promise<void> {
		if (!this.tcpClient) return;

		const json = JSON.stringify(message);

		if (this.protocolOptions.lengthFieldLength) {
			// Binary mode - use framed send
			const data = new TextEncoder().encode(json);
			await this.tcpClient.send(data);
		} else {
			// Text mode - add delimiter
			const data = new TextEncoder().encode(json + this.delimiter);
			await this.tcpClient.write(data);
		}
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
