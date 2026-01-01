/**
 * gRPC Protocol Types
 *
 * Type definitions for gRPC protocols (unary and streaming).
 * 
 * @example Service Definition
 * ```typescript
 * interface MyGrpcService {
 *   GetUser: {
 *     request: { payload: { user_id: number }; metadata?: GrpcMetadata };
 *     response: { payload: { name: string; email: string }; metadata?: GrpcMetadata };
 *   };
 *   CreateOrder: {
 *     request: { payload: CreateOrderPayload; metadata?: GrpcMetadata };
 *     response: { payload: CreateOrderResponse; metadata?: GrpcMetadata };
 *   };
 * }
 * ```
 * 
 * @example Usage
 * ```typescript
 * const client = new Client('api', {
 *   protocol: new GrpcUnaryProtocol<MyGrpcService>({ schema: 'service.proto' }),
 *   targetAddress: { host: 'localhost', port: 50051 },
 * });
 * 
 * // In test case - metadata in payload
 * api.request('GetUser', { payload: { user_id: 42 }, metadata: { authorization: 'Bearer token' } });
 * ```
 */

import type { SyncRequestOptions, Message } from "testurio";

// =============================================================================
// Protocol Options
// =============================================================================

/**
 * gRPC Unary protocol options
 */
export interface GrpcUnaryProtocolOptions {
	/** Path to .proto file(s) */
	schema?: string | string[];
	/** Service name to use for client calls */
	serviceName?: string;
	/** Request timeout in milliseconds */
	timeout?: number;
}

/**
 * gRPC Stream protocol options
 */
export interface GrpcStreamProtocolOptions {
	/** Path to .proto file(s) */
	schema?: string | string[];
	/** Service name to use for client calls */
	serviceName?: string;
	/** Method name for streaming */
	methodName?: string;
	/** Request timeout in milliseconds */
	timeout?: number;
}

/**
 * gRPC Unary request options (used by client.request())
 */
export interface GrpcUnaryRequestOptions {
	/** Request payload */
	payload?: unknown;
	/** gRPC metadata */
	metadata?: Record<string, string>;
	/** Request timeout in milliseconds */
	timeout?: number;
}

// =============================================================================
// Operation Types (for type-safe unary calls)
// =============================================================================

/**
 * gRPC operation request wrapper
 */
export interface GrpcOperationRequest {
	payload: unknown;
	metadata?: GrpcMetadata;
}

/**
 * gRPC operation response wrapper
 */
export interface GrpcOperationResponse {
	payload: unknown;
	metadata?: GrpcMetadata;
}

/**
 * gRPC operation definition
 */
export interface GrpcOperation {
	request: GrpcOperationRequest;
	response: GrpcOperationResponse;
}

/**
 * Map of gRPC operations (method name -> operation)
 */
export type GrpcOperations<T = Record<string, unknown>> = {
	[K in keyof T]?: GrpcOperation;
};

// =============================================================================
// Internal Types
// =============================================================================

/**
 * Pending message resolver for streaming
 */
export interface PendingMessage {
	resolve: (message: Message) => void;
	reject: (error: Error) => void;
	messageType: string | string[];
	matcher?: string | ((payload: unknown) => boolean);
	timeout: NodeJS.Timeout;
}

/**
 * gRPC-specific message metadata
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

// =============================================================================
// gRPC Service Definitions
// =============================================================================

/**
 * gRPC Metadata type for request/response headers
 */
export type GrpcMetadata<T = object> = {
	[K in keyof T]?: string | string[];
};

/**
 * gRPC Method definition for type-safe gRPC unary adapters.
 * Maps method names to request/response structures with payload and metadata.
 * 
 * @example
 * ```typescript
 * interface MyService {
 *   GetUser: {
 *     request: { payload: { user_id: number }; metadata?: GrpcMetadata };
 *     response: { payload: { name: string }; metadata?: GrpcMetadata };
 *   };
 * }
 * ```
 */
export interface GrpcMethod<TReq = unknown, TRes = unknown> {
	/** Request with payload and optional metadata */
	request: { payload: TReq; metadata?: GrpcMetadata };
	/** Response with payload and optional metadata */
	response: { payload: TRes; metadata?: GrpcMetadata };
}

/**
 * gRPC Service definition - maps method names to gRPC methods
 * Use interface extension for concrete service definitions
 */
export interface GrpcServiceDefinition {
	[methodName: string]: GrpcMethod;
}

/**
 * gRPC Stream Method definition for bidirectional streaming.
 */
export interface GrpcStreamMethod {
	/** Client-to-server message type */
	clientMessage: unknown;
	/** Server-to-client message type */
	serverMessage: unknown;
	/** Optional metadata type */
	metadata?: Record<string, unknown>;
}

/**
 * gRPC Stream Service definition - maps method names to stream methods
 */
export type GrpcStreamServiceDefinition = Record<string, GrpcStreamMethod>;

// =============================================================================
// gRPC Request/Response Types
// =============================================================================

/**
 * gRPC request type
 */
export interface GrpcRequest<TPayload = unknown> {
	/** gRPC method name */
	method?: string;
	/** Request payload */
	payload?: TPayload;
	/** Request metadata */
	metadata?: Record<string, string>;
}

/**
 * gRPC response type
 */
export interface GrpcResponse<TPayload = unknown> {
	/** gRPC status code */
	status: number;
	/** Response payload */
	payload?: TPayload;
	/** Response metadata */
	metadata?: Record<string, string>;
}

/**
 * gRPC request options
 */
export interface GrpcRequestOptions extends SyncRequestOptions {
	/** gRPC method name */
	method?: string;
	/** Request metadata */
	metadata?: Record<string, string>;
}

// =============================================================================
// gRPC Protocol Type Markers
// =============================================================================

/**
 * gRPC Unary Protocol type marker
 * 
 * Declares the types used by GrpcUnaryProtocol for type inference.
 * Components use `__types` to extract request/response/service types.
 * 
 * @template S - gRPC service definition (method name -> { request, response, metadata? })
 */
// biome-ignore lint/suspicious/noExplicitAny: Required for interface compatibility without index signatures
export interface GrpcUnaryProtocolTypes<S = any> {
	readonly request: GrpcRequest;
	readonly response: GrpcResponse;
	readonly options: GrpcRequestOptions;
	/** Service definition for type-safe methods */
	readonly service: S;
}

/**
 * gRPC Stream Protocol type marker
 * 
 * Declares the types used by GrpcStreamProtocol for type inference.
 * 
 * @template S - gRPC stream service definition (method name -> { clientMessage, serverMessage, metadata? })
 */
export interface GrpcStreamProtocolTypes<
	S extends GrpcStreamServiceDefinition = GrpcStreamServiceDefinition,
> {
	readonly request: never;
	readonly response: never;
	readonly options: never;
	/** Service definition for type-safe streaming */
	readonly service: S;
}

