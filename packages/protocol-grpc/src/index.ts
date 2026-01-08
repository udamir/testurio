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

export * from "./credentials";
export * from "./metadata";
export * from "./schema-loader";
export * from "./stream.adapters";
export * from "./stream.protocol";
export * from "./types";
export * from "./unary.adapters";
export * from "./unary.protocol";
