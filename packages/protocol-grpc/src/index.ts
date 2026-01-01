/**
 * gRPC Protocol Package
 *
 * Provides gRPC protocol implementations for testurio:
 * - GrpcUnaryProtocol: Synchronous request/response (unary calls)
 * - GrpcStreamProtocol: Asynchronous bidirectional streaming
 *
 * @example
 * ```typescript
 * import { GrpcUnaryProtocol, GrpcStreamProtocol } from '@testurio/protocol-grpc';
 *
 * // Unary protocol for request/response
 * const unaryProtocol = new GrpcUnaryProtocol({ schema: 'service.proto' });
 *
 * // Stream protocol for bidirectional streaming
 * const streamProtocol = new GrpcStreamProtocol({ schema: 'stream.proto' });
 * ```
 */

// Protocol classes
export {
	GrpcUnaryProtocol,
	createGrpcUnaryProtocol,
} from "./unary.protocol";

export {
	GrpcStreamProtocol,
	createGrpcStreamProtocol,
} from "./stream.protocol";

// Types
export type {
	// Protocol options
	GrpcUnaryProtocolOptions,
	GrpcStreamProtocolOptions,
	GrpcUnaryRequestOptions,
	// Operation types
	GrpcOperationRequest,
	GrpcOperationResponse,
	GrpcOperation,
	GrpcOperations,
	// Service definitions
	GrpcMetadata,
	GrpcMethod,
	GrpcServiceDefinition,
	GrpcStreamMethod,
	GrpcStreamServiceDefinition,
	// Request/Response types
	GrpcRequest,
	GrpcResponse,
	GrpcRequestOptions,
	// Protocol type markers
	GrpcUnaryProtocolTypes,
	GrpcStreamProtocolTypes,
} from "./types";

// Schema utilities (for advanced usage)
export {
	loadGrpcSchema,
	extractServices,
	getServiceClient,
	toSchemaDefinition,
	type LoadedSchema,
} from "./schema-loader";

// Metadata utilities (for advanced usage)
export {
	extractGrpcMetadata,
	createGrpcMetadata,
} from "./metadata";
