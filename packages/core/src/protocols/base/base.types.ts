/**
 * Protocol Types
 *
 * Type definitions for protocols.
 */

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
// Timeout Configuration
// =============================================================================

/**
 * Timeout configuration for protocols
 * All timeouts are in milliseconds.
 */
export interface TimeoutConfig {
	/** Connection establishment timeout (default: 5000ms) */
	connectionTimeout?: number;
	/** Request/response timeout (default: 30000ms) */
	requestTimeout?: number;
	/** Idle connection timeout (default: 60000ms) */
	idleTimeout?: number;
}

/**
 * Default timeout values in milliseconds
 */
export const DEFAULT_TIMEOUTS: Required<TimeoutConfig> = {
	connectionTimeout: 5000,
	requestTimeout: 30000,
	idleTimeout: 60000,
};

// =============================================================================
// Protocol Handles
// =============================================================================

/**
 * Protocol-level server configuration for starting a server/proxy
 */
export type ServerProtocolConfig = {
	listenAddress: Address; // Address to listen on
	tls?: TlsConfig; // TLS configuration
	timeouts?: TimeoutConfig; // Timeout configuration
};

/**
 * Protocol-level client configuration for creating a client connection
 */
export type ClientProtocolConfig = {
	targetAddress: Address; // Target address to connect to
	tls?: TlsConfig; // TLS configuration
	timeouts?: TimeoutConfig; // Timeout configuration
};

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
export interface SyncOperation<TReq = unknown, TRes = unknown> {
	request: TReq;
	response: TRes;
}

/**
 * Base operations type - maps operation names to operation definitions
 * Uses a mapped type that works with both index signatures and concrete interfaces
 */
export type Operations<T = object> = {
	[K in keyof T]?: T[K];
};

/**
 * Sync operations type - maps operation names to request/response pairs
 * Uses a mapped type that works with both index signatures and concrete interfaces
 */
export type SyncOperations<T = object> = Operations<T>;

/**
 * Async messages type - maps message names to message definitions
 * Uses a mapped type that works with both index signatures and concrete interfaces
 */
export type AsyncMessages<T = object> = {
	clientMessages: {
		[K in keyof T]?: Record<string, unknown>;
	};
	serverMessages: {
		[K in keyof T]?: Record<string, unknown>;
	};
};

// =============================================================================
// Base Protocol Interface
// =============================================================================

/**
 * Base protocol interface - common for sync and async protocols
 *
 * @template M - Message/operation definition type
 * @template TServerAdapter - Server adapter type returned by createServer
 * @template TClientAdapter - Client adapter type returned by createClient
 */
export interface IBaseProtocol<M = unknown, TServerAdapter = unknown, TClientAdapter = unknown> {
	/** Protocol type identifier (e.g., "http", "tcp", "websocket") */
	readonly type: string;

	/** Phantom type for message type inference */
	readonly $types: M;

	/** Load schema (optional) */
	loadSchema?(schemaPath: string | string[]): Promise<unknown>;

	/** Create and start a server (component owns the returned adapter) */
	createServer(config: ServerProtocolConfig): Promise<TServerAdapter>;

	/** Create a client connection (component owns the returned adapter) */
	createClient(config: ClientProtocolConfig): Promise<TClientAdapter>;
}

// =============================================================================
// Request Matching
// =============================================================================

/**
 * Message type matcher function
 * @param messageType - Operation identifier (method name, message type, etc.)
 * @param payload - Protocol-specific request data
 * @returns true if matched, false otherwise
 *
 * Uses method signature pattern to achieve bivariance, allowing
 * MessageMatcher<HttpRequest> to be assignable to MessageMatcher<unknown>.
 */
export type MessageMatcher<T = unknown> = {
	messageMatcher(messageType: string, payload: T): boolean;
}["messageMatcher"];

// =============================================================================
// Sync Protocol (HTTP, gRPC Unary)
// =============================================================================

/**
 * Sync protocol interface for request/response protocols
 *
 * @template M - Operations definition type
 * @template TReq - Request type (for phantom type)
 * @template TRes - Response type (for phantom type)
 */
export interface ISyncProtocol<M extends SyncOperations = SyncOperations, TReq = unknown, TRes = unknown>
	extends IBaseProtocol<M, ISyncServerAdapter, ISyncClientAdapter> {
	/** Phantom type for request type inference */
	readonly $request: TReq;

	/** Phantom type for response type inference */
	readonly $response: TRes;

	/**
	 * Create request matcher from options.
	 * If returns function, it will be used for matching.
	 * If returns string or not implemented, exact string matching is used.
	 *
	 * @param messageType - Operation identifier
	 * @param payload - Protocol-specific request data
	 * @returns Matcher function or string for exact match
	 */
	createMessageTypeMatcher?(messageType: string, payload: TReq): MessageMatcher<TReq> | string;
}

/**
 * Server adapter for sync protocols
 * Wraps the server instance, component owns it
 */
export interface ISyncServerAdapter {
	/** Register request handler */
	onRequest<TReq = unknown, TRes = unknown>(
		handler: (messageType: string, request: TReq) => Promise<TRes | null>
	): void;

	/** Stop server */
	stop(): Promise<void>;
}

/**
 * Client adapter for sync protocols
 * Wraps the client connection, component owns it
 */
export interface ISyncClientAdapter {
	/** Send request and wait for response */
	request<TReq = unknown, TRes = unknown>(messageType: string, data: TReq, timeout?: number): Promise<TRes>;

	/** Close client connection */
	close(): Promise<void>;
}

// =============================================================================
// Async Protocol (WebSocket, TCP, gRPC Stream)
// =============================================================================

/**
 * Async protocol interface for bidirectional message protocols
 */
export interface IAsyncProtocol<M extends AsyncMessages = AsyncMessages>
	extends IBaseProtocol<M, IAsyncServerAdapter, IAsyncClientAdapter> {}

/**
 * Server adapter for async protocols
 * Wraps the server instance, component owns it
 */
export interface IAsyncServerAdapter {
	/** Register connection handler - called for each new client connection */
	onConnection(handler: (connection: IAsyncClientAdapter) => void): void;

	/** Stop server and close all connections */
	stop(): Promise<void>;
}

/**
 * Client adapter for async protocols
 * Used for both:
 * - Client connections (AsyncClient -> server)
 * - Server-side connections (AsyncServer <- client)
 */
export interface IAsyncClientAdapter {
	/** Unique connection identifier */
	readonly id: string;

	/** Send message to the other end */
	send(message: Message): Promise<void>;

	/** Close connection */
	close(): Promise<void>;

	/** Check if connected */
	readonly isConnected: boolean;

	/** Register message handler */
	onMessage(handler: (message: Message) => void): void;

	/** Register close handler */
	onClose(handler: () => void): void;

	/** Register error handler */
	onError(handler: (error: Error) => void): void;
}

// =============================================================================
// Type Extraction Helpers
// =============================================================================

/**
 * Extract messages type from async adapter.
 * Checks for: messages, protocol, or service (for gRPC streaming)
 * @template A - Protocol type
 */
export type ProtocolMessages<A> = A extends { $types: infer M }
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
export type ProtocolService<A> = A extends { $types: infer T } ? T : Record<string, unknown>;

/**
 * Extract request options type from protocol (HTTP, gRPC Unary)
 * @template A - Protocol type
 */
export type ProtocolRequestOptions<A> = A extends { $request: infer R }
	? R extends Record<string, unknown>
		? R
		: Record<string, unknown>
	: Record<string, unknown>;

// =============================================================================
// Loose Mode Detection (Flexible Protocol Types)
// =============================================================================

/**
 * Generic loose mode detection for sync protocols.
 * Checks if the service definition has an index signature (any string key).
 *
 * @template S - Service definition type
 * @returns true if loose mode (index signature), false if strict mode (specific keys)
 *
 * Detection logic:
 * - If `string extends keyof S`, the type has an index signature `[key: string]: T`
 * - Index signature = loose mode (any string key is valid as operation ID)
 * - Specific keys only = strict mode (only defined keys are valid)
 *
 * @example
 * ```typescript
 * // Loose mode - index signature
 * type Loose = IsSyncLooseMode<{ [key: string]: { request: any; response: any } }>; // true
 *
 * // Strict mode - specific keys
 * type Strict = IsSyncLooseMode<{ getUsers: { request: any; response: any } }>; // false
 * ```
 */
export type IsSyncLooseMode<S> = string extends keyof S ? true : false;

/**
 * Generic loose mode detection for async protocols.
 * Checks if the clientMessages has an index signature (any string key).
 *
 * @template M - Messages definition type with clientMessages/serverMessages
 * @returns true if loose mode (index signature), false if strict mode (specific keys)
 *
 * @example
 * ```typescript
 * // Loose mode
 * type Loose = IsAsyncLooseMode<{
 *   clientMessages: { [key: string]: unknown };
 *   serverMessages: { [key: string]: unknown };
 * }>; // true
 *
 * // Strict mode
 * type Strict = IsAsyncLooseMode<{
 *   clientMessages: { ping: { seq: number } };
 *   serverMessages: { pong: { seq: number } };
 * }>; // false
 * ```
 */
export type IsAsyncLooseMode<M> = M extends { clientMessages: infer C }
	? string extends keyof C
		? true
		: false
	: false;

/**
 * Extract operation ID type from sync protocol with loose mode support.
 * Returns `string` for loose mode protocols, `keyof Service & string` for strict mode.
 *
 * @template A - Protocol type
 * @returns string (loose mode) or union of operation keys (strict mode)
 *
 * @example
 * ```typescript
 * // Loose mode protocol (no type parameter)
 * type LooseId = SyncOperationId<HttpProtocol>; // string
 *
 * // Strict mode protocol (with type parameter)
 * type StrictId = SyncOperationId<HttpProtocol<MyApi>>; // "getUsers" | "createUser"
 * ```
 */
export type SyncOperationId<A> =
	IsSyncLooseMode<ProtocolService<A>> extends true ? string : keyof ProtocolService<A> & string;

/**
 * Extract client message type from async protocol with loose mode support.
 * Returns `string` for loose mode protocols, `keyof clientMessages & string` for strict mode.
 *
 * @template A - Protocol type
 * @returns string (loose mode) or union of message type keys (strict mode)
 */
export type AsyncClientMessageType<A> =
	IsAsyncLooseMode<ProtocolMessages<A>> extends true ? string : keyof ClientMessages<ProtocolMessages<A>> & string;

/**
 * Extract server message type from async protocol with loose mode support.
 * Returns `string` for loose mode protocols, `keyof serverMessages & string` for strict mode.
 *
 * @template A - Protocol type
 * @returns string (loose mode) or union of message type keys (strict mode)
 */
export type AsyncServerMessageType<A> =
	IsAsyncLooseMode<ProtocolMessages<A>> extends true ? string : keyof ServerMessages<ProtocolMessages<A>> & string;

/**
 * Extract client message payload type with loose mode fallback.
 * Returns `unknown` for loose mode protocols, typed payload for strict mode.
 *
 * @template A - Protocol type
 * @template K - Message type key
 */
export type ExtractClientPayload<A, K> =
	IsAsyncLooseMode<ProtocolMessages<A>> extends true
		? unknown
		: K extends keyof ClientMessages<ProtocolMessages<A>>
			? ClientMessages<ProtocolMessages<A>>[K]
			: unknown;

/**
 * Extract server message payload type with loose mode fallback.
 * Returns `unknown` for loose mode protocols, typed payload for strict mode.
 *
 * @template A - Protocol type
 * @template K - Message type key
 */
export type ExtractServerPayload<A, K> =
	IsAsyncLooseMode<ProtocolMessages<A>> extends true
		? unknown
		: K extends keyof ServerMessages<ProtocolMessages<A>>
			? ServerMessages<ProtocolMessages<A>>[K]
			: unknown;

// =============================================================================
// Async Message Format Types
// =============================================================================

/**
 * Extract client messages map from async message definition.
 * @template M - Message definition type with clientMessages/serverMessages
 */
export type ClientMessages<M> = M extends { clientMessages: infer C } ? C : Record<string, unknown>;

/**
 * Extract server messages map from async message definition.
 * @template M - Message definition type with clientMessages/serverMessages
 */
export type ServerMessages<M> = M extends { serverMessages: infer S } ? S : Record<string, unknown>;
