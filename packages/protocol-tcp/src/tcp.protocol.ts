/**
 * TCP Protocol (v2)
 *
 * Implements async bidirectional messaging over TCP.
 * 
 * v2 Design:
 * - Protocol handles transport only (sockets, framing, encoding)
 * - Connection wrappers handle handler registration and matching
 * - Components handle hooks, sessions, and business logic
 *
 * @template S - Service definition type with clientMessages/serverMessages
 */

import type {
	ClientProtocolConfig,
	ServerProtocolConfig,
	IAsyncProtocol,
	IClientConnection,
	IServerConnection,
	Message,
	SchemaDefinition,
} from "testurio";
import { BaseAsyncProtocol } from "testurio";
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
 * 
 * // Server mode
 * await protocol.startServer(config, (connection) => {
 *   connection.onMessage("OrderRequest", undefined, async (payload) => {
 *     await connection.sendEvent("OrderResponse", { orderId: payload.orderId, status: "ok" });
 *   });
 * });
 * 
 * // Client mode
 * const connection = await protocol.connect(config);
 * connection.onEvent("OrderResponse", undefined, (payload) => console.log(payload));
 * await connection.sendMessage("OrderRequest", { orderId: "123", quantity: 5 });
 * ```
 */
export class TcpProtocol<S extends TcpServiceDefinition = TcpServiceDefinition>
	extends BaseAsyncProtocol<S, ISocket>
	implements IAsyncProtocol
{
	readonly type = "tcp";

	/** Protocol options */
	private protocolOptions: TcpProtocolOptions;

	/** Active TCP server */
	private tcpServer?: TcpServer;

	/** Raw socket connections map: socketId -> ISocket */
	private rawConnections = new Map<string, ISocket>();

	/** Per-connection handlers for server mode */
	private connectionHandlers = new Map<string, {
		onMessage: (message: Message) => void;
		onClose: () => void;
		onError: (error: Error) => void;
	}>();

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

	// =========================================================================
	// IAsyncProtocol Implementation
	// =========================================================================

	/**
	 * Start a TCP server
	 * @param config - Server configuration
	 * @param onConnection - Callback when client connects
	 */
	async startServer(
		config: ServerProtocolConfig,
		onConnection: (connection: IServerConnection) => void,
	): Promise<void> {
		this.tcpServer = new TcpServer();

		this.tcpServer.on("connection", (socket) => {
			// Create connection wrapper and notify component
			const connection = this.createServerConnection(socket, socket.id);
			this.rawConnections.set(socket.id, socket);
			onConnection(connection);
		});

		this.tcpServer.on("message", (socket, data) => {
			// Dispatch to per-connection handler
			const handlers = this.connectionHandlers.get(socket.id);
			if (handlers) {
				try {
					const str = typeof data === "string" ? data : new TextDecoder().decode(data);
					const message = JSON.parse(str) as Message;
					handlers.onMessage(message);
				} catch (_err) {
					// Failed to parse message
				}
			}
		});

		this.tcpServer.on("disconnect", (socket) => {
			const handlers = this.connectionHandlers.get(socket.id);
			if (handlers) {
				handlers.onClose();
				this.connectionHandlers.delete(socket.id);
			}
			this.rawConnections.delete(socket.id);
		});

		this.tcpServer.on("error", (err, socket) => {
			if (socket) {
				const handlers = this.connectionHandlers.get(socket.id);
				if (handlers) {
					handlers.onError(err);
					handlers.onClose();
					this.connectionHandlers.delete(socket.id);
				}
				this.rawConnections.delete(socket.id);
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
	}

	/**
	 * Stop the TCP server
	 */
	async stopServer(): Promise<void> {
		if (!this.tcpServer) {
			return;
		}

		await this.tcpServer.close();
		this.rawConnections.clear();
		this.tcpServer = undefined;
		this.server.isRunning = false;
	}

	/**
	 * Connect to a TCP server as a client
	 * @param config - Client configuration
	 * @returns IClientConnection for communicating with server
	 */
	async connect(config: ClientProtocolConfig): Promise<IClientConnection> {
		const tcpClient = new TcpClient();

		await tcpClient.connect(
			config.targetAddress.host,
			config.targetAddress.port,
			{
				timeout: this.protocolOptions.timeout,
				lengthFieldLength: this.protocolOptions.lengthFieldLength ?? 0,
				maxLength: this.protocolOptions.maxLength,
				encoding: this.protocolOptions.lengthFieldLength ? "binary" : "utf-8",
				delimiter: this.protocolOptions.delimiter ?? "\n",
				tls: config.tls?.enabled ?? this.protocolOptions.tls,
				serverName: this.protocolOptions.serverName,
				insecureSkipVerify: this.protocolOptions.insecureSkipVerify,
			},
		);

		this.client.isConnected = true;

		// Create a mutable socket state wrapper for TcpClient
		const socketState = { connected: true };
		const socketWrapper: ISocket = {
			id: `client-${Date.now()}`,
			remoteAddress: config.targetAddress.host,
			remotePort: config.targetAddress.port,
			get connected() { return socketState.connected; },
			close: () => tcpClient.close(),
			send: (data) => tcpClient.send(data),
			write: (data) => tcpClient.write(data),
		};

		const connection = this.createClientConnection(socketWrapper);

		// Setup TcpClient event handlers to dispatch to connection wrapper
		tcpClient.on("message", (data) => {
			try {
				const str = typeof data === "string" ? data : new TextDecoder().decode(data);
				const message = JSON.parse(str) as Message;
				connection._dispatchEvent(message);
			} catch (_err) {
				// Failed to parse message
			}
		});

		tcpClient.on("error", (err) => {
			this.client.isConnected = false;
			socketState.connected = false;
			connection._notifyError(err);
		});

		tcpClient.on("end", () => {
			this.client.isConnected = false;
			socketState.connected = false;
			connection._notifyClose();
		});

		return connection;
	}

	// =========================================================================
	// Abstract Method Implementations (Protocol-Specific)
	// =========================================================================

	/**
	 * Send message through TCP socket
	 */
	protected async sendToSocket(socket: ISocket, message: Message): Promise<void> {
		if (!socket.connected) {
			throw new Error("Socket is not connected");
		}

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
	 * Close a TCP socket
	 */
	protected async closeSocket(socket: ISocket): Promise<void> {
		socket.close();
	}

	/**
	 * Check if TCP socket is connected
	 */
	protected isSocketConnected(socket: ISocket): boolean {
		return socket.connected;
	}

	/**
	 * Setup TCP socket event handlers
	 * Note: For server sockets, handlers are stored per-connection and dispatched from global handlers.
	 * For client connections, handlers are set up in connect() method directly on TcpClient.
	 */
	protected setupSocketHandlers(
		socket: ISocket,
		handlers: {
			onMessage: (message: Message) => void;
			onClose: () => void;
			onError: (error: Error) => void;
		},
	): void {
		// For server connections, store handlers per-connection
		// The global handlers in startServer() will dispatch to these
		if (this.tcpServer) {
			this.connectionHandlers.set(socket.id, handlers);
		}
		// For client connections, handlers are set up in connect() method directly on TcpClient
	}

	/**
	 * Dispose protocol and release all resources
	 */
	override async dispose(): Promise<void> {
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
