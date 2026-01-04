/**
 * WebSocket Protocol (v2)
 *
 * Implements async bidirectional messaging over WebSocket.
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
import { WebSocket, WebSocketServer } from "ws";
import type { WsServiceDefinition, WsProtocolOptions } from "./types";

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
 * 
 * // Server mode
 * await protocol.startServer(config, (connection) => {
 *   connection.onMessage("ping", undefined, (payload) => {
 *     connection.sendEvent("pong", { seq: payload.seq });
 *   });
 * });
 * 
 * // Client mode
 * const connection = await protocol.connect(config);
 * connection.onEvent("pong", undefined, (payload) => console.log(payload));
 * await connection.sendMessage("ping", { seq: 1 });
 * ```
 */
export class WebSocketProtocol<S extends WsServiceDefinition = WsServiceDefinition>
	extends BaseAsyncProtocol<S, WebSocket>
	implements IAsyncProtocol<S>
{
	readonly type = "websocket";

	/** Protocol options */
	private protocolOptions: WsProtocolOptions;

	/** Active WebSocket server */
	private wsServer?: WebSocketServer;

	/** Raw socket connections map: connId -> WebSocket */
	private rawConnections = new Map<string, WebSocket>();

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

	// =========================================================================
	// IAsyncProtocol Implementation
	// =========================================================================

	/**
	 * Start a WebSocket server
	 * @param config - Server configuration
	 * @param onConnection - Callback when client connects
	 */
	async startServer(
		config: ServerProtocolConfig,
		onConnection: (connection: IServerConnection) => void,
	): Promise<void> {
		return new Promise((resolve, reject) => {
			const server = new WebSocketServer({
				host: config.listenAddress.host,
				port: config.listenAddress.port,
			});

			server.on("connection", (socket) => {
				// Create connection wrapper and notify component
				const connection = this.createServerConnection(socket);
				this.rawConnections.set(connection.id, socket);
				onConnection(connection);
			});

			server.on("error", (err) => {
				reject(err);
			});

			server.on("listening", () => {
				this.wsServer = server;
				this.server.isRunning = true;
				resolve();
			});
		});
	}

	/**
	 * Stop the WebSocket server
	 */
	async stopServer(): Promise<void> {
		if (!this.wsServer) {
			return;
		}

		// Close all raw connections
		for (const socket of this.rawConnections.values()) {
			socket.removeAllListeners();
			socket.close();
		}
		this.rawConnections.clear();

		const server = this.wsServer;
		return new Promise<void>((resolve, reject) => {
			server.close((err) => {
				if (err) {
					reject(err);
				} else {
					this.wsServer = undefined;
					this.server.isRunning = false;
					resolve();
				}
			});
		});
	}

	/**
	 * Connect to a WebSocket server as a client
	 * @param config - Client configuration
	 * @returns IClientConnection for communicating with server
	 */
	async connect(config: ClientProtocolConfig): Promise<IClientConnection> {
		const protocol = config.tls?.enabled ? "wss" : "ws";
		const path = config.targetAddress.path || "";
		const url = `${protocol}://${config.targetAddress.host}:${config.targetAddress.port}${path}`;

		return new Promise((resolve, reject) => {
			const socket = new WebSocket(url);

			socket.on("open", () => {
				this.client.isConnected = true;
				const connection = this.createClientConnection(socket);
				resolve(connection);
			});

			socket.on("error", (err) => {
				reject(err);
			});
		});
	}

	// =========================================================================
	// Abstract Method Implementations (Protocol-Specific)
	// =========================================================================

	/**
	 * Send message through WebSocket
	 */
	protected async sendToSocket(socket: WebSocket, message: Message): Promise<void> {
		if (socket.readyState !== WebSocket.OPEN) {
			throw new Error("WebSocket is not open");
		}
		socket.send(JSON.stringify(message));
	}

	/**
	 * Close a WebSocket
	 */
	protected async closeSocket(socket: WebSocket): Promise<void> {
		socket.close();
	}

	/**
	 * Check if WebSocket is connected
	 */
	protected isSocketConnected(socket: WebSocket): boolean {
		return socket.readyState === WebSocket.OPEN;
	}

	/**
	 * Setup WebSocket event handlers
	 */
	protected setupSocketHandlers(
		socket: WebSocket,
		handlers: {
			onMessage: (message: Message) => void;
			onClose: () => void;
			onError: (error: Error) => void;
		},
	): void {
		socket.on("message", (data) => {
			try {
				const message = JSON.parse(data.toString()) as Message;
				handlers.onMessage(message);
			} catch (_err) {
				// Failed to parse message - ignore
			}
		});

		socket.on("close", () => {
			handlers.onClose();
		});

		socket.on("error", (err) => {
			handlers.onError(err);
		});
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
 * Create WebSocket protocol factory
 */
export function createWebSocketProtocol<S extends WsServiceDefinition>(
	options?: WsProtocolOptions,
): WebSocketProtocol<S> {
	return new WebSocketProtocol<S>(options);
}
