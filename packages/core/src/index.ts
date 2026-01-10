/**
 * Testurio Core
 *
 * A declarative test framework for testing distributed systems.
 * Core package includes HTTP protocol only (zero dependencies).
 *
 * For additional protocols, install:
 * - @testurio/protocol-grpc - gRPC unary and streaming
 * - @testurio/protocol-ws - WebSocket
 * - @testurio/protocol-tcp - TCP/custom protocols
 *
 * For reporters:
 * - @testurio/reporter-allure - Allure TestOps integration
 *
 * @example
 * ```typescript
 * import { TestScenario, testCase, Server, Client, HttpProtocol } from 'testurio';
 *
 * const scenario = new TestScenario({
 *   name: 'API Test',
 *   components: [
 *     new Server('backend', {
 *       protocol: new HttpProtocol(),
 *       listenAddress: { host: 'localhost', port: 3000 },
 *     }),
 *     new Client('api', {
 *       protocol: new HttpProtocol(),
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

// Components (Client, Server, AsyncClient, AsyncServer)
export * from "./components";
// Base component (Hook, HookHandler, errors, etc.)
export * from "./components/base";
// Execution (TestStep, TestCaseResult, TestScenario, testCase, etc.)
export * from "./execution";
// Base protocol (Message, Address, ProtocolCharacteristics, etc.)
export * from "./protocols/base";
// HTTP protocol
export * from "./protocols/http";
// Recording (Interaction, InteractionRecorder, etc.)
export * from "./recording";

export * from "./utils";

export * from "./codecs";
