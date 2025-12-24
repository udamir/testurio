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
	id: string;          		// Unique server ID
	type: string;        		// Protocol type
	address: Address;    		// Listen address
	isRunning: boolean;  		// Whether the server is running
	_internal?: unknown; 		// Internal server instance (protocol-specific)
}

/**
 * Client handle for managing client lifecycle
 */
export interface AdapterClientHandle {
	id: string;          		// Unique client ID
	type: string;        		// Protocol type
	address: Address;    		// Target address
	isConnected: boolean;   // Whether the client is connected
	_internal?: unknown; 		// Internal client instance (protocol-specific)
}

/**
 * Server configuration for starting a server/proxy
 */
export interface ServerConfig {
	listenAddress: Address;   // Address to listen on
	targetAddress?: Address;  // Target address for proxy mode (absent for mock)
	schema?: SchemaDefinition; // Schema definition
	options?: ProtocolOptions; // Protocol-specific options
	tls?: TlsConfig;          // TLS configuration
}

/**
 * Adapter-level client configuration for creating a client connection
 */
export interface AdapterClientConfig {
	targetAddress: Address;    // Target address to connect to
	schema?: SchemaDefinition; // Schema definition
	options?: ProtocolOptions; // Protocol-specific options
	tls?: TlsConfig;          // TLS configuration
	auth?: AuthConfig;        // Authentication configuration
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
 * Protocol adapter interface
 *
 * Adapters implement protocol-specific logic for:
 * - Starting servers (mocks/proxies)
 * - Creating client connections
 * - Sending and receiving messages
 */
export interface ProtocolAdapter {
	readonly type: string;                      // Protocol type identifier
	readonly characteristics: ProtocolCharacteristics; // Protocol characteristics

	/**
	 * Load and parse schema files
	 */
	loadSchema?(schemaPath: string | string[]): Promise<SchemaDefinition>;

	/**
	 * Start a server (for mocks) or proxy listener
	 */
	startServer(config: ServerConfig): Promise<AdapterServerHandle>;

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
	 * Register message handler for server/proxy (async protocols)
	 */
	onMessage?<T = unknown>(
		server: AdapterServerHandle,
		messageType: string,
		handler: MessageHandler<T>,
	): void;

	/**
	 * Register request handler for server/proxy (sync protocols)
	 */
	onRequest?<TReq = unknown, TRes = unknown>(
		server: AdapterServerHandle,
		method: string,
		path: string,
		handler: RequestHandler<TReq, TRes>,
	): void;

	/**
	 * Send message from client (async protocols)
	 */
	sendMessage?<T = unknown>(
		client: AdapterClientHandle,
		messageType: string,
		payload: T,
		metadata?: Partial<MessageMetadata>,
	): Promise<void>;

	/**
	 * Make request from client (sync protocols)
	 */
	request?<TReq = unknown, TRes = unknown>(
		client: AdapterClientHandle,
		method: string,
		path: string,
		payload?: TReq,
		headers?: Record<string, string>,
	): Promise<TRes>;

	/**
	 * Wait for message on client (async protocols)
	 */
	waitForMessage?<T = unknown>(
		client: AdapterClientHandle,
		messageType: string | string[],
		matcher?: string | ((payload: T) => boolean),
		timeout?: number,
	): Promise<Message>;

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
 * Adapter class constructor type
 */
export type AdapterClass = new () => ProtocolAdapter;
