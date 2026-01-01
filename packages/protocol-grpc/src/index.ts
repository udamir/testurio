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

export * from "./unary.protocol";
export * from "./stream.protocol";
export * from "./types";
export * from "./schema-loader";
export * from "./metadata";
