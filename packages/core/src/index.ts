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

// Base adapter (Message, Address, ProtocolCharacteristics, etc.)
export * from "./base-adapter";
// Base component (Hook, HookHandler, errors, etc.)
export * from "./base-component";
// Execution (TestStep, TestCaseResult, TestScenario, testCase, etc.)
export * from "./execution";
// Recording (Interaction, InteractionRecorder, etc.)
export * from "./recording";
// Components (Client, Server, AsyncClient, AsyncServer)
export * from "./components";
// HTTP adapter
export * from "./adapters/http";
