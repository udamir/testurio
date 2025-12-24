/**
 * Test Framework
 *
 * A declarative test framework for testing distributed systems with
 * support for multiple protocols (HTTP, gRPC, TCP, WebSocket).
 *
 * @example
 * ```typescript
 * import { TestScenario, testCase, ClientComponent, Http } from './test-framework'
 *
 * const scenario = new TestScenario({
 *   name: 'API Test',
 *   components: [
 *     new ClientComponent({
 *       name: 'api',
 *       targetAddress: { host: 'localhost', port: 8080 },
 *       protocol: new Http(),
 *     }),
 *   ],
 * })
 *
 * const loginTest = testCase('User Login', (test) => {
 *   test.client('api')
 *     .request('POST', '/login')
 *     .expect(res => res.status === 200)
 * })
 *
 * await scenario.run(loginTest)
 * ```
 */

// Re-export all from submodules
export * from "./types";
export * from "./config";
export * from "./components";
export * from "./adapters";
export * from "./hooks";
export * from "./builders";
export * from "./execution";
export * from "./recording";