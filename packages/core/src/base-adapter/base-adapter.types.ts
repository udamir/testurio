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
 * Message metadata
 */
export interface MessageMetadata {
	timestamp?: number;
	direction?: "inbound" | "outbound";
	componentName?: string;
	[key: string]: unknown;
}

/**
 * Generic message type for async protocols
 */
export interface Message {
	/** Message type/name */
	type: string;
	/** Message payload */
	payload: unknown;
	/** Optional trace ID for correlation */
	traceId?: string;
	/** Message metadata */
	metadata?: MessageMetadata;
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
// Payload Matchers
// =============================================================================

/**
 * Match by request ID (for correlating request/response)
 */
export interface RequestIdPayloadMatcher {
	type: "requestId";
	value: string;
}

/**
 * Match by trace ID in payload
 */
export interface TraceIdPayloadMatcher {
	type: "traceId";
	value: string;
}

/**
 * Match by custom function
 */
export interface FunctionPayloadMatcher {
	type: "function";
	fn: (payload: unknown) => boolean;
}

/**
 * Payload matcher - matches by traceId, requestId, or custom function
 */
export type PayloadMatcher =
	| TraceIdPayloadMatcher
	| RequestIdPayloadMatcher
	| FunctionPayloadMatcher;

// =============================================================================
// Adapter Handles
// =============================================================================

/**
 * Server handle for managing server lifecycle
 */
export interface AdapterServer {
	id: string; // Unique server ID
	type: string; // Protocol type
	address: Address; // Listen address
	isRunning: boolean; // Whether the server is running
	_internal?: unknown; // Internal server instance (protocol-specific)
}

/**
 * Client handle for managing client lifecycle
 */
export interface AdapterClient {
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
	options?: Record<string, unknown>; // Protocol-specific options
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
	options?: Record<string, unknown>; // Protocol-specific options
	tls?: TlsConfig; // TLS configuration
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
 * Base adapter type - union of sync and async adapters
 */
export type BaseAdapter = SyncAdapter | AsyncAdapter;

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
export interface SyncAdapter<
	TOptions extends BaseSyncRequestOptions = BaseSyncRequestOptions,
> {
	readonly type: string;
	readonly characteristics: ProtocolCharacteristics;
	loadSchema?(schemaPath: string | string[]): Promise<SchemaDefinition>;
	setHookRegistry(registry: IHookRegistry): void;
	dispose(): Promise<void>;

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
	startServer(config: AdapterServerConfig): Promise<AdapterServer>;

	/**
	 * Stop a server/proxy
	 */
	stopServer(server: AdapterServer): Promise<void>;

	/**
	 * Create a client connection
	 */
	createClient(config: AdapterClientConfig): Promise<AdapterClient>;

	/**
	 * Close a client connection
	 */
	closeClient(client: AdapterClient): Promise<void>;

	/**
	 * Make request from client
	 * @param client - Client handle
	 * @param messageType - Message type identifier (operationId)
	 * @param options - Adapter-specific request options
	 */
	request<TRes = unknown>(
		client: AdapterClient,
		messageType: string,
		options?: TOptions,
	): Promise<TRes>;
}

/**
 * Async adapter for message-based protocols (WebSocket, TCP, gRPC Stream)
 *
 * Async adapters handle protocols with bidirectional message streams.
 */
export interface AsyncAdapter {
	readonly type: string;
	readonly characteristics: ProtocolCharacteristics;
	loadSchema?(schemaPath: string | string[]): Promise<SchemaDefinition>;
	setHookRegistry(registry: IHookRegistry): void;
	dispose(): Promise<void>;

	/**
	 * Start a server (for mocks) or proxy listener
	 */
	startServer(config: AdapterServerConfig): Promise<AdapterServer>;

	/**
	 * Stop a server/proxy
	 */
	stopServer(server: AdapterServer): Promise<void>;

	/**
	 * Create a client connection
	 */
	createClient(config: AdapterClientConfig): Promise<AdapterClient>;

	/**
	 * Close a client connection
	 */
	closeClient(client: AdapterClient): Promise<void>;

	/**
	 * Register message handler for server/proxy
	 */
	onMessage<T = unknown>(
		server: AdapterServer,
		messageType: string,
		handler: MessageHandler<T>,
	): void;

	/**
	 * Send message from client
	 */
	sendMessage<T = unknown>(
		client: AdapterClient,
		messageType: string,
		payload: T,
		metadata?: Partial<MessageMetadata>,
	): Promise<void>;

	/**
	 * Wait for message on client
	 */
	waitForMessage<T = unknown>(
		client: AdapterClient,
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
	: BaseSyncRequestOptions;

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
