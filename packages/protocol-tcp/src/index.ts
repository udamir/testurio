/**
 * TCP Protocol for Testurio
 *
 * Provides TCP protocol support for custom binary/text protocols.
 *
 * @example
 * ```typescript
 * import { TestScenario, AsyncServer } from 'testurio';
 * import { TcpProtocol, type TcpServiceDefinition } from '@testurio/protocol-tcp';
 *
 * interface MyTcpService extends TcpServiceDefinition {
 *   clientMessages: {
 *     Request: { data: string };
 *   };
 *   serverMessages: {
 *     Response: { result: string };
 *   };
 * }
 *
 * const server = AsyncServer.create('backend', {
 *   listenAddress: { host: 'localhost', port: 9000 },
 *   protocol: new TcpProtocol<MyTcpService>(),
 * });
 * ```
 */

export { TcpProtocol, createTcpProtocol } from "./tcp.protocol";
export { TcpServerAdapter, TcpClientAdapter } from "./tcp.adapters";

// Export TCP client/server classes
export * from "./tcp.client";
export * from "./tcp.server";
export * from "./tcp.socket";
export * from "./framing";

// Export TCP-specific types
export type { TcpServiceDefinition, TcpProtocolOptions } from "./types";
