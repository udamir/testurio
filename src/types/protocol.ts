/**
 * Protocol Types
 *
 * Core protocol definitions and characteristics for the test framework.
 */

/**
 * Supported protocol types
 */
export type ProtocolType =
	| "http"
	| "grpc-unary"
	| "grpc-stream"
	| "tcp-proto"
	| "websocket"
	| string;

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

	/** @deprecated Use insecureSkipVerify instead. Reject unauthorized certificates (inverse of insecureSkipVerify) */
	rejectUnauthorized?: boolean;
}

/**
 * Authentication configuration
 */
export interface AuthConfig {
	/** Authentication type */
	type: "oauth2-client-credentials" | "bearer" | "basic" | "api-key" | "custom";

	/** Username (for basic auth) */
	username?: string;

	/** Password (for basic auth) */
	password?: string;

	/** Token (for bearer auth) */
	token?: string;

	/** API key (for api-key auth) */
	apiKey?: string;

	/** API key header name */
	apiKeyHeader?: string;

	/** OAuth2 client ID (for oauth2-client-credentials) */
	clientId?: string;

	/** OAuth2 client secret (for oauth2-client-credentials) */
	clientSecret?: string;

	/** OAuth2 token URL (for oauth2-client-credentials) */
	tokenUrl?: string;

	/** OAuth2 scopes (for oauth2-client-credentials) */
	scopes?: string[];

	/** Custom headers */
	headers?: Record<string, string>;
}

/**
 * HTTP-specific options
 */
export interface HttpOptions {
	/** Base URL */
	baseUrl?: string;

	/** @deprecated Use baseUrl instead */
	baseURL?: string;

	/** Request timeout in milliseconds */
	timeout?: number;

	/** Default headers */
	headers?: Record<string, string>;

	/** Follow redirects */
	followRedirects?: boolean;

	/** Maximum redirects */
	maxRedirects?: number;

	/** Enable schema validation (requires OpenAPI schema) */
	validateSchema?: boolean;

	/** Retry policy for failed requests */
	retryPolicy?: {
		/** Maximum number of retry attempts */
		maxRetries: number;

		/** Backoff strategy */
		backoff: "linear" | "exponential";

		/** HTTP status codes that should trigger a retry */
		retryableStatusCodes?: number[];
	};
}

/**
 * gRPC-specific options
 */
export interface GrpcOptions {
	/** Service name */
	serviceName?: string;

	/** Method name (for streaming clients) */
	methodName?: string;

	/** Request timeout in milliseconds */
	timeout?: number;

	/** Channel options */
	channelOptions?: Record<string, unknown>;

	/** Enable reflection */
	reflection?: boolean;

	/** gRPC metadata (headers) for authentication and other purposes */
	metadata?: Record<string, string>;
}

/**
 * gRPC-specific message metadata (extends base MessageMetadata)
 */
export interface GrpcMessageMetadata {
	/** Timestamp when message was created/received */
	timestamp?: number;
	/** Message direction */
	direction?: "inbound" | "outbound";
	/** Component name */
	componentName?: string;
	/** gRPC method name */
	method?: string;
	/** gRPC service path */
	path?: string;
	/** gRPC metadata (headers) for auth etc. */
	grpcMetadata?: Record<string, string>;
	/** gRPC status code */
	grpcStatus?: number;
	/** gRPC status message */
	grpcStatusMessage?: string;
	/** Index signature for compatibility with MessageMetadata */
	[key: string]: unknown;
}

/**
 * gRPC error response structure
 */
export interface GrpcErrorResponse {
	/** gRPC status code (0 = OK, 7 = PERMISSION_DENIED, etc.) */
	grpcStatus: number;
	/** Error message */
	grpcMessage?: string;
	/** Response body (if any) */
	body?: unknown;
}

/**
 * TCP Proto-specific options
 */
export interface TcpProtoOptions {
	/** Message delimiter */
	delimiter?: Buffer;

	/** Enable heartbeat */
	heartbeat?: boolean;

	/** Heartbeat interval in milliseconds */
	heartbeatInterval?: number;

	/** Connection timeout in milliseconds */
	connectionTimeout?: number;

	/** Reconnect on disconnect */
	reconnect?: boolean;

	/** Reconnect interval in milliseconds */
	reconnectInterval?: number;
}

/**
 * WebSocket-specific options
 */
export interface WebSocketOptions {
	/** Subprotocols */
	protocols?: string[];

	/** Ping interval in milliseconds */
	pingInterval?: number;

	/** Pong timeout in milliseconds */
	pongTimeout?: number;

	/** Enable compression */
	compression?: boolean;

	/** Maximum message size */
	maxPayload?: number;
}

/**
 * Protocol-specific options union
 */
export type ProtocolOptions =
	| HttpOptions
	| GrpcOptions
	| TcpProtoOptions
	| WebSocketOptions;
