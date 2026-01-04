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
export interface ServerInstance<T = unknown> {
	isRunning: boolean; // Whether the server is running
	ref?: T; // Internal server instance (protocol-specific)
}

/**
 * Client handle for managing client lifecycle
 */
export interface ClientInstance<T = unknown> {
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

	loadSchema?(schemaPath: string | string[]): Promise<SchemaDefinition>;

	client: ClientInstance;
	server: ServerInstance;

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
 * Async protocol messages type - maps message type to payload
 * For bidirectional streams: { clientMessage, serverMessage }
 */
export type AsyncMessages<T = object> = {
	[K in keyof T]?: {
		clientMessage: unknown
		serverMessage: unknown
	};
}

/**
 * Async protocol for message-based protocols (WebSocket, TCP, gRPC Stream)
 *
 * Async protocols handle protocols with bidirectional message streams.
 */
export interface IAsyncProtocol<M extends AsyncMessages = AsyncMessages> {
	readonly $types: M;
	readonly type: string;
	loadSchema?(schemaPath: string | string[]): Promise<SchemaDefinition>;
	dispose(): Promise<void>;

	/**
	 * Start a server (for mocks) or proxy listener
	 */
	startServer(config: ServerProtocolConfig, onConnection: (connection: IServerConnection) => void): Promise<void>;

	/**
	 * Stop a server/proxy
	 */
	stopServer(): Promise<void>;

	/**
	 * Create a client connection
	 */
	connect(config: ClientProtocolConfig): Promise<IClientConnection>;
}

/**
 * Client-side connection interface
 * 
 * Used by:
 * - AsyncClient to communicate with servers
 * - AsyncServer (proxy mode) to communicate with backend (as "outgoing")
 * 
 * Terminology:
 * - sendMessage(): Client sends request/command to server
 * - onEvent(): Client receives push/response from server
 */
export interface IClientConnection {
	/** Unique connection identifier */
	readonly id: string;

	/** Whether connection is active */
	readonly isConnected: boolean;

	/**
	 * Send a message to the server
	 */
	sendMessage<T = unknown>(
		messageType: string,
		payload: T,
		traceId?: string,
	): Promise<void>;

	/**
	 * Register handler for ALL incoming events from server
	 * Single handler receives full Message object for component-level matching
	 * @param handler - Handler called for every event
	 */
	onEvent<T = unknown>(
		handler: (event: Message<T>) => void | Promise<void>,
	): void;

	/** Close the connection */
	close(): Promise<void>;

	/** Register close handler */
	onClose(handler: () => void): void;

	/** Register error handler */
	onError(handler: (error: Error) => void): void;
}

/**
 * Server-side connection interface
 * 
 * Used by:
 * - AsyncServer to handle incoming client connections (as "incoming")
 * 
 * Terminology:
 * - onMessage(): Server receives request/command from client
 * - sendEvent(): Server sends push/response to client
 */
export interface IServerConnection {
	/** Unique connection identifier */
	readonly id: string;

	/** Whether connection is active */
	readonly isConnected: boolean;

	/**
	 * Register handler for ALL incoming messages from client
	 * Single handler receives full Message object for component-level matching
	 * @param handler - Handler called for every message
	 */
	onMessage<T = unknown>(
		handler: (message: Message<T>) => void | Promise<void>,
	): void;

	/**
	 * Send an event to the client
	 */
	sendEvent<T = unknown>(
		eventType: string,
		payload: T,
		traceId?: string,
	): Promise<void>;

	/** Close the connection */
	close(): Promise<void>;

	/** Register close handler */
	onClose(handler: () => void): void;

	/** Register error handler */
	onError(handler: (error: Error) => void): void;
}

/**
 * Any protocol type (sync or async)
 */
export type AnyProtocol = ISyncProtocol | IAsyncProtocol;

// =============================================================================
// Type Extraction Helpers
// =============================================================================

/**
 * Extract messages type from async adapter.
 * Checks for: messages, protocol, or service (for gRPC streaming)
 * @template A - Protocol type
 */
export type ProtocolMessages<A> = A extends { $types: infer M  }
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
// Async Message Format Types
// =============================================================================

/**
 * Base type for async protocol messages.
 * Defines separate client and server message maps.
 */
export interface AsyncMessageDefinition {
	clientMessages: Record<string, unknown>;
	serverMessages: Record<string, unknown>;
}

/**
 * Extract client messages map from async message definition.
 * @template M - Message definition type with clientMessages/serverMessages
 */
export type ClientMessages<M> = M extends { clientMessages: infer C }
	? C
	: Record<string, unknown>;

/**
 * Extract server messages map from async message definition.
 * @template M - Message definition type with clientMessages/serverMessages
 */
export type ServerMessages<M> = M extends { serverMessages: infer S }
	? S
	: Record<string, unknown>;
