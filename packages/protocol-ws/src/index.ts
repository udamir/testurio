/**
 * WebSocket Protocol for Testurio
 *
 * Provides WebSocket protocol support for async bidirectional messaging.
 *
 * @example
 * ```typescript
 * import { TestScenario, AsyncServer, AsyncClient } from 'testurio';
 * import { WebSocketProtocol, WsServiceDefinition } from '@testurio/protocol-ws';
 *
 * interface MyWsService extends WsServiceDefinition {
 *   clientMessages: {
 *     ping: { seq: number };
 *   };
 *   serverMessages: {
 *     pong: { seq: number };
 *   };
 * }
 *
 * const server = new AsyncServer('ws-server', {
 *   protocol: new WebSocketProtocol<MyWsService>(),
 *   listenAddress: { host: 'localhost', port: 8080 },
 * });
 * ```
 */

export * from "./types";
export * from "./ws.adapters";
export * from "./ws.protocol";
