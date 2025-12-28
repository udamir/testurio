/**
 * TCP Adapter for Testurio
 *
 * Provides TCP protocol support for custom binary/text protocols.
 *
 * @example
 * ```typescript
 * import { TestScenario, MockConfig } from 'testurio';
 * import { TcpProto } from '@testurio/adapter-tcp';
 *
 * const scenario = new TestScenario({
 *   components: [
 *     new MockConfig({
 *       name: 'server',
 *       listenAddress: { host: 'localhost', port: 9000 },
 *       protocol: new TcpProto({ schema: 'protocol.proto' }),
 *     }),
 *   ],
 * });
 * ```
 */

export { TcpAdapter } from "./tcp-adapter";

// Export TCP-specific types
export type { TcpProtocolDefinition, TcpAdapterTypes } from "./types";
