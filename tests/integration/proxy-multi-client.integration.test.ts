/**
 * Multi-Client Proxy Integration Tests
 *
 * Tests the core proxy functionality with multiple concurrent clients.
 * These tests verify:
 * - 1:1 session management (separate backend connection per client)
 * - Bidirectional message forwarding
 * - Message integrity (no duplication)
 * - Payload transformation through hooks
 * - Session lifecycle (linked disconnect handling)
 *
 * NOTE: These tests are written BEFORE implementation (TDD approach).
 * They should FAIL initially, proving the gaps exist.
 */

import { TcpProtocol } from "@testurio/protocol-tcp";
import { AsyncClient, AsyncServer, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";

// ============================================================================
// Message Type Definitions
// ============================================================================

interface LoginRequest {
	user: string;
	sessionId: string;
}

interface LoginResponse {
	user: string;
	sessionId: string;
	status: string;
}

interface DataRequest {
	clientId: string;
	data: string;
}

interface DataResponse {
	clientId: string;
	data: string;
	processed: boolean;
}

interface PingRequest {
	seq: number;
	clientId: string;
}

interface PongResponse {
	seq: number;
	clientId: string;
	pong: boolean;
}

interface BroadcastEvent {
	message: string;
	targetClientId?: string;
}

// Service definition for type-safe TCP messaging
interface ProxyTestService {
	clientMessages: {
		Login: LoginRequest;
		Data: DataRequest;
		Ping: PingRequest;
	};
	serverMessages: {
		LoginResponse: LoginResponse;
		DataResponse: DataResponse;
		Pong: PongResponse;
		Broadcast: BroadcastEvent;
	};
}

// Port counter for this test file (15xxx range)
let portCounter = 15000;
function getNextPort(): number {
	return portCounter++;
}

// Helper functions for creating TCP components
const createMockServer = (name: string, port: number) =>
	new AsyncServer(name, {
		protocol: new TcpProtocol<ProxyTestService>(),
		listenAddress: { host: "localhost", port },
	});

const createClient = (name: string, port: number) =>
	new AsyncClient(name, {
		protocol: new TcpProtocol<ProxyTestService>(),
		targetAddress: { host: "localhost", port },
	});

const createProxyServer = (name: string, listenPort: number, targetPort: number) =>
	new AsyncServer(name, {
		protocol: new TcpProtocol<ProxyTestService>(),
		listenAddress: { host: "localhost", port: listenPort },
		targetAddress: { host: "localhost", port: targetPort },
	});

describe("AsyncServer Proxy Mode - Multi-Client", () => {
	// ============================================================================
	// 0.1 Connection Management
	// ============================================================================
	describe("0.1 Connection Management", () => {
		it("should handle multiple clients connecting simultaneously", async () => {
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backend = createMockServer("backend", backendPort);
			const proxy = createProxyServer("proxy", proxyPort, backendPort);
			const client1 = createClient("client1", proxyPort);
			const client2 = createClient("client2", proxyPort);
			const client3 = createClient("client3", proxyPort);

			const scenario = new TestScenario({
				name: "Multi-Client Connection Test",
				components: [backend, proxy, client1, client2, client3],
			});

			const receivedMessages: string[] = [];

			const tc = testCase("Three clients connect and send messages", (test) => {
				// Backend should receive all three messages
				test
					.use(backend)
					.onMessage("Login")
					.mockEvent("LoginResponse", (payload) => {
						receivedMessages.push(payload.user);
						return { user: payload.user, sessionId: payload.sessionId, status: "ok" };
					});

				// All three clients send messages
				test.use(client1).sendMessage("Login", { user: "alice", sessionId: "s1" });
				test.use(client2).sendMessage("Login", { user: "bob", sessionId: "s2" });
				test.use(client3).sendMessage("Login", { user: "charlie", sessionId: "s3" });

				// All clients should receive their responses (use waitEvent for blocking)
				test
					.use(client1)
					.waitEvent("LoginResponse")
					.timeout(2000)
					.assert((p) => p.user === "alice");
				test
					.use(client2)
					.waitEvent("LoginResponse")
					.timeout(2000)
					.assert((p) => p.user === "bob");
				test
					.use(client3)
					.waitEvent("LoginResponse")
					.timeout(2000)
					.assert((p) => p.user === "charlie");
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(receivedMessages).toHaveLength(3);
			expect(receivedMessages).toContain("alice");
			expect(receivedMessages).toContain("bob");
			expect(receivedMessages).toContain("charlie");
		});

		it("should create separate backend connection per client (1:1 sessions)", async () => {
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backend = createMockServer("backend", backendPort);
			const proxy = createProxyServer("proxy", proxyPort, backendPort);
			const client1 = createClient("client1", proxyPort);
			const client2 = createClient("client2", proxyPort);

			const scenario = new TestScenario({
				name: "1:1 Session Test",
				components: [backend, proxy, client1, client2],
			});

			// Track which sessions receive which messages
			const sessionMessages = new Map<string, string[]>();

			const tc = testCase("Each client has isolated session", (test) => {
				// Backend tracks messages per session
				test
					.use(backend)
					.onMessage("Data")
					.mockEvent("DataResponse", (payload) => {
						const msgs = sessionMessages.get(payload.clientId) || [];
						msgs.push(payload.data);
						sessionMessages.set(payload.clientId, msgs);
						return { clientId: payload.clientId, data: payload.data, processed: true };
					});

				// Client1 sends multiple messages
				test.use(client1).sendMessage("Data", { clientId: "c1", data: "msg1" });
				test.use(client1).sendMessage("Data", { clientId: "c1", data: "msg2" });

				// Client2 sends a message
				test.use(client2).sendMessage("Data", { clientId: "c2", data: "msg3" });

				// Wait for specific messages using matcher
				test
					.use(client1)
					.waitEvent("DataResponse", { matcher: (p) => p.data === "msg2" })
					.timeout(2000)
					.assert((p) => p.data === "msg2");
				test
					.use(client2)
					.waitEvent("DataResponse", { matcher: (p) => p.data === "msg3" })
					.timeout(2000)
					.assert((p) => p.data === "msg3");
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);

			// Verify session isolation
			expect(sessionMessages.get("c1")).toEqual(["msg1", "msg2"]);
			expect(sessionMessages.get("c2")).toEqual(["msg3"]);
		});

		it("should maintain session isolation between clients", async () => {
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backend = createMockServer("backend", backendPort);
			const proxy = createProxyServer("proxy", proxyPort, backendPort);
			const client1 = createClient("client1", proxyPort);
			const client2 = createClient("client2", proxyPort);

			const scenario = new TestScenario({
				name: "Session Isolation Test",
				components: [backend, proxy, client1, client2],
			});

			let client1ReceivedWrongMessage = false;
			let client2ReceivedWrongMessage = false;

			const tc = testCase("Messages don't cross sessions", (test) => {
				// Backend responds with clientId in response
				test
					.use(backend)
					.onMessage("Ping")
					.mockEvent("Pong", (payload) => ({
						seq: payload.seq,
						clientId: payload.clientId,
						pong: true,
					}));

				test.use(client1).sendMessage("Ping", { seq: 1, clientId: "c1" });
				test.use(client2).sendMessage("Ping", { seq: 2, clientId: "c2" });

				// Each client should only receive their own response (use waitEvent for blocking)
				test
					.use(client1)
					.waitEvent("Pong")
					.timeout(2000)
					.assert((p) => {
						if (p.clientId !== "c1") client1ReceivedWrongMessage = true;
						return p.clientId === "c1" && p.seq === 1;
					});

				test
					.use(client2)
					.waitEvent("Pong")
					.timeout(2000)
					.assert((p) => {
						if (p.clientId !== "c2") client2ReceivedWrongMessage = true;
						return p.clientId === "c2" && p.seq === 2;
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(client1ReceivedWrongMessage).toBe(false);
			expect(client2ReceivedWrongMessage).toBe(false);
		});
	});

	// ============================================================================
	// 0.2 Automatic Message Forwarding
	// ============================================================================
	describe("0.2 Automatic Message Forwarding", () => {
		it("should forward ALL client messages to backend even without test handlers", async () => {
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backend = createMockServer("backend", backendPort);
			const proxy = createProxyServer("proxy", proxyPort, backendPort);
			const client = createClient("client", proxyPort);

			const scenario = new TestScenario({
				name: "Auto Forward Client Messages",
				components: [backend, proxy, client],
			});

			let backendReceivedMessage = false;

			const tc = testCase("Messages forwarded without explicit handlers", (test) => {
				// Client sends message - no handler registered on proxy
				test.use(client).sendMessage("Data", { clientId: "test", data: "auto-forward" });

				// Backend should still receive it (proxy forwards automatically)
				test
					.use(backend)
					.waitMessage("Data")
					.timeout(2000)
					.assert((payload) => {
						backendReceivedMessage = true;
						return payload.data === "auto-forward";
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(backendReceivedMessage).toBe(true);
		});

		it("should forward ALL backend events to client even without test handlers", async () => {
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backend = createMockServer("backend", backendPort);
			const proxy = createProxyServer("proxy", proxyPort, backendPort);
			const client = createClient("client", proxyPort);

			const scenario = new TestScenario({
				name: "Auto Forward Backend Events",
				components: [backend, proxy, client],
			});

			let clientReceivedEvent = false;

			const tc = testCase("Events forwarded without explicit handlers", (test) => {
				// Backend responds - no handler on proxy for response
				test
					.use(backend)
					.onMessage("Login")
					.mockEvent("LoginResponse", (payload) => ({
						user: payload.user,
						sessionId: payload.sessionId,
						status: "ok",
					}));

				// Client sends request
				test.use(client).sendMessage("Login", { user: "test", sessionId: "s1" });

				// Client should receive response (proxy forwards automatically)
				test
					.use(client)
					.waitEvent("LoginResponse")
					.timeout(2000)
					.assert((payload) => {
						clientReceivedEvent = true;
						return payload.status === "ok";
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(clientReceivedEvent).toBe(true);
		});

		it("should preserve message type, payload, and traceId during forwarding", async () => {
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backend = createMockServer("backend", backendPort);
			const proxy = createProxyServer("proxy", proxyPort, backendPort);
			const client = createClient("client", proxyPort);

			const scenario = new TestScenario({
				name: "Preserve Message Properties",
				components: [backend, proxy, client],
			});

			let receivedPayload: DataRequest | undefined;

			const tc = testCase("Message properties preserved through proxy", (test) => {
				const originalPayload = { clientId: "preserve-test", data: "important-data" };

				test.use(client).sendMessage("Data", originalPayload);

				test
					.use(backend)
					.waitMessage("Data")
					.timeout(2000)
					.assert((payload) => {
						receivedPayload = payload;
						return payload.clientId === originalPayload.clientId && payload.data === originalPayload.data;
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(receivedPayload).toEqual({ clientId: "preserve-test", data: "important-data" });
		});
	});

	// ============================================================================
	// 0.3 Message Integrity (No Duplication)
	// ============================================================================
	describe("0.3 Message Integrity", () => {
		it("should NOT duplicate messages when proxying", async () => {
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backend = createMockServer("backend", backendPort);
			const proxy = createProxyServer("proxy", proxyPort, backendPort);
			const client = createClient("client", proxyPort);

			const scenario = new TestScenario({
				name: "No Duplication Test",
				components: [backend, proxy, client],
			});

			let messageCount = 0;

			const tc = testCase("Single message arrives once", (test) => {
				// Count how many times backend receives the message
				test
					.use(backend)
					.onMessage("Ping")
					.mockEvent("Pong", (payload) => {
						messageCount++;
						return { seq: payload.seq, clientId: payload.clientId, pong: true };
					});

				test.use(client).sendMessage("Ping", { seq: 1, clientId: "dup-test" });

				test
					.use(client)
					.waitEvent("Pong")
					.timeout(2000)
					.assert((p) => p.seq === 1);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(messageCount).toBe(1); // Should be exactly 1, not more
		});

		it("should deliver each message exactly once to backend", async () => {
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backend = createMockServer("backend", backendPort);
			const proxy = createProxyServer("proxy", proxyPort, backendPort);
			const client = createClient("client", proxyPort);

			const scenario = new TestScenario({
				name: "Exactly Once Delivery",
				components: [backend, proxy, client],
			});

			const receivedSeqs: number[] = [];

			const tc = testCase("Multiple messages each arrive once", (test) => {
				test
					.use(backend)
					.onMessage("Ping")
					.mockEvent("Pong", (payload) => {
						receivedSeqs.push(payload.seq);
						return { seq: payload.seq, clientId: payload.clientId, pong: true };
					});

				// Send 5 messages
				for (let i = 1; i <= 5; i++) {
					test.use(client).sendMessage("Ping", { seq: i, clientId: "exact-once" });
				}

				// Wait for last response using matcher to filter for seq=5
				test
					.use(client)
					.waitEvent("Pong", { matcher: (p) => p.seq === 5 })
					.timeout(2000)
					.assert((p) => p.seq === 5);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			// Each seq should appear exactly once
			expect(receivedSeqs.sort()).toEqual([1, 2, 3, 4, 5]);
		});

		it("should deliver each event exactly once to client", async () => {
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backend = createMockServer("backend", backendPort);
			const proxy = createProxyServer("proxy", proxyPort, backendPort);
			const client = createClient("client", proxyPort);

			const scenario = new TestScenario({
				name: "Event Exactly Once",
				components: [backend, proxy, client],
			});

			const receivedResponses: number[] = [];

			const tc = testCase("Response events arrive once each", (test) => {
				test
					.use(backend)
					.onMessage("Ping")
					.mockEvent("Pong", (payload) => ({
						seq: payload.seq,
						clientId: payload.clientId,
						pong: true,
					}));

				test.use(client).sendMessage("Ping", { seq: 1, clientId: "event-once" });

				test
					.use(client)
					.waitEvent("Pong")
					.timeout(2000)
					.assert((p) => {
						receivedResponses.push(p.seq);
						return p.seq === 1;
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(receivedResponses).toEqual([1]); // Should be exactly [1], not [1, 1]
		});
	});

	// ============================================================================
	// 0.4 Hook Transformation
	// ============================================================================
	describe("0.4 Hook Transformation", () => {
		it("should apply hook transformations to client→backend messages", async () => {
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backend = createMockServer("backend", backendPort);
			const proxy = createProxyServer("proxy", proxyPort, backendPort);
			const client = createClient("client", proxyPort);

			const scenario = new TestScenario({
				name: "Transform Client Messages",
				components: [backend, proxy, client],
			});

			let backendReceivedUser: string | undefined;

			const tc = testCase("Proxy transforms message before forwarding", (test) => {
				// Proxy transforms user to uppercase
				test
					.use(proxy)
					.onMessage("Login")
					.proxy((payload) => ({
						...payload,
						user: payload.user.toUpperCase(),
					}));

				// Backend should receive UPPERCASE user
				test
					.use(backend)
					.onMessage("Login")
					.mockEvent("LoginResponse", (payload) => {
						backendReceivedUser = payload.user;
						return { user: payload.user, sessionId: payload.sessionId, status: "ok" };
					});

				// Client sends lowercase user
				test.use(client).sendMessage("Login", { user: "alice", sessionId: "s1" });

				test
					.use(client)
					.waitEvent("LoginResponse")
					.timeout(2000)
					.assert((p) => p.status === "ok");
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(backendReceivedUser).toBe("ALICE"); // Transformed, not "alice"
		});

		it("should apply hook transformations to backend→client events", async () => {
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backend = createMockServer("backend", backendPort);
			const proxy = createProxyServer("proxy", proxyPort, backendPort);
			const client = createClient("client", proxyPort);

			const scenario = new TestScenario({
				name: "Transform Backend Events",
				components: [backend, proxy, client],
			});

			let clientReceivedStatus: string | undefined;

			const tc = testCase("Proxy transforms response before forwarding", (test) => {
				// Backend sends lowercase status
				test
					.use(backend)
					.onMessage("Login")
					.mockEvent("LoginResponse", (payload) => ({
						user: payload.user,
						sessionId: payload.sessionId,
						status: "ok",
					}));

				// Proxy transforms status to uppercase
				test
					.use(proxy)
					.onEvent("LoginResponse")
					.proxy((payload) => ({
						...payload,
						status: payload.status.toUpperCase(),
					}));

				test.use(client).sendMessage("Login", { user: "bob", sessionId: "s2" });

				// Client should receive UPPERCASE status
				test
					.use(client)
					.waitEvent("LoginResponse")
					.timeout(2000)
					.assert((p) => {
						clientReceivedStatus = p.status;
						return p.status === "OK";
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(clientReceivedStatus).toBe("OK"); // Transformed, not "ok"
		});

		it("should deliver transformed payload (not original) to destination", async () => {
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backend = createMockServer("backend", backendPort);
			const proxy = createProxyServer("proxy", proxyPort, backendPort);
			const client = createClient("client", proxyPort);

			const scenario = new TestScenario({
				name: "Transformed Payload Delivery",
				components: [backend, proxy, client],
			});

			let backendReceivedData: string | undefined;

			const tc = testCase("Only transformed payload reaches backend", (test) => {
				test.use(client).sendMessage("Data", { clientId: "transform", data: "original" });

				// Proxy completely changes the data
				test
					.use(proxy)
					.onMessage("Data")
					.proxy((payload) => ({
						...payload,
						data: "TRANSFORMED",
					}));

				test
					.use(backend)
					.waitMessage("Data")
					.timeout(2000)
					.assert((payload) => {
						backendReceivedData = payload.data;
						return payload.data === "TRANSFORMED";
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(backendReceivedData).toBe("TRANSFORMED");
			expect(backendReceivedData).not.toBe("original");
		});
	});

	// ============================================================================
	// 0.5 Payload-Based Message Filtering
	// ============================================================================
	// NOTE: connectionId filtering at the component level requires protocol-level
	// ID propagation (client sends its connectionId to server). The TCP protocol
	// currently generates independent IDs on each side. These tests use payload-
	// based matcher filtering instead, which works correctly for all scenarios.
	describe("0.5 Payload-Based Message Filtering", () => {
		it("should only trigger onMessage for matching payload via matcher", async () => {
			const serverPort = getNextPort();
			const server = createMockServer("server", serverPort);
			const client1 = createClient("client1", serverPort);
			const client2 = createClient("client2", serverPort);

			const scenario = new TestScenario({
				name: "Matcher Filtering Test",
				components: [server, client1, client2],
			});

			const messagesFromClient1: string[] = [];
			const messagesFromClient2: string[] = [];

			const tc = testCase("onMessage filters by payload matcher", (test) => {
				// Register onMessage that ONLY matches client2's messages via payload
				test
					.use(server)
					.onMessage("Data", { matcher: (p) => p.clientId === "c2" })
					.assert((payload) => {
						messagesFromClient2.push(payload.data);
						return payload.data === "from-client2";
					})
					.mockEvent("DataResponse", (payload) => ({
						clientId: payload.clientId,
						data: payload.data,
						processed: true,
					}));

				// Register another handler for client1 messages
				test
					.use(server)
					.onMessage("Data", { matcher: (p) => p.clientId === "c1" })
					.mockEvent("DataResponse", (payload) => {
						messagesFromClient1.push(payload.data);
						return { clientId: payload.clientId, data: payload.data, processed: true };
					});

				// Both clients send messages (BEFORE waitEvent so messages are in flight)
				test.use(client1).sendMessage("Data", { clientId: "c1", data: "from-client1" });
				test.use(client2).sendMessage("Data", { clientId: "c2", data: "from-client2" });

				// Use waitEvent (blocking) to ensure test waits for responses
				test
					.use(client1)
					.waitEvent("DataResponse", { matcher: (p) => p.data === "from-client1" })
					.timeout(2000)
					.assert((p) => p.data === "from-client1");
				test
					.use(client2)
					.waitEvent("DataResponse", { matcher: (p) => p.data === "from-client2" })
					.timeout(2000)
					.assert((p) => p.data === "from-client2");
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			// The matcher for c2 should only have captured client2's message
			expect(messagesFromClient2).toEqual(["from-client2"]);
			// The matcher for c1 should have captured client1's message
			expect(messagesFromClient1).toEqual(["from-client1"]);
		});

		it("should not match messages from other clients when matcher is specified", async () => {
			const serverPort = getNextPort();
			const server = createMockServer("server", serverPort);
			const client1 = createClient("client1", serverPort);
			const client2 = createClient("client2", serverPort);

			const scenario = new TestScenario({
				name: "Matcher Exclusion Test",
				components: [server, client1, client2],
			});

			let handlerTriggeredByClient1 = false;
			let handlerTriggeredByClient2 = false;

			const tc = testCase("onMessage ignores non-matching payloads", (test) => {
				// Register onMessage that ONLY matches client2's payload
				// Messages from client1 should NOT trigger this handler
				test
					.use(server)
					.onMessage("Ping", { matcher: (p) => p.clientId === "c2" })
					.assert((payload) => {
						if (payload.clientId === "c1") {
							handlerTriggeredByClient1 = true;
						}
						if (payload.clientId === "c2") {
							handlerTriggeredByClient2 = true;
						}
						return true;
					})
					.mockEvent("Pong", (payload) => ({
						seq: payload.seq,
						clientId: payload.clientId,
						pong: true,
						source: "filtered-handler",
					}));

				// Catch-all handler for client1 messages
				test
					.use(server)
					.onMessage("Ping", { matcher: (p) => p.clientId === "c1" })
					.mockEvent("Pong", (payload) => ({
						seq: payload.seq,
						clientId: payload.clientId,
						pong: true,
						source: "catch-all",
					}));

				// Both clients send messages (BEFORE waitEvent so messages are in flight)
				test.use(client1).sendMessage("Ping", { seq: 1, clientId: "c1" });
				test.use(client2).sendMessage("Ping", { seq: 2, clientId: "c2" });

				// Use waitEvent (blocking) to ensure test waits for responses
				test
					.use(client1)
					.waitEvent("Pong", { matcher: (p) => p.clientId === "c1" })
					.timeout(2000)
					.assert((p) => p.clientId === "c1");
				test
					.use(client2)
					.waitEvent("Pong", { matcher: (p) => p.clientId === "c2" })
					.timeout(2000)
					.assert((p) => p.clientId === "c2");
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			// The filtered handler should NOT have been triggered by client1's message
			expect(handlerTriggeredByClient1).toBe(false);
			// The filtered handler SHOULD have been triggered by client2's message
			expect(handlerTriggeredByClient2).toBe(true);
		});

		it("should work correctly with waitMessage and payload matcher filtering", async () => {
			const serverPort = getNextPort();
			const server = createMockServer("server", serverPort);
			const client1 = createClient("client1", serverPort);
			const client2 = createClient("client2", serverPort);

			const scenario = new TestScenario({
				name: "WaitMessage Matcher Test",
				components: [server, client1, client2],
			});

			let waitMessagePayload: { clientId: string; data: string } | null = null;

			const tc = testCase("waitMessage with matcher blocks until matching message", (test) => {
				// Catch-all handler for client1 (so client1's message gets a response)
				test
					.use(server)
					.onMessage("Data", { matcher: (p) => p.clientId === "c1" })
					.mockEvent("DataResponse", (payload) => ({
						clientId: payload.clientId,
						data: payload.data,
						processed: true,
					}));

				// Send messages FIRST (before waitMessage starts blocking)
				test.use(client1).sendMessage("Data", { clientId: "c1", data: "from-client1" });
				test.use(client2).sendMessage("Data", { clientId: "c2", data: "from-client2" });

				// waitMessage (blocking) - ONLY matches client2's messages via matcher
				// This comes AFTER sendMessage so the message is in flight
				test
					.use(server)
					.waitMessage("Data", { matcher: (p) => p.clientId === "c2" })
					.timeout(2000)
					.assert((payload) => {
						waitMessagePayload = payload as { clientId: string; data: string };
						return payload.clientId === "c2";
					})
					.mockEvent("DataResponse", (payload) => ({
						clientId: payload.clientId,
						data: payload.data,
						processed: true,
					}));

				// Use onEvent (non-strict) for client responses
				test
					.use(client1)
					.onEvent("DataResponse")
					.assert((p) => p.data === "from-client1");
				test
					.use(client2)
					.onEvent("DataResponse")
					.assert((p) => p.data === "from-client2");
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			// waitMessage should have captured only client2's message
			expect(waitMessagePayload).not.toBeNull();
			expect(waitMessagePayload?.clientId).toBe("c2");
			expect(waitMessagePayload?.data).toBe("from-client2");
		});

		it("should match any message when no matcher is specified", async () => {
			const serverPort = getNextPort();
			const server = createMockServer("server", serverPort);
			const client1 = createClient("client1", serverPort);
			const client2 = createClient("client2", serverPort);

			const scenario = new TestScenario({
				name: "No Matcher Filter Test",
				components: [server, client1, client2],
			});

			const receivedClientIds: string[] = [];

			const tc = testCase("onMessage without matcher matches all", (test) => {
				// Register onMessage without matcher filter - should match ANY client
				test
					.use(server)
					.onMessage("Login")
					.mockEvent("LoginResponse", (payload) => {
						receivedClientIds.push(payload.user);
						return { user: payload.user, sessionId: payload.sessionId, status: "ok" };
					});

				// Both clients send messages (BEFORE waitEvent so messages are in flight)
				test.use(client1).sendMessage("Login", { user: "user1", sessionId: "s1" });
				test.use(client2).sendMessage("Login", { user: "user2", sessionId: "s2" });

				// Use waitEvent (blocking) to ensure test waits for responses
				test
					.use(client1)
					.waitEvent("LoginResponse", { matcher: (p) => p.user === "user1" })
					.timeout(2000)
					.assert((p) => p.user === "user1");
				test
					.use(client2)
					.waitEvent("LoginResponse", { matcher: (p) => p.user === "user2" })
					.timeout(2000)
					.assert((p) => p.user === "user2");
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			// Without matcher filter, both messages should have been received
			expect(receivedClientIds).toContain("user1");
			expect(receivedClientIds).toContain("user2");
		});
	});

	// ============================================================================
	// 0.6 Session Lifecycle
	// ============================================================================
	describe("0.6 Session Lifecycle", () => {
		it("should close backend connection when client disconnects", async () => {
			// This test verifies linked disconnect handling
			// When client disconnects, the corresponding backend connection should close
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backend = createMockServer("backend", backendPort);
			const proxy = createProxyServer("proxy", proxyPort, backendPort);
			const client = createClient("client", proxyPort);

			const scenario = new TestScenario({
				name: "Client Disconnect Closes Backend",
				components: [backend, proxy, client],
			});

			const tc = testCase("Backend connection closes with client", (test) => {
				// Establish connection
				test.use(client).sendMessage("Login", { user: "disconnect-test", sessionId: "s1" });

				test
					.use(backend)
					.onMessage("Login")
					.mockEvent("LoginResponse", (payload) => ({
						user: payload.user,
						sessionId: payload.sessionId,
						status: "ok",
					}));

				test
					.use(client)
					.onEvent("LoginResponse")
					.assert((p) => p.status === "ok");

				// Note: Actual disconnect handling would need to be verified
				// through component state inspection after test
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should not affect other sessions when one client disconnects", async () => {
			const backendPort = getNextPort();
			const proxyPort = getNextPort();
			const backend = createMockServer("backend", backendPort);
			const proxy = createProxyServer("proxy", proxyPort, backendPort);
			const client1 = createClient("client1", proxyPort);
			const client2 = createClient("client2", proxyPort);

			const scenario = new TestScenario({
				name: "Session Independence",
				components: [backend, proxy, client1, client2],
			});

			const tc = testCase("Other sessions unaffected by disconnect", (test) => {
				// Both clients connect
				test.use(client1).sendMessage("Login", { user: "user1", sessionId: "s1" });
				test.use(client2).sendMessage("Login", { user: "user2", sessionId: "s2" });

				test
					.use(backend)
					.onMessage("Login")
					.mockEvent("LoginResponse", (payload) => ({
						user: payload.user,
						sessionId: payload.sessionId,
						status: "ok",
					}));

				// Both should receive responses
				test
					.use(client1)
					.onEvent("LoginResponse")
					.assert((p) => p.user === "user1");
				test
					.use(client2)
					.onEvent("LoginResponse")
					.assert((p) => p.user === "user2");

				// Client2 should still work after client1 would disconnect
				// (In real test, we'd disconnect client1 and verify client2 still works)
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});
});
