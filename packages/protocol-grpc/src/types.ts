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

import type { Message, SyncRequestOptions } from "testurio";

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
 * gRPC Stream Service definition for bidirectional streaming.
 * Uses separate clientMessages and serverMessages maps.
 *
 * @example
 * ```typescript
 * interface MyStreamService extends GrpcStreamServiceDefinition {
 *   clientMessages: {
 *     ping: { request_id: string; timestamp: number };
 *     subscribe: { channel: string };
 *   };
 *   serverMessages: {
 *     pong: { request_id: string; latency: number };
 *     data: { channel: string; payload: unknown };
 *   };
 * }
 * ```
 */
export interface GrpcStreamServiceDefinition {
	/** Messages that can be sent from client to server */
	clientMessages: Record<string, unknown>;
	/** Messages that can be sent from server to client */
	serverMessages: Record<string, unknown>;
}

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
// gRPC Client Method Types (for type-safe client access)
// =============================================================================

import type * as grpc from "@grpc/grpc-js";

/**
 * gRPC call options for setting deadline, etc.
 */
export interface GrpcCallOptions {
	deadline?: Date | number;
}

/**
 * gRPC unary method signature on client (with options overload)
 */
export type GrpcUnaryClientMethod = {
	(
		request: unknown,
		metadata: grpc.Metadata,
		callback: (err: grpc.ServiceError | null, response: unknown) => void
	): grpc.ClientUnaryCall;
	(
		request: unknown,
		metadata: grpc.Metadata,
		options: GrpcCallOptions,
		callback: (err: grpc.ServiceError | null, response: unknown) => void
	): grpc.ClientUnaryCall;
};

/**
 * gRPC bidirectional stream method signature on client
 */
export type GrpcStreamClientMethod = (metadata?: grpc.Metadata) => grpc.ClientDuplexStream<unknown, unknown>;

/**
 * gRPC client with typed method access
 * Used to avoid double cast (as unknown as Record<...>)
 */
export interface GrpcClientMethods {
	[methodName: string]: GrpcUnaryClientMethod | GrpcStreamClientMethod | undefined;
}
