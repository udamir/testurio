/**
 * AsyncServer waitEvent Integration Tests
 *
 * Tests the waitEvent() step on AsyncServer in proxy mode.
 * waitEvent is the strict counterpart to onEvent for backend events:
 * - Must be waiting when event arrives
 * - Error if event arrives before step starts (strict ordering)
 * - Supports full handler chain (assert, transform, proxy, drop, timeout)
 *
 * Port range: 18xxx
 */

import { TcpProtocol } from "@testurio/protocol-tcp";
import { AsyncClient, AsyncServer, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";

// ============================================================================
// Message Type Definitions
// ============================================================================

interface PingRequest {
	timestamp: number;
}

interface PongResponse {
	timestamp: number;
}

interface DataRequest {
	id: string;
}

interface DataResponse {
	id: string;
	status: string;
	value: number;
}

// Service definition for type-safe TCP messaging
interface WaitEventTestService {
	clientMessages: {
		Ping: PingRequest;
		GetData: DataRequest;
	};
	serverMessages: {
		Pong: PongResponse;
		DataResponse: DataResponse;
	};
}

// Port counter for this test file (18xxx range)
let portCounter = 18000;
function getNextPort(): number {
	return portCounter++;
}

// Helper functions for creating TCP components
const createMockServer = (name: string, port: number) =>
	new AsyncServer(name, {
		protocol: new TcpProtocol<WaitEventTestService>(),
		listenAddress: { host: "localhost", port },
	});

const createClient = (name: string, port: number) =>
	new AsyncClient(name, {
		autoConnect: true,
		protocol: new TcpProtocol<WaitEventTestService>(),
		targetAddress: { host: "localhost", port },
	});

const createProxyServer = (name: string, listenPort: number, targetPort: number) =>
	new AsyncServer(name, {
		protocol: new TcpProtocol<WaitEventTestService>(),
		listenAddress: { host: "localhost", port: listenPort },
		targetAddress: { host: "localhost", port: targetPort },
	});

describe("AsyncServer waitEvent (Proxy Mode)", () => {
	describe("Basic waitEvent", () => {
		it("should block until backend event arrives", async () => {
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backend = createMockServer("backend", backendPort);
			const proxy = createProxyServer("proxy", proxyPort, backendPort);
			const client = createClient("client", proxyPort);

			const scenario = new TestScenario({
				name: "waitEvent Basic",
				components: [backend, proxy, client],
			});

			let eventCaptured = false;

			const tc = testCase("waitEvent blocks until event arrives from backend", (test) => {
				// Backend responds to Ping with Pong
				test
					.use(backend)
					.onMessage("Ping")
					.mockEvent("Pong", (p) => ({ timestamp: p.timestamp }));

				// Client sends request (trigger must be before waitEvent since waitEvent blocks)
				test.use(client).sendMessage("Ping", { timestamp: 42 });

				// Proxy uses waitEvent to intercept backend event (strict, blocks)
				test
					.use(proxy)
					.waitEvent("Pong")
					.timeout(2000)
					.assert((p) => {
						eventCaptured = true;
						return p.timestamp === 42;
					});

				// Client receives the forwarded event (use onEvent since event arrives during proxy.waitEvent)
				test
					.use(client)
					.onEvent("Pong")
					.assert((p) => p.timestamp === 42);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(eventCaptured).toBe(true);
		});
	});

	describe("waitEvent with matcher", () => {
		it("should filter events by payload using matcher", async () => {
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backend = createMockServer("backend", backendPort);
			const proxy = createProxyServer("proxy", proxyPort, backendPort);
			const client = createClient("client", proxyPort);

			const scenario = new TestScenario({
				name: "waitEvent Matcher",
				components: [backend, proxy, client],
			});

			let matchedEvent = false;

			const tc = testCase("waitEvent with matcher filters by payload", (test) => {
				// Backend responds to GetData with DataResponse
				test
					.use(backend)
					.onMessage("GetData")
					.mockEvent("DataResponse", (p) => ({
						id: p.id,
						status: "ok",
						value: 100,
					}));

				// Client sends request
				test.use(client).sendMessage("GetData", { id: "target" });

				// Proxy waits for a DataResponse with specific id (strict, blocks)
				test
					.use(proxy)
					.waitEvent("DataResponse", { matcher: (p) => p.id === "target" })
					.timeout(2000)
					.assert((p) => {
						matchedEvent = true;
						return p.value === 100;
					});

				// Client receives the forwarded event
				test
					.use(client)
					.onEvent("DataResponse")
					.assert((p) => p.id === "target");
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(matchedEvent).toBe(true);
		});
	});

	describe("waitEvent with full handler chain", () => {
		it("should support assert, transform via proxy, and timeout", async () => {
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backend = createMockServer("backend", backendPort);
			const proxy = createProxyServer("proxy", proxyPort, backendPort);
			const client = createClient("client", proxyPort);

			const scenario = new TestScenario({
				name: "waitEvent Handler Chain",
				components: [backend, proxy, client],
			});

			let assertRan = false;

			const tc = testCase("waitEvent with assert, transform, and timeout", (test) => {
				// Backend sends response
				test
					.use(backend)
					.onMessage("GetData")
					.mockEvent("DataResponse", (p) => ({
						id: p.id,
						status: "pending",
						value: 50,
					}));

				// Client sends request
				test.use(client).sendMessage("GetData", { id: "chain-test" });

				// Proxy waits for event and applies handler chain
				test
					.use(proxy)
					.waitEvent("DataResponse")
					.timeout(3000)
					.assert((p) => {
						assertRan = true;
						return p.status === "pending";
					})
					.proxy((p) => ({
						...p,
						status: "completed",
						value: p.value * 2,
					}));

				// Client receives the transformed event
				test
					.use(client)
					.onEvent("DataResponse")
					.assert((p) => p.status === "completed" && p.value === 100);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(assertRan).toBe(true);
		});
	});

	describe("waitEvent with drop", () => {
		it("should prevent forwarding to client when dropped", async () => {
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backend = createMockServer("backend", backendPort);
			const proxy = createProxyServer("proxy", proxyPort, backendPort);
			const client = createClient("client", proxyPort);

			const scenario = new TestScenario({
				name: "waitEvent Drop",
				components: [backend, proxy, client],
			});

			const tc = testCase("waitEvent with drop prevents forwarding", (test) => {
				// Backend sends response
				test
					.use(backend)
					.onMessage("Ping")
					.mockEvent("Pong", (p) => ({ timestamp: p.timestamp }));

				// Client sends request
				test.use(client).sendMessage("Ping", { timestamp: 1 });

				// Proxy intercepts and drops the event
				test.use(proxy).waitEvent("Pong").timeout(2000).drop();

				// Client should NOT receive the event (timeout expected)
				test
					.use(client)
					.waitEvent("Pong")
					.timeout(500)
					.assert(() => true);
			});

			const result = await scenario.run(tc);
			// Test should fail because client never receives the dropped event
			expect(result.passed).toBe(false);
		});
	});

	describe("waitEvent strict ordering violation", () => {
		it("should fail when event arrives before waitEvent starts", async () => {
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backend = createMockServer("backend", backendPort);
			const proxy = createProxyServer("proxy", proxyPort, backendPort);
			const client = createClient("client", proxyPort);

			const scenario = new TestScenario({
				name: "waitEvent Strict Ordering Violation",
				components: [backend, proxy, client],
			});

			const tc = testCase("event arrives before waitEvent starts", (test) => {
				// Wait for proxy→backend connection to be established and linked
				test.use(backend).waitConnection("b1").timeout(2000);

				// Backend proactively sends Pong event to proxy (before waitEvent step runs)
				test.use(backend).sendEvent("b1", "Pong", { timestamp: 99 });

				// Client sends Ping to proxy (proxy forwards via default proxy behavior)
				test.use(client).sendMessage("Ping", { timestamp: 1 });

				// Proxy waits for client Ping (blocks, yielding to event loop).
				// During this await, both the Pong (sent earlier) and Ping I/O callbacks fire.
				// The Pong callback resolves the waitEvent("Pong") hook via handleBackendEvent.
				test.use(proxy).waitMessage("Ping").timeout(2000);

				// Proxy tries waitEvent but the hook was already resolved
				// → strict ordering violation
				test.use(proxy).waitEvent("Pong").timeout(500);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(false);
			// Verify the error is specifically about strict ordering
			const error = result.testCases[0]?.error ?? "";
			expect(error).toContain("Strict ordering violation");
		});
	});

	describe("waitEvent timeout", () => {
		it("should timeout when backend event never arrives", async () => {
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backend = createMockServer("backend", backendPort);
			const proxy = createProxyServer("proxy", proxyPort, backendPort);
			const client = createClient("client", proxyPort);

			const scenario = new TestScenario({
				name: "waitEvent Timeout",
				components: [backend, proxy, client],
			});

			const tc = testCase("waitEvent times out when event never arrives", (test) => {
				// Backend receives message but does NOT respond with the expected event type
				test
					.use(backend)
					.onMessage("Ping")
					.assert(() => true);

				// Client sends request
				test.use(client).sendMessage("Ping", { timestamp: 1 });

				// Proxy waits for Pong event that never comes
				test.use(proxy).waitEvent("Pong").timeout(500);
			});

			const result = await scenario.run(tc);
			// Test should fail due to timeout
			expect(result.passed).toBe(false);
		});
	});
});
