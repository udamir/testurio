/**
 * WebSocket Adapter for Testurio
 *
 * Provides WebSocket protocol support for async bidirectional messaging.
 *
 * @example
 * ```typescript
 * import { TestScenario, MockConfig } from 'testurio';
 * import { WebSocket } from '@testurio/adapter-ws';
 *
 * const scenario = new TestScenario({
 *   components: [
 *     new MockConfig({
 *       name: 'server',
 *       listenAddress: { host: 'localhost', port: 8080 },
 *       protocol: new WebSocket(),
 *     }),
 *   ],
 * });
 * ```
 */

export { WebSocketAdapter } from "./ws-adapter";
