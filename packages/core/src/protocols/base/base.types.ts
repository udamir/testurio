/**
 * Protocol Types
 *
 * Type definitions for protocols.
 */


// =============================================================================
// Protocol Characteristics
// =============================================================================

/**
 * Protocol characteristics that define behavior
 */
export interface ProtocolCharacteristics {
	/** Protocol type identifier */
	type: string;
	/** Whether the protocol is asynchronous (streaming/bidirectional) */
	async: boolean;
	/** Whether the protocol supports proxy interception */
	supportsProxy: boolean;
	/** Whether the protocol supports mock servers */
	supportsMock: boolean;
	/** Whether the protocol supports streaming */
	streaming: boolean;
	/** Whether the protocol requires explicit connection management */
	requiresConnection: boolean;
	/** Whether the protocol supports bidirectional communication */
	bidirectional: boolean;
}

// =============================================================================
// Network Configuration
// =============================================================================

/**
 * TLS/SSL configuration
 */
export interface TlsConfig {
	/** Enable TLS */
	enabled: boolean;
	/** Path to CA certificate */
	ca?: string;
	/** Path to client certificate */
	cert?: string;
	/** Path to client private key */
	key?: string;
	/** Skip certificate verification (insecure, for testing only) */
	insecureSkipVerify?: boolean;
	/** Server name for SNI (Server Name Indication) */
	serverName?: string;
}

/**
 * Network address configuration
 */
export interface Address {
	/** Hostname or IP address */
	host: string;
	/** Port number */
	port: number;
	/** Optional path (for HTTP/WebSocket) */
	path?: string;
	/** Optional TLS configuration */
	tls?: TlsConfig;
}

// =============================================================================
// Schema Configuration
// =============================================================================

/**
 * Validation options
 */
export interface ValidationOptions {
	validateRequests?: boolean;
	validateResponses?: boolean;
	strict?: boolean;
	[key: string]: unknown;
}

/**
 * Schema definition
 */
export interface SchemaDefinition {
	type: "openapi" | "protobuf" | "json-schema" | "custom";
	content: string | Record<string, unknown>;
	validate?: boolean;
	validationOptions?: ValidationOptions;
}

// =============================================================================
// Hook Registry Interface (for protocols)
// =============================================================================

/**
 * Hook registry interface for protocol-level hook execution
 * This is a minimal interface that protocols use - the full implementation
 * is in base-component/hook-registry.ts
 */
export interface IHookRegistry {
	/**
	 * Execute all matching hooks for a message
	 * Returns transformed message or null if dropped
	 */
	executeHooks(message: Message): Promise<Message | null>;
}

// =============================================================================
// Message Types
// =============================================================================

/**
 * Generic message type for async protocols
 */
export interface Message<T = unknown> {
	/** Message type/name */
	type: string;
	/** Message payload */
	payload: T;
	/** Optional trace ID for correlation */
	traceId?: string;
}


// =============================================================================
// Protocol Handles
// =============================================================================

/**
 * Server handle for managing server lifecycle
 */
export interface ServerProtocol<T = unknown> {
	isRunning: boolean; // Whether the server is running
	ref?: T; // Internal server instance (protocol-specific)
}

/**
 * Client handle for managing client lifecycle
 */
export interface ClientProtocol<T = unknown> {
	isConnected: boolean; // Whether the client is connected
	ref?: T; // Internal client instance (protocol-specific)
}

/**
 * Request handler callback for sync protocols
 * Called by protocol when a request is received, delegates to component
 * @param messageType - Protocol-specific message type (e.g., "GET /users" for HTTP, "GetUser" for gRPC)
 * @param request - Request payload (protocol-specific format)
 * @returns Response payload or null if no handler matched
 */
export type SyncRequestCallback<TReq = unknown, TRes = unknown> = (messageType: string, request: TReq) => Promise<TRes | null>;

/**
 * Protocol-level server configuration for starting a server/proxy
 */
export type ServerProtocolConfig<T = unknown> = {
	listenAddress: Address; // Address to listen on
	tls?: TlsConfig; // TLS configuration
} & T;

/**
 * Protocol-level client configuration for creating a client connection
 */
export type ClientProtocolConfig<T = unknown> = {
	targetAddress: Address; // Target address to connect to
	tls?: TlsConfig; // TLS configuration
} & T;

/**
 * Message handler for server/proxy
 */
export type MessageHandler<T = unknown> = (
	payload: T,
) => T | Promise<T> | null | Promise<null>;

/**
 * Request handler for sync protocols (HTTP, gRPC unary)
 */
export type RequestHandler<TReq = unknown, TRes = unknown> = (
	request: TReq,
) => TRes | Promise<TRes>;

/**
 * Base protocol type - union of sync and async protocols
 */
export type BaseProtocol = ISyncProtocol | IAsyncProtocol;

/**
 * Base sync request options - common fields for all sync protocols
 * Protocols can extend this with protocol-specific options.
 */
export type SyncRequestOptions<TReq = unknown> = {
	/** Request timeout in milliseconds */
	timeout?: number;
} & TReq;

/**
 * Base sync operation structure
 */
export interface SyncOperation {
	request: unknown;
	response: unknown;
}

/**
 * Sync operations type - maps operation names to request/response pairs
 * Uses a mapped type that works with both index signatures and concrete interfaces
 */
export type SyncOperations<T = object> = {
	[K in keyof T]?: SyncOperation;
};


/**
 * Sync protocol for request/response protocols (HTTP, gRPC Unary)
 *
 * Sync protocols handle protocols where each request gets exactly one response.
 * @template TOptions - Protocol-specific request options type
 */
export interface ISyncProtocol<T extends SyncOperations<T> = SyncOperations, TReq = unknown, TRes = unknown> {
	readonly $types: T;
	readonly $request: TReq;
	readonly $response: TRes;

	readonly type: string;
	readonly characteristics: ProtocolCharacteristics;

	loadSchema?(schemaPath: string | string[]): Promise<SchemaDefinition>;
	setHookRegistry(registry: IHookRegistry): void;

	client: ClientProtocol;
	server: ServerProtocol;

	/**
	 * Dispose of the protocol
	 */
	dispose(): Promise<void>;

	/**
	 * Start a server (for mocks) or proxy listener
	 */
	startServer(config: ServerProtocolConfig): Promise<void>;

	/**
	 * Stop a server/proxy
	 */
	stopServer(): Promise<void>;

	/**
	 * Create a client connection
	 */
	createClient(config: ClientProtocolConfig): Promise<void>;

	/**
	 * Close a client connection
	 */
	closeClient(): Promise<void>;

	/**
	 * Make request from client
	 * @param messageType - Message type identifier (operationId)
	 * @param data - Request payload (protocol-specific format)
	 * @param timeout - Request timeout in milliseconds
	 * @returns Response payload (protocol-specific format)
	 */
	request(messageType: string, data?: TReq, timeout?: number): Promise<TRes>;

	/**
	 * Register request handler for server/proxy
	 */
	setRequestHandler(callback: SyncRequestCallback<TReq, TRes>): void;

	/**
	 * Respond to a request from server
	 * @param traceId - Trace ID of the request
	 * @param payload - Response payload (protocol-specific format)
	 */
	respond(traceId: string, payload: TRes): void;
}

/**
 * Async protocol for message-based protocols (WebSocket, TCP, gRPC Stream)
 *
 * Async protocols handle protocols with bidirectional message streams.
 */
export interface IAsyncProtocol {
	readonly type: string;
	readonly characteristics: ProtocolCharacteristics;
	loadSchema?(schemaPath: string | string[]): Promise<SchemaDefinition>;
	setHookRegistry(registry: IHookRegistry): void;
	dispose(): Promise<void>;

	/**
	 * Start a server (for mocks) or proxy listener
	 */
	startServer(config: ServerProtocolConfig): Promise<void>;

	/**
	 * Stop a server/proxy
	 */
	stopServer(): Promise<void>;

	/**
	 * Create a client connection
	 */
	createClient(config: ClientProtocolConfig): Promise<void>;

	/**
	 * Close a client connection
	 */
	closeClient(): Promise<void>;

	/**
	 * Register message handler for server/proxy
	 */
	onMessage<T = unknown>(
		messageType: string,
		handler: MessageHandler<T>,
	): void;

	/**
	 * Send message from client
	 */
	sendMessage<T = unknown>(
		messageType: string,
		payload: T,
		traceId?: string,
	): Promise<void>;

	/**
	 * Wait for message on client
	 */
	waitForMessage<T = unknown>(
		messageType: string | string[],
		matcher?: string | ((payload: T) => boolean),
		timeout?: number,
	): Promise<Message>;
}

/**
 * Any protocol type (sync or async)
 */
export type AnyProtocol = ISyncProtocol | IAsyncProtocol;

// =============================================================================
// Type Extraction Helpers
// =============================================================================

/**
 * Extract options type from protocol
 * @template A - Protocol type
 */
export type ProtocolOptions<A> = A extends { __types: { options: infer O } }
	? O
	: SyncRequestOptions;

/**
 * Extract messages type from async adapter.
 * Checks for: messages, protocol, or service (for gRPC streaming)
 * @template A - Protocol type
 */
export type ProtocolMessages<A> = A extends { $types: { messages: infer M } }
	? M
	: A extends { $types: { protocol: infer P } }
		? P
		: A extends { $types: { service: infer S } }
			? S
			: Record<string, unknown>;

/**
 * Extract service definition from sync protocol (HTTP, gRPC Unary)
 * Uses $types phantom type from BaseSyncProtocol
 * @template A - Protocol type
 */
export type ProtocolService<A> = A extends { $types: infer T }
	? T
	: Record<string, unknown>;

/**
 * Extract request options type from protocol (HTTP, gRPC Unary)
 * @template A - Protocol type
 */
export type ProtocolRequestOptions<A> = A extends { $request: infer R }
	? R extends Record<string, unknown> ? R : Record<string, unknown>
	: Record<string, unknown>;

// =============================================================================
// Async Message Type Extraction
// =============================================================================

/**
 * Extract message payload type from async message definition.
 * For async protocols (WebSocket, TCP, gRPC Stream):
 * - Simple mapping: `M[K]` is the payload type
 * - With clientMessage/serverMessage: Extract appropriately
 *
 * Used for both incoming message payloads and mockEvent response payloads.
 *
 * @template M - Message definition type
 * @template K - Message type key
 */
export type ExtractMessagePayload<M, K extends keyof M> = M[K] extends {
	clientMessage: infer C;
}
	? C
	: M[K];
