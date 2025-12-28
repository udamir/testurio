/**
 * Protocol Adapter Types
 *
 * Type definitions for protocol adapters.
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
// Hook Registry Interface (for adapters)
// =============================================================================

/**
 * Hook registry interface for adapter-level hook execution
 * This is a minimal interface that adapters use - the full implementation
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

/**
 * Generic sync response type for all sync protocols
 * Protocol-specific adapters interpret these fields appropriately.
 */
export interface SyncResponse<TBody = unknown> {
	status?: number;
	headers?: Record<string, string>;
	body?: TBody;
	requestId?: string;
}

// =============================================================================
// Adapter Handles
// =============================================================================

/**
 * Server handle for managing server lifecycle
 */
export interface ServerAdapter<T = unknown> {
	isRunning: boolean; // Whether the server is running
	ref?: T; // Internal server instance (protocol-specific)
}

/**
 * Client handle for managing client lifecycle
 */
export interface ClientAdapter<T = unknown> {
	isConnected: boolean; // Whether the client is connected
	ref?: T; // Internal client instance (protocol-specific)
}

/**
 * Request handler callback for sync adapters
 * Called by adapter when a request is received, delegates to component
 */
export type SyncRequestCallback<TReq = unknown, TRes = unknown> = (message: Message<TReq>) => Promise<Message<TRes> | null>;

/**
 * Adapter-level server configuration for starting a server/proxy
 */
export type ServerAdapterConfig<T = unknown> = {
	listenAddress: Address; // Address to listen on
	tls?: TlsConfig; // TLS configuration
} & T;

/**
 * Adapter-level client configuration for creating a client connection
 */
export type ClientAdapterConfig<T = unknown> = {
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
 * Base adapter type - union of sync and async adapters
 */
export type BaseProtocol = ISyncProtocol | IAsyncProtocol;

/**
 * Base sync request options - common fields for all sync adapters
 * Adapters can extend this with protocol-specific options.
 */
export type SyncRequestOptions<TReq = unknown> = {
	/** Request timeout in milliseconds */
	timeout?: number;
} & TReq;

/**
 * Sync adapter for request/response protocols (HTTP, gRPC Unary)
 *
 * Sync adapters handle protocols where each request gets exactly one response.
 * @template TOptions - Adapter-specific request options type
 */
export interface ISyncProtocol<TOptions extends SyncRequestOptions = SyncRequestOptions> {
	readonly type: string;
	readonly characteristics: ProtocolCharacteristics;

	loadSchema?(schemaPath: string | string[]): Promise<SchemaDefinition>;
	setHookRegistry(registry: IHookRegistry): void;

	client: ClientAdapter;
	server: ServerAdapter;

	/**
	 * Dispose of the adapter
	 */
	dispose(): Promise<void>;

	/**
	 * Start a server (for mocks) or proxy listener
	 */
	startServer(config: ServerAdapterConfig): Promise<void>;

	/**
	 * Stop a server/proxy
	 */
	stopServer(): Promise<void>;

	/**
	 * Create a client connection
	 */
	createClient(config: ClientAdapterConfig): Promise<void>;

	/**
	 * Close a client connection
	 */
	closeClient(): Promise<void>;

	/**
	 * Make request from client
	 * @param messageType - Message type identifier (operationId)
	 * @param options - Adapter-specific request options
	 */
	request<TRes = unknown>(messageType: string, options?: TOptions): Promise<SyncResponse<TRes>>;

	/**
	 * Register request handler for server/proxy
	 */
	setRequestHandler(callback: SyncRequestCallback): void;

	/**
	 * Respond to a request from server
	 * @param traceId - Trace ID of the request
	 * @param params - Response parameters (status, headers, body)
	 */
	respond(traceId: string, params: { code?: number, headers?: Record<string, string>, body?: unknown }): void;

}

/**
 * Async adapter for message-based protocols (WebSocket, TCP, gRPC Stream)
 *
 * Async adapters handle protocols with bidirectional message streams.
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
	startServer(config: ServerAdapterConfig): Promise<void>;

	/**
	 * Stop a server/proxy
	 */
	stopServer(): Promise<void>;

	/**
	 * Create a client connection
	 */
	createClient(config: ClientAdapterConfig): Promise<void>;

	/**
	 * Close a client connection
	 */
	closeClient(): Promise<void>;

	/**
	 * Register message handler for server/proxy
	 */
	onMessage<T = unknown>(
		server: ServerAdapter,
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
 * Any adapter type (sync or async)
 */
export type AnyAdapter = ISyncProtocol | IAsyncProtocol;

/**
 * Sync adapter class constructor type
 */
export type SyncAdapterClass = new (...args: unknown[]) => ISyncProtocol;

/**
 * Async adapter class constructor type
 */
export type AsyncAdapterClass = new (...args: unknown[]) => IAsyncProtocol;

/**
 * Any adapter class constructor type
 */
export type AdapterClass = SyncAdapterClass | AsyncAdapterClass;

// =============================================================================
// Base Type Marker Interface
// =============================================================================

/**
 * Base interface for adapter type markers.
 * Adapters implement this to declare their request/response/options types.
 */
export interface AdapterTypeMarker {
	/** Request type for this adapter */
	readonly request: unknown;
	/** Response type for this adapter */
	readonly response: unknown;
	/** Request options type for this adapter */
	readonly options: unknown;
}

// =============================================================================
// Type Extraction Helpers
// =============================================================================

/**
 * Extract options type from adapter
 * @template A - Adapter type
 */
export type AdapterOptions<A> = A extends { __types: { options: infer O } }
	? O
	: SyncRequestOptions;

/**
 * Extract messages type from async adapter.
 * Checks for: messages, protocol, or service (for gRPC streaming)
 * @template A - Adapter type
 */
export type AdapterMessages<A> = A extends { __types: { messages: infer M } }
	? M
	: A extends { __types: { protocol: infer P } }
		? P
		: A extends { __types: { service: infer S } }
			? S
			: Record<string, unknown>;

/**
 * Extract service definition from sync adapter (HTTP, gRPC Unary)
 * @template A - Adapter type
 */
export type AdapterService<A> = A extends { __types: { service: infer S } }
	? S
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
 * @template M - Message definition type
 * @template K - Message type key
 */
export type ExtractMessagePayload<M, K extends keyof M> = M[K] extends {
	clientMessage: infer C;
}
	? C
	: M[K];

/**
 * Extract the response payload type for mockEvent in async protocols.
 * This is used when a server receives a message and sends a response.
 * - With clientMessage: The response type is `M[K]["clientMessage"]` (the message being sent)
 * - Simple mapping: Returns `M[K]` directly
 *
 * @template M - Message definition type
 * @template K - Response message type key
 */
export type ExtractMockEventResponse<M, K extends keyof M> = M[K] extends {
	clientMessage: infer C;
}
	? C
	: M[K];
