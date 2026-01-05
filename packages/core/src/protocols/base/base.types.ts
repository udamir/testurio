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
// Protocol Handles
// =============================================================================

/**
 * Protocol-level server configuration for starting a server/proxy
 */
export type ServerProtocolConfig = {
	listenAddress: Address; // Address to listen on
	tls?: TlsConfig; // TLS configuration
};

/**
 * Protocol-level client configuration for creating a client connection
 */
export type ClientProtocolConfig = {
	targetAddress: Address; // Target address to connect to
	tls?: TlsConfig; // TLS configuration
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
	}
	serverMessages: {
		[K in keyof T]?: Record<string, unknown>;
	}
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
export interface IBaseProtocol<
	M = unknown,
	TServerAdapter = unknown,
	TClientAdapter = unknown,
> {
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
}

/**
 * Server adapter for sync protocols
 * Wraps the server instance, component owns it
 */
export interface ISyncServerAdapter {
	/** Register request handler */
	onRequest<TReq = unknown, TRes = unknown>(
		handler: (messageType: string, request: TReq) => Promise<TRes | null>,
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
	request<TReq = unknown, TRes = unknown>(
		messageType: string,
		data: TReq,
		timeout?: number,
	): Promise<TRes>;

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
