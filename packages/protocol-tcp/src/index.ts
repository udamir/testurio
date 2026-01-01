/**
 * TCP Protocol for Testurio
 *
 * Provides TCP protocol support for custom binary/text protocols.
 *
 * @example
 * ```typescript
 * import { TestScenario, Server } from 'testurio';
 * import { TcpAdapter } from '@testurio/protocol-tcp';
 *
 * const server = new Server('backend', {
 *   listenAddress: { host: 'localhost', port: 9000 },
 *   protocol: new TcpAdapter({ schema: 'protocol.proto' }),
 * });
 * ```
 */

export { TcpAdapter } from "./tcp-adapter";

// Export TCP-specific types
export type { TcpProtocolDefinition, TcpAdapterTypes } from "./types";
