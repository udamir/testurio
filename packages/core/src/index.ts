/**
 * Testurio Core
 *
 * A declarative test framework for testing distributed systems.
 * Core package includes HTTP adapter only (zero dependencies).
 *
 * For additional protocols, install:
 * - @testurio/adapter-grpc - gRPC unary and streaming
 * - @testurio/adapter-ws - WebSocket
 * - @testurio/adapter-tcp - TCP/custom protocols
 *
 * For reporters:
 * - @testurio/reporter-allure - Allure TestOps integration
 *
 * @example
 * ```typescript
 * import { TestScenario, testCase, Server, Client, HttpAdapter } from 'testurio';
 *
 * const scenario = new TestScenario({
 *   name: 'API Test',
 *   components: [
 *     new Server('backend', {
 *       adapter: new HttpAdapter(),
 *       listenAddress: { host: 'localhost', port: 3000 },
 *     }),
 *     new Client('api', {
 *       adapter: new HttpAdapter(),
 *       targetAddress: { host: 'localhost', port: 3000 },
 *     }),
 *   ],
 * });
 *
 * const tc = testCase('Get user', (test) => {
 *   test.client('api').request('getUser', { method: 'GET', path: '/users/1' });
 *   test.server('backend').onRequest('GET /users/1').respond({ status: 200, body: { id: 1 } });
 *   test.client('api').onResponse('getUser').assert((res) => res.id === 1);
 * });
 *
 * await scenario.run(tc);
 * ```
 */

// Re-export all from submodules
export * from "./types";
export * from "./components";
export * from "./adapters";
export * from "./hooks";
export * from "./builders";
export * from "./execution";
export * from "./recording";
