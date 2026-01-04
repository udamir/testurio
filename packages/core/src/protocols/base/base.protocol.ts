/**
 * Base Protocol
 *
 * Abstract base classes for sync and async protocol.
 * Provides common functionality while enforcing type safety at compile time.
 */

import type {
	SchemaDefinition,
	ClientProtocolConfig,
	ClientInstance,
	ServerProtocolConfig,
	ServerInstance,
	SyncRequestCallback,
	SyncOperations,
	Message,
	AsyncMessages,
	IClientConnection,
	IServerConnection,
} from "./base.types";
import { ClientConnectionImpl, type ClientConnectionDelegate } from "./client-connection";
import { ServerConnectionImpl, type ServerConnectionDelegate } from "./server-connection";
import { generateConnectionId } from "./connection.utils";


/**
 * Abstract base class with common protocol functionality
 *
 * Provides shared infrastructure for both sync and async protocols.
 * Not exported directly - use BaseSyncProtocol or BaseAsyncProtocol instead.
 */
abstract class BaseProtocol<S = unknown, C = unknown> {
	abstract readonly type: string;

	protected server: ServerInstance<S> = { isRunning: false };
	protected client: ClientInstance<C> = { isConnected: false };

	/**
	 * Load and parse schema files
	 * Default implementation returns empty schema
	 */
	async loadSchema(_schemaPath: string | string[]): Promise<SchemaDefinition> {
		return {
			type: "custom",
			content: {},
			validate: false,
		};
	}

	/**
	 * Stop a server/proxy
	 */
	abstract stopServer(): Promise<void>;

	/**
	 * Dispose protocol and release all resources
	 */
	async dispose(): Promise<void> {
		try {
			await this.stopServer();
		} catch {
			// Ignore errors during cleanup
		}
		this.server = { isRunning: false };
		this.client = { isConnected: false };
	}
}

/**
 * Base class for sync protocol (HTTP, gRPC Unary)
 *
 * Provides common functionality for request/response protocols.
 * Use this for protocols where each request gets exactly one response.
 * 
 * @template T - Service definition type (operation name -> { request, response })
 * @template TReq - Raw request type for the protocol
 * @template TRes - Raw response type for the protocol
 */
export abstract class BaseSyncProtocol<T extends SyncOperations<T> = SyncOperations, TReq = unknown, TRes = unknown> extends BaseProtocol {
	/**
	 * Phantom type properties for type inference.
	 * These properties are never assigned at runtime - they exist only for TypeScript.
	 */
	declare readonly $types: T;
	declare readonly $request: TReq;
	declare readonly $response: TRes;
	
	protected requestHandler?: SyncRequestCallback<TReq, TRes>;

	public setRequestHandler(callback: SyncRequestCallback<TReq, TRes>): void {
		this.requestHandler = callback;
	}
}

/**
 * Base class for async protocol (WebSocket, TCP, gRPC Stream)
 *
 * Provides common functionality for bidirectional message protocols.
 * Subclasses implement transport-specific operations.
 * 
 * v2 Design:
 * - Protocol handles transport only (sockets, framing, encoding)
 * - Connection wrappers handle handler registration and matching
 * - Components handle hooks, sessions, and business logic
 * 
 * @template M - Message definition type
 * @template TSocket - Type of the raw socket (e.g., WebSocket, TcpClient)
 */
export abstract class BaseAsyncProtocol<M extends AsyncMessages = AsyncMessages, TSocket = unknown> extends BaseProtocol {
	/**
	 * Phantom type property for type inference.
	 * Used by components to infer message types via ProtocolMessages<A>.
	 */
	declare readonly $types: M;

	// =========================================================================
	// Connection Management (v2)
	// =========================================================================

	/** Server connections: connId -> IServerConnection wrapper */
	protected serverConnections = new Map<string, ServerConnectionImpl>();

	/** Client connection (single) */
	protected clientConnection?: ClientConnectionImpl;

	/** Raw server instance */
	protected rawServer?: TSocket;

	/** Raw client socket */
	protected rawClientSocket?: TSocket;

	// =========================================================================
	// IAsyncProtocol Implementation
	// =========================================================================

	/**
	 * Start server and listen for connections
	 * @param config - Server configuration
	 * @param onConnection - Callback when client connects, receives IServerConnection
	 */
	abstract startServer(
		config: ServerProtocolConfig,
		onConnection: (connection: IServerConnection) => void,
	): Promise<void>;

	/**
	 * Connect to a server as a client
	 * @param config - Client configuration
	 * @returns IClientConnection for communicating with server
	 */
	abstract connect(config: ClientProtocolConfig): Promise<IClientConnection>;

	// =========================================================================
	// Connection Wrapper Factory Methods
	// =========================================================================

	/**
	 * Create a server connection wrapper for an incoming client
	 * Called by subclasses when a new client connects
	 */
	protected createServerConnection(
		socket: TSocket,
		connId?: string,
	): ServerConnectionImpl {
		const id = connId ?? generateConnectionId("server");
		
		const delegate: ServerConnectionDelegate = {
			sendEvent: (eventType, payload, traceId) => 
				this.sendToSocket(socket, { type: eventType, payload, traceId }),
			close: () => this.closeSocket(socket),
			isConnected: () => this.isSocketConnected(socket),
		};

		const connection = new ServerConnectionImpl(delegate, id);
		this.serverConnections.set(id, connection);

		// Setup socket event handlers
		this.setupSocketHandlers(socket, {
			onMessage: (message) => connection._dispatchMessage(message),
			onClose: () => {
				connection._notifyClose();
				this.serverConnections.delete(id);
			},
			onError: (error) => connection._notifyError(error),
		});

		return connection;
	}

	/**
	 * Create a client connection wrapper
	 * Called by subclasses when connecting to a server
	 */
	protected createClientConnection(
		socket: TSocket,
		connId?: string,
	): ClientConnectionImpl {
		const id = connId ?? generateConnectionId("client");

		const delegate: ClientConnectionDelegate = {
			sendMessage: (messageType, payload, traceId) =>
				this.sendToSocket(socket, { type: messageType, payload, traceId }),
			close: () => this.closeSocket(socket),
			isConnected: () => this.isSocketConnected(socket),
		};

		const connection = new ClientConnectionImpl(delegate, id);
		this.clientConnection = connection;
		this.rawClientSocket = socket;

		// Setup socket event handlers
		this.setupSocketHandlers(socket, {
			onMessage: (message) => connection._dispatchEvent(message),
			onClose: () => {
				connection._notifyClose();
				this.clientConnection = undefined;
				this.rawClientSocket = undefined;
			},
			onError: (error) => connection._notifyError(error),
		});

		return connection;
	}

	// =========================================================================
	// Abstract Methods (Protocol-Specific)
	// =========================================================================

	/**
	 * Send message through socket
	 * Subclasses implement serialization and transport
	 */
	protected abstract sendToSocket(socket: TSocket, message: Message): Promise<void>;

	/**
	 * Close a socket
	 */
	protected abstract closeSocket(socket: TSocket): Promise<void>;

	/**
	 * Check if socket is connected
	 */
	protected abstract isSocketConnected(socket: TSocket): boolean;

	/**
	 * Setup socket event handlers (message, close, error)
	 * Called when creating connection wrappers
	 */
	protected abstract setupSocketHandlers(
		socket: TSocket,
		handlers: {
			onMessage: (message: Message) => void;
			onClose: () => void;
			onError: (error: Error) => void;
		},
	): void;

	// =========================================================================
	// Lifecycle
	// =========================================================================

	/**
	 * Dispose protocol and release all resources
	 */
	override async dispose(): Promise<void> {
		// Close all server connections
		for (const connection of this.serverConnections.values()) {
			try {
				await connection.close();
			} catch {
				// Ignore errors during cleanup
			}
		}
		this.serverConnections.clear();

		// Close client connection
		if (this.clientConnection) {
			try {
				await this.clientConnection.close();
			} catch {
				// Ignore errors during cleanup
			}
			this.clientConnection = undefined;
		}

		await super.dispose();
	}
}
