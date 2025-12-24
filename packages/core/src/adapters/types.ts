/**
 * Protocol Adapter Types
 *
 * Type definitions for protocol adapters.
 */

import type { HookRegistry } from "../hooks";
import type {
	Address,
	AuthConfig,
	Message,
	MessageMetadata,
	ProtocolCharacteristics,
	ProtocolOptions,
	SchemaDefinition,
	TlsConfig,
} from "../types";

/**
 * Server handle for managing server lifecycle
 */
export interface AdapterServerHandle {
	id: string; // Unique server ID
	type: string; // Protocol type
	address: Address; // Listen address
	isRunning: boolean; // Whether the server is running
	_internal?: unknown; // Internal server instance (protocol-specific)
}

/**
 * Client handle for managing client lifecycle
 */
export interface AdapterClientHandle {
	id: string; // Unique client ID
	type: string; // Protocol type
	address: Address; // Target address
	isConnected: boolean; // Whether the client is connected
	_internal?: unknown; // Internal client instance (protocol-specific)
}

/**
 * Request handler callback for sync adapters
 * Called by adapter when a request is received, delegates to component
 */
export type SyncRequestCallback = (message: Message) => Promise<Message | null>;

/**
 * Adapter-level server configuration for starting a server/proxy
 */
export interface AdapterServerConfig {
	listenAddress: Address; // Address to listen on
	targetAddress?: Address; // Target address for proxy mode (absent for mock)
	schema?: SchemaDefinition; // Schema definition
	options?: ProtocolOptions; // Protocol-specific options
	tls?: TlsConfig; // TLS configuration
	/** Request handler callback - adapter calls this to delegate request handling to component */
	onRequest?: SyncRequestCallback;
}

/**
 * Adapter-level client configuration for creating a client connection
 */
export interface AdapterClientConfig {
	targetAddress: Address; // Target address to connect to
	schema?: SchemaDefinition; // Schema definition
	options?: ProtocolOptions; // Protocol-specific options
	tls?: TlsConfig; // TLS configuration
	auth?: AuthConfig; // Authentication configuration
}

/**
 * Message handler for server/proxy
 */
export type MessageHandler<T = unknown> = (
	payload: T,
	metadata: MessageMetadata,
) => T | Promise<T> | null | Promise<null>;

/**
 * Request handler for sync protocols (HTTP, gRPC unary)
 */
export type RequestHandler<TReq = unknown, TRes = unknown> = (
	request: TReq,
	metadata: MessageMetadata,
) => TRes | Promise<TRes>;

/**
 * Base adapter interface with common lifecycle methods
 *
 * All adapters (sync and async) share these common operations.
 */
export interface BaseAdapter {
	readonly type: string; // Protocol type identifier
	readonly characteristics: ProtocolCharacteristics; // Protocol characteristics

	/**
	 * Load and parse schema files
	 */
	loadSchema?(schemaPath: string | string[]): Promise<SchemaDefinition>;

	/**
	 * Set the hook registry for component-based message handling
	 * Each component owns its own HookRegistry and passes it to its adapter
	 */
	setHookRegistry?(registry: HookRegistry): void;

	/**
	 * Dispose adapter and release all resources
	 * Closes all servers, clients, and clears internal state
	 */
	dispose(): Promise<void>;
}

/**
 * Base sync request options - common fields for all sync adapters
 * Adapters can extend this with protocol-specific options.
 */
export interface BaseSyncRequestOptions {
	/** Request payload/body */
	payload?: unknown;
	/** Request timeout in milliseconds */
	timeout?: number;
}

/**
 * Sync adapter for request/response protocols (HTTP, gRPC Unary)
 *
 * Sync adapters handle protocols where each request gets exactly one response.
 * @template TOptions - Adapter-specific request options type
 */
export interface SyncAdapter<TOptions extends BaseSyncRequestOptions = BaseSyncRequestOptions> extends BaseAdapter {
	/**
	 * Resolve message type from operationId and adapter-specific options.
	 * This allows adapters to define their own message type format.
	 *
	 * @param messageType - Operation identifier (e.g., "createUser", "getUsers")
	 * @param options - Adapter-specific options (e.g., method/path for HTTP)
	 * @returns Resolved message type for hook matching (e.g., "POST /users" for HTTP)
	 *
	 * @example HTTP adapter:
	 *   resolveMessageType("createUser", { method: "POST", path: "/users" }) => "POST /users"
	 *
	 * @example gRPC adapter:
	 *   resolveMessageType("CreateUser", {}) => "CreateUser"
	 */
	resolveMessageType(messageType: string, options?: TOptions): string;

	/**
	 * Start a server (for mocks) or proxy listener
	 */
	startServer(config: AdapterServerConfig): Promise<AdapterServerHandle>;

	/**
	 * Stop a server/proxy
	 */
	stopServer(server: AdapterServerHandle): Promise<void>;

	/**
	 * Create a client connection
	 */
	createClient(config: AdapterClientConfig): Promise<AdapterClientHandle>;

	/**
	 * Close a client connection
	 */
	closeClient(client: AdapterClientHandle): Promise<void>;

	/**
	 * Register request handler for server/proxy
	 * @param server - Server handle
	 * @param messageType - Message type identifier (operationId)
	 * @param options - Adapter-specific options (e.g., method/path for HTTP)
	 * @param handler - Request handler function
	 */
	onRequest<TReq = unknown, TRes = unknown>(
		server: AdapterServerHandle,
		messageType: string,
		options: TOptions | undefined,
		handler: RequestHandler<TReq, TRes>,
	): void;

	/**
	 * Make request from client
	 * @param client - Client handle
	 * @param messageType - Message type identifier (operationId)
	 * @param options - Adapter-specific request options
	 */
	request<TRes = unknown>(
		client: AdapterClientHandle,
		messageType: string,
		options?: TOptions,
	): Promise<TRes>;
}

/**
 * Async adapter for message-based protocols (WebSocket, TCP, gRPC Stream)
 *
 * Async adapters handle protocols with bidirectional message streams.
 */
export interface AsyncAdapter extends BaseAdapter {
	/**
	 * Start a server (for mocks) or proxy listener
	 */
	startServer(config: AdapterServerConfig): Promise<AdapterServerHandle>;

	/**
	 * Stop a server/proxy
	 */
	stopServer(server: AdapterServerHandle): Promise<void>;

	/**
	 * Create a client connection
	 */
	createClient(config: AdapterClientConfig): Promise<AdapterClientHandle>;

	/**
	 * Close a client connection
	 */
	closeClient(client: AdapterClientHandle): Promise<void>;

	/**
	 * Register message handler for server/proxy
	 */
	onMessage<T = unknown>(
		server: AdapterServerHandle,
		messageType: string,
		handler: MessageHandler<T>,
	): void;

	/**
	 * Send message from client
	 */
	sendMessage<T = unknown>(
		client: AdapterClientHandle,
		messageType: string,
		payload: T,
		metadata?: Partial<MessageMetadata>,
	): Promise<void>;

	/**
	 * Wait for message on client
	 */
	waitForMessage<T = unknown>(
		client: AdapterClientHandle,
		messageType: string | string[],
		matcher?: string | ((payload: T) => boolean),
		timeout?: number,
	): Promise<Message>;
}

/**
 * Any adapter type (sync or async)
 */
export type AnyAdapter = SyncAdapter | AsyncAdapter;

/**
 * Sync adapter class constructor type
 */
export type SyncAdapterClass = new (...args: unknown[]) => SyncAdapter;

/**
 * Async adapter class constructor type
 */
export type AsyncAdapterClass = new (...args: unknown[]) => AsyncAdapter;

/**
 * Any adapter class constructor type
 */
export type AdapterClass = SyncAdapterClass | AsyncAdapterClass;
