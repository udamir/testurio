/**
 * gRPC Protocol Types
 *
 * Type definitions for gRPC protocols (unary and streaming).
 * Supports both loose mode (no type parameters) and strict mode (with type parameters).
 *
 * @example Loose Mode (any operation ID)
 * ```typescript
 * const client = new Client('api', {
 *   protocol: new GrpcUnaryProtocol({ schema: 'service.proto' }),
 *   targetAddress: { host: 'localhost', port: 50051 },
 * });
 *
 * // Any operation ID is valid
 * api.request('GetUser', { payload: { user_id: 42 } });
 * ```
 *
 * @example Strict Mode (typed operations)
 * ```typescript
 * interface MyGrpcService {
 *   GetUser: {
 *     request: { user_id: number };
 *     response: { name: string; email: string };
 *   };
 * }
 *
 * const client = new Client('api', {
 *   protocol: new GrpcUnaryProtocol<MyGrpcService>({ schema: 'service.proto' }),
 *   targetAddress: { host: 'localhost', port: 50051 },
 * });
 *
 * // Only defined operations are valid
 * api.request('GetUser', { payload: { user_id: 42 } });
 * ```
 */

import type * as grpc from "@grpc/grpc-js";
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

// =============================================================================
// Flexible Type System (Loose/Strict Mode)
// =============================================================================

/**
 * Generic gRPC request payload (loose mode)
 * Allows any fields when no type parameter is provided.
 */
export interface GrpcRequestPayload {
	[key: string]: unknown;
}

/**
 * Generic gRPC response payload (loose mode)
 * Allows any fields when no type parameter is provided.
 */
export interface GrpcResponsePayload {
	[key: string]: unknown;
}

/**
 * Generic gRPC message for streaming (loose mode)
 */
export interface GrpcMessagePayload {
	[key: string]: unknown;
}

/**
 * gRPC Unary operation definition
 *
 * @template TReq - Request type
 * @template TRes - Response type
 */
export interface GrpcUnaryOperation<TReq = GrpcRequestPayload, TRes = GrpcResponsePayload> {
	readonly request: TReq;
	readonly response: TRes;
}

/**
 * gRPC Stream operation definition
 *
 * @template TReq - Request/client message type
 * @template TRes - Response/server message type
 */
export interface GrpcStreamOperation<TReq = GrpcMessagePayload, TRes = GrpcMessagePayload> {
	readonly request: TReq;
	readonly response: TRes;
}

/**
 * Default gRPC unary operations - allows any string key (loose mode)
 * When GrpcUnaryProtocol is used without type parameter, this allows
 * any operation ID with generic request/response types.
 */
export interface DefaultGrpcUnaryOperations {
	[key: string]: GrpcUnaryOperation<GrpcRequestPayload, GrpcResponsePayload>;
}

/**
 * Default gRPC stream messages - allows any string key (loose mode)
 * Matches AsyncMessages format required by BaseAsyncProtocol.
 * When GrpcStreamProtocol is used without type parameter, this allows
 * any message type with generic payload.
 */
export interface DefaultGrpcStreamMessages {
	clientMessages: {
		[key: string]: GrpcMessagePayload;
	};
	serverMessages: {
		[key: string]: GrpcMessagePayload;
	};
}

/**
 * gRPC Unary Service definition - maps operation IDs to operations
 *
 * @template T - Service definition type
 *   - If T is omitted or DefaultGrpcUnaryOperations: loose mode (any string key)
 *   - If T is a specific interface: strict mode (only defined keys)
 */
export type GrpcUnaryOperations<T = DefaultGrpcUnaryOperations> = T extends DefaultGrpcUnaryOperations
	? DefaultGrpcUnaryOperations
	: {
			[K in keyof T]: GrpcUnaryOperation<
				T[K] extends { request: infer R } ? R : GrpcRequestPayload,
				T[K] extends { response: infer S } ? S : GrpcResponsePayload
			>;
		};

// =============================================================================
// Mode Detection Types
// =============================================================================

/**
 * Check if unary protocol is in loose mode (using default operations)
 *
 * @template S - Service definition from protocol
 * @returns true if loose mode, false if strict mode
 *
 * Detection logic:
 * - If `string extends keyof S` is true, it means S has an index signature
 * - Index signature = loose mode
 * - Specific keys only = strict mode
 */
export type IsGrpcLooseMode<S> = string extends keyof S ? true : false;

/**
 * Check if stream protocol is in loose mode (using default messages)
 *
 * @template M - Messages definition from protocol (with clientMessages/serverMessages)
 * @returns true if loose mode, false if strict mode
 *
 * Detection logic:
 * - If clientMessages has an index signature, it's loose mode
 */
export type IsGrpcStreamLooseMode<M> = M extends { clientMessages: infer C }
	? string extends keyof C
		? true
		: false
	: false;

/**
 * Get valid operation ID type based on mode
 *
 * @template S - Service definition
 * @returns string (loose mode) or keyof service (strict mode)
 */
export type GrpcOperationId<S> = IsGrpcLooseMode<S> extends true ? string : keyof S & string;

// =============================================================================
// Type Extraction Helpers
// =============================================================================

/**
 * Extract request type for an operation with loose mode fallback
 *
 * @template S - Service definition
 * @template K - Operation key
 */
export type ExtractGrpcRequestData<S, K> =
	IsGrpcLooseMode<S> extends true
		? GrpcRequestPayload
		: K extends keyof S
			? S[K] extends { request: infer R }
				? R
				: GrpcRequestPayload
			: GrpcRequestPayload;

/**
 * Extract response type for an operation with loose mode fallback
 *
 * @template S - Service definition
 * @template K - Operation key
 */
export type ExtractGrpcResponseData<S, K> =
	IsGrpcLooseMode<S> extends true
		? GrpcResponsePayload
		: K extends keyof S
			? S[K] extends { response: infer R }
				? R
				: GrpcResponsePayload
			: GrpcResponsePayload;

/**
 * Extract stream request/message type with loose mode fallback
 */
export type ExtractGrpcStreamRequest<S, K> =
	IsGrpcLooseMode<S> extends true
		? GrpcMessagePayload
		: K extends keyof S
			? S[K] extends { request: infer R }
				? R
				: GrpcMessagePayload
			: GrpcMessagePayload;

/**
 * Extract stream response/message type with loose mode fallback
 */
export type ExtractGrpcStreamResponse<S, K> =
	IsGrpcLooseMode<S> extends true
		? GrpcMessagePayload
		: K extends keyof S
			? S[K] extends { response: infer R }
				? R
				: GrpcMessagePayload
			: GrpcMessagePayload;

// =============================================================================
// Protocol Type Markers
// =============================================================================

/**
 * gRPC stream options
 */
export interface GrpcStreamOptions {
	/** Initial metadata to send with stream */
	metadata?: Record<string, string>;
}

/**
 * gRPC Unary Protocol type marker
 *
 * @template S - gRPC service definition
 */
export interface GrpcUnaryProtocolTypes<S extends GrpcUnaryOperations = DefaultGrpcUnaryOperations> {
	readonly request: GrpcOperationRequest;
	readonly response: GrpcOperationResponse;
	readonly options: GrpcRequestOptions;
	readonly service: S;
	/** Marker for loose mode detection */
	readonly isLooseMode: IsGrpcLooseMode<S>;
}

/**
 * gRPC Stream Protocol type marker
 *
 * @template M - gRPC stream messages definition (with clientMessages/serverMessages)
 */
export interface GrpcStreamProtocolTypes<M = DefaultGrpcStreamMessages> {
	readonly message: GrpcMessagePayload;
	readonly options: GrpcStreamOptions;
	/** Client messages definition */
	readonly clientMessages: M extends { clientMessages: infer C } ? C : Record<string, unknown>;
	/** Server messages definition */
	readonly serverMessages: M extends { serverMessages: infer S } ? S : Record<string, unknown>;
	/** Marker for loose mode detection */
	readonly isLooseMode: IsGrpcStreamLooseMode<M>;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard for gRPC service client constructor detection
 *
 * @param value - Value to check
 * @returns true if value is a ServiceClientConstructor
 */
export function isServiceClient(value: unknown): value is grpc.ServiceClientConstructor {
	return (
		typeof value === "function" && "service" in value && typeof (value as Record<string, unknown>).service === "object"
	);
}

/**
 * Type guard for gRPC namespace (package) detection
 *
 * @param value - Value to check
 * @returns true if value is a GrpcObject namespace
 */
export function isGrpcNamespace(value: unknown): value is grpc.GrpcObject {
	return typeof value === "object" && value !== null && !("service" in value);
}

/**
 * Type guard for response with grpcStatus field
 *
 * @param value - Value to check
 * @returns true if value has grpcStatus property
 */
export function hasGrpcStatus(value: unknown): value is { grpcStatus: number; grpcMessage?: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		"grpcStatus" in value &&
		typeof (value as Record<string, unknown>).grpcStatus === "number"
	);
}

/**
 * Type guard for response/request with payload field
 *
 * @param value - Value to check
 * @returns true if value has payload property
 */
export function hasPayload<T = unknown>(value: unknown): value is { payload: T } {
	return typeof value === "object" && value !== null && "payload" in value;
}
