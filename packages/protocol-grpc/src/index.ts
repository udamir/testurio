/**
 * gRPC Protocol for Testurio
 *
 * Provides gRPC protocol support:
 * - GrpcUnaryProtocol - Unary (request/response) calls
 * - GrpcStreamProtocol - Bidirectional streaming
 *
 * @example
 * ```typescript
 * import { TestScenario, Server } from 'testurio';
 * import { GrpcUnaryProtocol } from '@testurio/protocol-grpc';
 *
 * const backend = new Server('backend', {
 *   listenAddress: { host: 'localhost', port: 50051 },
 *   protocol: new GrpcUnaryProtocol({ schema: 'service.proto' }),
 * });
 * ```
 */

export {
	GrpcUnaryProtocol,
	GrpcStreamProtocol,
	type GrpcUnaryProtocolOptions,
	type GrpcStreamProtocolOptions,
} from "./grpc.protocol";

// Export gRPC-specific types
export type {
	GrpcMetadata,
	GrpcMethod,
	GrpcServiceDefinition,
	GrpcStreamMethod,
	GrpcStreamServiceDefinition,
	GrpcRequest,
	GrpcResponse,
	GrpcRequestOptions,
	GrpcUnaryProtocolTypes,
	GrpcStreamProtocolTypes,
} from "./types";
