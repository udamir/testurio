/**
 * gRPC Adapter for Testurio
 *
 * Provides gRPC protocol support:
 * - GrpcUnaryAdapter - Unary (request/response) calls
 * - GrpcStreamAdapter - Bidirectional streaming
 *
 * @example
 * ```typescript
 * import { TestScenario, MockConfig } from 'testurio';
 * import { GrpcUnary, GrpcStream } from '@testurio/adapter-grpc';
 *
 * const scenario = new TestScenario({
 *   components: [
 *     new MockConfig({
 *       name: 'backend',
 *       listenAddress: { host: 'localhost', port: 50051 },
 *       protocol: new GrpcUnary({ schema: 'service.proto' }),
 *     }),
 *   ],
 * });
 * ```
 */

export {
	GrpcUnaryAdapter,
	GrpcStreamAdapter,
	type GrpcUnaryAdapterOptions,
	type GrpcStreamAdapterOptions,
} from "./grpc-adapter";

// Re-export protocol config classes if they exist in the adapter
// These will need to be created or moved from core config
