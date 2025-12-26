/**
 * gRPC Adapter Types
 *
 * Type definitions for gRPC adapters (unary and streaming).
 */

import type { AdapterTypeMarker, BaseSyncRequestOptions } from "testurio";

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
 * gRPC Method definition for type-safe gRPC unary adapters.
 * Maps method names to request/response structures.
 */
export interface GrpcMethod {
	/** Request payload type */
	request: unknown;
	/** Response payload type */
	response: unknown;
	/** Optional metadata type */
	metadata?: Record<string, unknown>;
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
export interface GrpcRequestOptions extends BaseSyncRequestOptions {
	/** gRPC method name */
	method?: string;
	/** Request metadata */
	metadata?: Record<string, string>;
}

// =============================================================================
// gRPC Adapter Type Markers
// =============================================================================

/**
 * gRPC Unary Adapter type marker
 * @template S - gRPC service definition (method name -> { request, response, metadata? })
 */
// biome-ignore lint/suspicious/noExplicitAny: Required for interface compatibility without index signatures
export interface GrpcUnaryAdapterTypes<S = any> extends AdapterTypeMarker {
	readonly request: GrpcRequest;
	readonly response: GrpcResponse;
	readonly options: GrpcRequestOptions;
	/** Service definition for type-safe methods */
	readonly service: S;
}

/**
 * gRPC Stream Adapter type marker
 * @template S - gRPC stream service definition (method name -> { clientMessage, serverMessage, metadata? })
 */
export interface GrpcStreamAdapterTypes<
	S extends GrpcStreamServiceDefinition = GrpcStreamServiceDefinition,
> extends AdapterTypeMarker {
	readonly request: never;
	readonly response: never;
	readonly options: never;
	/** Service definition for type-safe streaming */
	readonly service: S;
}
