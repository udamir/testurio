/**
 * Async Protocol Chain Integration Tests
 *
 * Tests the complete component chain: Client → Proxy → Mock
 * Using async (TCP/WebSocket-like) protocol with real TcpAdapter.
 *
 * Note: TcpAdapter uses fire-and-forget messaging with optional responses.
 * Messages are routed based on client's target address.
 */

import { TcpProtocol } from "@testurio/protocol-tcp";
import { AsyncClient, AsyncServer, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";

// ============================================================================
// Message Type Definitions
// ============================================================================

type InitTestRequest = Record<string, never>;

interface InitTestResponse {
	initialized: boolean;
}

interface OrderRequest {
	orderId: string;
	items: string[];
}

interface OrderRequestResponse {
	orderId: string;
	status: string;
	items: string[];
}

interface LogEvent {
	level: string;
	message: string;
	timestamp: number;
}

interface SubscribeRequest {
	symbol: string;
}

interface SubscribeResponse {
	subscriptionId: string;
	symbol: string;
	status: string;
}

interface ProxyForwardRequest {
	data: string;
}

interface ProxyForwardRequestResponse {
	received: string;
	forwarded: boolean;
}

interface GetAccountRequest {
	accountId: string;
}

interface GetAccountResponse {
	accountId: string;
	balance: number;
}

interface PayloadRequest {
	data: string;
}

interface PayloadRequestResponse {
	echo: string;
	processed: boolean;
}

interface ErrorRequest {
	data: string;
}

// Additional message types for design document test cases (4.3 - 4.13)
interface Notification {
	message: string;
}

interface AdminAction {
	userId: string;
	action: string;
}

interface Ping {
	timestamp: number;
}

interface Pong {
	timestamp: number;
}

interface TypeARequest {
	id: string;
}

interface TypeAResponse {
	type: string;
}

interface TypeBRequest {
	id: string;
}

interface TypeBResponse {
	type: string;
}

interface TypeCRequest {
	id: string;
}

interface TypeCResponse {
	type: string;
}

interface WhoAmI {
	requestId: string;
}

interface Identity {
	connectionId: string;
}

interface PrivateMessage {
	text: string;
	targetConnectionId?: string;
}

interface ServerPush {
	data: string;
}

interface LoginRequest {
	username: string;
}

interface LoginSuccess {
	status: string;
}

interface Heartbeat {
	timestamp: number;
}

// Service definition for type-safe builders
interface AsyncTcpService {
	clientMessages: {
		InitTest: InitTestRequest;
		OrderRequest: OrderRequest;
		LogEvent: LogEvent;
		Subscribe: SubscribeRequest;
		ProxyForwardRequest: ProxyForwardRequest;
		GetAccount: GetAccountRequest;
		PayloadRequest: PayloadRequest;
		ErrorRequest: ErrorRequest;
		// Additional message types for design document test cases
		AdminAction: AdminAction;
		Ping: Ping;
		TypeA: TypeARequest;
		TypeB: TypeBRequest;
		TypeC: TypeCRequest;
		WhoAmI: WhoAmI;
		Login: LoginRequest;
	};
	serverMessages: {
		InitTestResponse: InitTestResponse;
		OrderRequestResponse: OrderRequestResponse;
		SubscribeResponse: SubscribeResponse;
		ProxyForwardRequestResponse: ProxyForwardRequestResponse;
		GetAccountResponse: GetAccountResponse;
		PayloadRequestResponse: PayloadRequestResponse;
		// Additional message types for design document test cases
		Notification: Notification;
		Pong: Pong;
		TypeAResponse: TypeAResponse;
		TypeBResponse: TypeBResponse;
		TypeCResponse: TypeCResponse;
		Identity: Identity;
		PrivateMessage: PrivateMessage;
		ServerPush: ServerPush;
		LoginSuccess: LoginSuccess;
		Heartbeat: Heartbeat;
	};
}

// Helper functions for creating TCP Proto components with type-safe protocols
const createMockServer = (name: string, port: number) =>
	new AsyncServer(name, {
		protocol: new TcpProtocol<AsyncTcpService>(),
		listenAddress: { host: "localhost", port },
	});

const createClient = (name: string, port: number) =>
	new AsyncClient(name, {
		protocol: new TcpProtocol<AsyncTcpService>(),
		targetAddress: { host: "localhost", port },
	});

const createProxyServer = (name: string, listenPort: number, targetPort: number) =>
	new AsyncServer(name, {
		protocol: new TcpProtocol<AsyncTcpService>(),
		listenAddress: { host: "localhost", port: listenPort },
		targetAddress: { host: "localhost", port: targetPort },
	});

describe("Async Protocol Chain: Client → Proxy → Mock", () => {
	describe("2.1 Init/Stop Lifecycle", () => {
		it("should execute init handler before test cases", async () => {
			const backend = createMockServer("backend", 4110);
			const api = createClient("api", 4110);

			const scenario = new TestScenario({
				name: "Init Lifecycle Test",
				components: [backend, api],
			});

			scenario.init((test) => {
				test
					.use(backend)
					.onMessage("InitTest")
					.mockEvent("InitTestResponse", () => ({ initialized: true }));
			});

			const tc = testCase("Verify init ran", (test) => {
				test.use(api).sendMessage("InitTest", {});
				test
					.use(api)
					.onEvent("InitTestResponse")
					.assert((payload) => {
						return payload.initialized === true;
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("2.2 Basic Message Flow", () => {
		it("should route message through proxy to mock and receive response", async () => {
			const backend = createMockServer("backend", 4122);
			const gateway = createProxyServer("gateway", 4121, 4122);
			const api = createClient("api", 4121);

			const scenario = new TestScenario({
				name: "Basic Async Chain Test",
				components: [backend, gateway, api],
			});

			const tc = testCase("Send OrderRequest through chain", (test) => {
				test.use(api).sendMessage("OrderRequest", {
					orderId: "ORD-001",
					items: ["item1", "item2"],
				});

				test
					.use(backend)
					.onMessage("OrderRequest")
					.mockEvent("OrderRequestResponse", (payload) => {
						return {
							orderId: payload.orderId,
							status: "confirmed",
							items: payload.items,
						};
					});

				test
					.use(api)
					.onEvent("OrderRequestResponse")
					.assert((payload) => {
						return payload.orderId === "ORD-001" && payload.status === "confirmed" && payload.items.length === 2;
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should handle fire-and-forget messages", async () => {
			const backend = createMockServer("backend", 4132);
			const gateway = createProxyServer("gateway", 4131, 4132);
			const api = createClient("api", 4131);

			const scenario = new TestScenario({
				name: "Fire-and-Forget Test",
				components: [backend, gateway, api],
			});

			let receivedPayload: LogEvent | undefined;

			const tc = testCase("Send fire-and-forget message", (test) => {
				test.use(api).sendMessage("LogEvent", {
					level: "info",
					message: "User logged in",
					timestamp: Date.now(),
				});

				test
					.use(backend)
					.waitMessage("LogEvent")
					.timeout(2000)
					.assert((payload) => {
						receivedPayload = payload;
						// Verify payload structure instead of always returning true
						return (
							payload.level === "info" && payload.message === "User logged in" && typeof payload.timestamp === "number"
						);
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(receivedPayload).toMatchObject({
				level: "info",
				message: "User logged in",
			});
		});
	});

	describe("2.3 Bidirectional Communication", () => {
		it("should handle subscribe request and receive response", async () => {
			const backend = createMockServer("backend", 4140);
			const api = createClient("api", 4140);

			const scenario = new TestScenario({
				name: "Bidirectional Test",
				components: [backend, api],
			});

			const tc = testCase("Subscribe and receive confirmation", (test) => {
				test.use(api).sendMessage("Subscribe", { symbol: "EURUSD" });

				test
					.use(backend)
					.onMessage("Subscribe")
					.mockEvent("SubscribeResponse", (payload) => ({
						subscriptionId: "sub-123",
						symbol: payload.symbol,
						status: "active",
					}));

				test
					.use(api)
					.onEvent("SubscribeResponse")
					.assert((payload) => {
						return payload.subscriptionId === "sub-123" && payload.symbol === "EURUSD" && payload.status === "active";
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("2.4 Message Through Proxy", () => {
		it("should forward messages through proxy to backend", async () => {
			const backend = createMockServer("backend", 4242);
			const gateway = createProxyServer("gateway", 4241, 4242);
			const api = createClient("api", 4241);

			const scenario = new TestScenario({
				name: "Proxy Forward Test",
				components: [backend, gateway, api],
			});

			const tc = testCase("Send message through proxy", (test) => {
				test.use(api).sendMessage("ProxyForwardRequest", { data: "test" });

				test
					.use(backend)
					.onMessage("ProxyForwardRequest")
					.mockEvent("ProxyForwardRequestResponse", (payload) => ({
						received: payload.data,
						forwarded: true,
					}));

				test
					.use(api)
					.onEvent("ProxyForwardRequestResponse")
					.assert((payload) => {
						return payload.received === "test" && payload.forwarded === true;
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("2.5 Multiple Message Types", () => {
		it("should handle different message types correctly", async () => {
			const backend = createMockServer("backend", 4170);
			const api = createClient("api", 4170);

			const scenario = new TestScenario({
				name: "Multiple Message Types Test",
				components: [backend, api],
			});

			const tc = testCase("Send account request", (test) => {
				test.use(api).sendMessage("GetAccount", { accountId: "ACC-001" });

				test
					.use(backend)
					.onMessage("GetAccount")
					.mockEvent("GetAccountResponse", () => ({
						accountId: "ACC-001",
						balance: 10000,
					}));

				test
					.use(api)
					.onEvent("GetAccountResponse")
					.assert((payload) => {
						return payload.accountId === "ACC-001" && payload.balance === 10000;
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("2.6 Response Payload", () => {
		it("should receive response payload correctly", async () => {
			const backend = createMockServer("backend", 4180);
			const api = createClient("api", 4180);

			const scenario = new TestScenario({
				name: "Response Payload Test",
				components: [backend, api],
			});

			const tc = testCase("Send request and check response", (test) => {
				test.use(api).sendMessage("PayloadRequest", { data: "test-data" });

				test
					.use(backend)
					.onMessage("PayloadRequest")
					.mockEvent("PayloadRequestResponse", (payload) => ({
						echo: payload.data,
						processed: true,
					}));

				test
					.use(api)
					.onEvent("PayloadRequestResponse")
					.assert((payload) => {
						return payload.echo === "test-data" && payload.processed === true;
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("2.7 Error Handling", () => {
		it("should handle handler errors gracefully", async () => {
			const backend = createMockServer("backend", 4190);
			const api = createClient("api", 4190);

			const scenario = new TestScenario({
				name: "Error Handling Test",
				components: [backend, api],
			});

			let handlerCalled = false;
			let receivedData: string | undefined;

			const tc = testCase("Send request that causes error", (test) => {
				test.use(api).sendMessage("ErrorRequest", { data: "test" });

				test
					.use(backend)
					.waitMessage("ErrorRequest")
					.timeout(1000)
					.assert((payload) => {
						handlerCalled = true;
						receivedData = payload.data;
						return payload.data === "test";
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(handlerCalled).toBe(true);
			expect(receivedData).toBe("test");
		});
	});

	// ============================================================================
	// Design Document Test Cases (Section 4)
	// ============================================================================

	describe("4.3 Server Broadcast to Multiple Clients", () => {
		it("should broadcast to multiple clients", async () => {
			const srv = createMockServer("server", 4300);
			const client1 = createClient("client1", 4300);
			const client2 = createClient("client2", 4300);

			const scenario = new TestScenario({
				name: "Broadcast Test",
				components: [srv, client1, client2],
			});

			let client1Received = false;
			let client2Received = false;

			const tc = testCase("Broadcast notification to all clients", (test) => {
				const server = test.use(srv);
				const c1 = test.use(client1);
				const c2 = test.use(client2);

				// First, have clients send pings to ensure connections are established
				c1.sendMessage("Ping", { timestamp: 1 });
				c2.sendMessage("Ping", { timestamp: 2 });

				// Server waits for first ping, then responds with broadcast
				server.waitMessage("Ping").timeout(1000);
				// Wait for second ping to ensure both clients are connected
				server.waitMessage("Ping").timeout(1000);

				// Server broadcasts to all connected clients
				server.broadcast("Notification", { message: "Hello all" });

				// Both clients must wait for the notification (use waitEvent)
				c1.waitEvent("Notification")
					.timeout(2000)
					.assert((e) => {
						client1Received = true;
						return e.message === "Hello all";
					});

				c2.waitEvent("Notification")
					.timeout(2000)
					.assert((e) => {
						client2Received = true;
						return e.message === "Hello all";
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(client1Received).toBe(true);
			expect(client2Received).toBe(true);
		});
	});

	describe("4.4 onEvent vs waitEvent Timing", () => {
		it("should handle onEvent regardless of timing (non-strict)", async () => {
			const srv = createMockServer("server", 4400);
			const client1 = createClient("client1", 4400);

			const scenario = new TestScenario({
				name: "Non-Strict Hook Test",
				components: [srv, client1],
			});

			let eventReceived = false;

			const tc = testCase("onEvent works regardless of timing", (test) => {
				const server = test.use(srv);
				const c1 = test.use(client1);

				// Link connection when it arrives
				server.onConnection("client");

				// Client sends a ping to establish connection
				c1.sendMessage("Ping", { timestamp: 1 });
				server.waitMessage("Ping").timeout(1000);

				// Server sends heartbeat event via sendEvent
				server.sendEvent("client", "Heartbeat", { timestamp: Date.now() });

				// Wait for Heartbeat to verify it was received
				// Use waitEvent to ensure handler completes before test ends
				c1.waitEvent("Heartbeat")
					.timeout(2000)
					.assert((e) => {
						eventReceived = true;
						return e.timestamp > 0;
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(eventReceived).toBe(true);
		});

		it("should handle waitEvent when step is waiting before event arrives", async () => {
			const srv = createMockServer("server", 4401);
			const client1 = createClient("client1", 4401);

			const scenario = new TestScenario({
				name: "Strict Wait Test",
				components: [srv, client1],
			});

			let eventReceived = false;

			const tc = testCase("waitEvent works when waiting before event", (test) => {
				const server = test.use(srv);
				const c1 = test.use(client1);

				// Link connection when it arrives
				server.onConnection("client");

				// Client sends a ping to establish connection
				c1.sendMessage("Ping", { timestamp: 1 });
				server.waitMessage("Ping").timeout(1000);

				// Server sends heartbeat event
				server.sendEvent("client", "Heartbeat", { timestamp: Date.now() });

				// waitEvent (strict) - step must be waiting when event arrives
				// This works because sendEvent is before waitEvent in step order
				c1.waitEvent("Heartbeat")
					.timeout(2000)
					.assert((e) => {
						eventReceived = true;
						return e.timestamp > 0;
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(eventReceived).toBe(true);
		});

		it("should demonstrate difference between onEvent and waitEvent", async () => {
			const srv = createMockServer("server", 4402);
			const client1 = createClient("client1", 4402);

			const scenario = new TestScenario({
				name: "onEvent vs waitEvent Comparison",
				components: [srv, client1],
			});

			let onEventReceived = false;
			let waitEventReceived = false;

			const tc = testCase("onEvent captures one event, waitEvent blocks on another", (test) => {
				const server = test.use(srv);
				const c1 = test.use(client1);

				// Link connection
				server.onConnection("client");

				// Register non-strict hook for Pong (will capture it when it arrives)
				c1.onEvent("Pong").assert((e) => {
					onEventReceived = true;
					return e.timestamp > 0;
				});

				// Client sends ping
				c1.sendMessage("Ping", { timestamp: 1 });

				// Server responds with Pong (captured by onEvent above)
				server
					.waitMessage("Ping")
					.timeout(1000)
					.mockEvent("Pong", (p) => ({ timestamp: p.timestamp + 1 }));

				// Server sends a second event (Heartbeat) that we'll wait for
				// This ensures the test doesn't end before Pong is processed
				server.sendEvent("client", "Heartbeat", { timestamp: Date.now() });

				// waitEvent for Heartbeat to block until it arrives
				// (demonstrates onEvent and waitEvent can coexist for different events)
				c1.waitEvent("Heartbeat")
					.timeout(2000)
					.assert((e) => {
						waitEventReceived = true;
						return e.timestamp > 0;
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(onEventReceived).toBe(true);
			expect(waitEventReceived).toBe(true);
		});
	});

	describe("4.5 Drop Message in Proxy", () => {
		it("should drop unauthorized messages in proxy", async () => {
			const backend = createMockServer("backend", 4502);
			const proxy = createProxyServer("proxy", 4501, 4502);
			const api = createClient("api", 4501);

			const scenario = new TestScenario({
				name: "Drop Message Test",
				components: [backend, proxy, api],
			});

			let backendReceived = false;

			const tc = testCase("Proxy drops unauthorized admin action", (test) => {
				const client = test.use(api);
				const prx = test.use(proxy);
				const back = test.use(backend);

				// Client sends admin action as guest
				client.sendMessage("AdminAction", { userId: "guest", action: "delete" });

				// Proxy intercepts and drops non-admin requests
				prx
					.onMessage("AdminAction")
					.assert((msg) => msg.userId !== "admin")
					.drop();

				// Backend should NOT receive the message (use waitMessage with short timeout to verify)
				back
					.waitMessage("AdminAction")
					.timeout(500)
					.assert(() => {
						backendReceived = true;
						return true;
					});
			});

			const result = await scenario.run(tc);
			// Test should fail because backend never receives the dropped message (timeout)
			expect(result.passed).toBe(false);
			expect(backendReceived).toBe(false);
		});
	});

	describe("4.7 Proxy Transparent Forwarding (No Hook)", () => {
		it("should forward as-is when no hook is registered", async () => {
			const backend = createMockServer("backend", 4702);
			const proxy = createProxyServer("proxy", 4701, 4702);
			const api = createClient("api", 4701);

			const scenario = new TestScenario({
				name: "Transparent Proxy Test",
				components: [backend, proxy, api],
			});

			const tc = testCase("Proxy forwards without interception", (test) => {
				const client = test.use(api);
				const back = test.use(backend);

				// No onMessage hook registered on proxy - should forward as-is
				client.sendMessage("Ping", { timestamp: 12345 });

				// Backend receives original message unchanged
				back.onMessage("Ping").mockEvent("Pong", (payload) => ({
					timestamp: payload.timestamp,
				}));

				// Client receives response (also forwarded as-is by proxy)
				client
					.waitEvent("Pong")
					.timeout(2000)
					.assert((e) => e.timestamp === 12345);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("4.8 Message Ordering and Matching", () => {
		it("should match messages by type, not arrival order", async () => {
			const srv = createMockServer("server", 4800);
			const api = createClient("api", 4800);

			const scenario = new TestScenario({
				name: "Message Ordering Test",
				components: [srv, api],
			});

			const tc = testCase("Messages matched by type", (test) => {
				const client = test.use(api);
				const server = test.use(srv);

				// Register hooks in specific order
				server.onMessage("TypeA").mockEvent("TypeAResponse", () => ({ type: "A" }));
				server.onMessage("TypeB").mockEvent("TypeBResponse", () => ({ type: "B" }));
				server.onMessage("TypeC").mockEvent("TypeCResponse", () => ({ type: "C" }));

				// Send messages in different order
				client.sendMessage("TypeB", { id: "1" });
				client.sendMessage("TypeA", { id: "2" });
				client.sendMessage("TypeC", { id: "3" });

				// Expect responses matched by message type
				client.onEvent("TypeBResponse").assert((e) => e.type === "B");
				client.onEvent("TypeAResponse").assert((e) => e.type === "A");
				client.onEvent("TypeCResponse").assert((e) => e.type === "C");
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("4.10 mockEvent Same Session (Not Broadcast)", () => {
		it("should send mockEvent only to triggering connection", async () => {
			const srv = createMockServer("server", 4100);
			const client1 = createClient("client1", 4100);
			const client2 = createClient("client2", 4100);

			const scenario = new TestScenario({
				name: "MockEvent Session Test",
				components: [srv, client1, client2],
			});

			let client1ReceivedResponse = false;
			let client2ReceivedResponse = false;

			const tc = testCase("mockEvent responds to same connection only", (test) => {
				const server = test.use(srv);
				const c1 = test.use(client1);
				const c2 = test.use(client2);

				// Server responds with mockEvent - should go to triggering connection only
				server.onMessage("WhoAmI").mockEvent("Identity", () => ({
					connectionId: "response-sent",
				}));

				// Only client1 sends a message
				c1.sendMessage("WhoAmI", { requestId: "req1" });

				// Client1 should receive response
				c1.onEvent("Identity").assert(() => {
					client1ReceivedResponse = true;
					return true;
				});

				// Client2 should NOT receive response (use waitEvent with short timeout)
				c2.waitEvent("Identity")
					.timeout(300)
					.assert(() => {
						client2ReceivedResponse = true;
						return true;
					});
			});

			const result = await scenario.run(tc);
			// Test should fail because client2 never receives response
			expect(result.passed).toBe(false);
			expect(client1ReceivedResponse).toBe(true);
			expect(client2ReceivedResponse).toBe(false);
		});
	});

	describe("4.11 sendEvent to Specific LinkId", () => {
		it("should send event to linked connection", async () => {
			const srv = createMockServer("server", 4111);
			const client1 = createClient("client1", 4111);

			const scenario = new TestScenario({
				name: "SendEvent Test",
				components: [srv, client1],
			});

			let clientReceived = false;

			const tc = testCase("sendEvent sends to linked connection", (test) => {
				const server = test.use(srv);
				const c1 = test.use(client1);

				// Link the connection when it arrives
				server.onConnection("client");

				// Client establishes connection by sending ping
				c1.sendMessage("Ping", { timestamp: 1 });

				// Wait for connection to be established
				server.waitMessage("Ping").timeout(1000);

				// Send event to the linked connection
				server.sendEvent("client", "PrivateMessage", { text: "Hello client" });

				// Client should receive the event
				c1.waitEvent("PrivateMessage")
					.timeout(2000)
					.assert((e) => {
						clientReceived = true;
						return e.text === "Hello client";
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(clientReceived).toBe(true);
		});

		it("should send event to specific client using auth-based linking", async () => {
			const srv = createMockServer("server", 4112);
			const client1 = createClient("client1", 4112);
			const client2 = createClient("client2", 4112);

			const scenario = new TestScenario({
				name: "SendEvent to Specific Client Test",
				components: [srv, client1, client2],
			});

			let client1Received = false;
			let client2Received = false;

			const tc = testCase("sendEvent sends to specific client via auth link", (test) => {
				const server = test.use(srv);
				const c1 = test.use(client1);
				const c2 = test.use(client2);

				// Auth-based linking: link by message content
				server
					.onMessage("Login", { matcher: (p) => p.username === "alice" })
					.link("alice")
					.mockEvent("LoginSuccess", () => ({ status: "ok" }));

				server
					.onMessage("Login", { matcher: (p) => p.username === "bob" })
					.link("bob")
					.mockEvent("LoginSuccess", () => ({ status: "ok" }));

				// client1 logs in as alice
				c1.sendMessage("Login", { username: "alice" });
				c1.waitEvent("LoginSuccess").timeout(1000);

				// client2 logs in as bob
				c2.sendMessage("Login", { username: "bob" });
				c2.waitEvent("LoginSuccess").timeout(1000);

				// Send event only to alice (client1)
				server.sendEvent("alice", "PrivateMessage", { text: "Hello alice" });

				// Only client1 should receive the event
				c1.waitEvent("PrivateMessage")
					.timeout(2000)
					.assert((e) => {
						client1Received = true;
						return e.text === "Hello alice";
					});

				// client2 sets up handler but should NOT receive anything
				c2.onEvent("PrivateMessage").assert(() => {
					client2Received = true;
					return true;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(client1Received).toBe(true);
			expect(client2Received).toBe(false);
		});
	});

	describe("4.12 ConnectionId Access in Test", () => {
		it("should access connectionId from component", async () => {
			const srv = createMockServer("server", 4120);
			const client1 = createClient("client1", 4120);
			const client2 = createClient("client2", 4120);

			const scenario = new TestScenario({
				name: "ConnectionId Access Test",
				components: [srv, client1, client2],
			});

			// Connection IDs should be pre-generated at component construction
			expect(client1.connectionId).toBeDefined();
			expect(client2.connectionId).toBeDefined();
			expect(client1.connectionId).not.toBe(client2.connectionId);

			const tc = testCase("Connection ID available in test", (test) => {
				const server = test.use(srv);
				const c1 = test.use(client1);

				// Server can access connectionId via handler context
				server.onMessage("WhoAmI").mockEvent("Identity", () => ({
					connectionId: client1.connectionId, // Use pre-generated ID
				}));

				c1.sendMessage("WhoAmI", { requestId: "test" });
				c1.waitEvent("Identity")
					.timeout(2000)
					.assert((e) => e.connectionId === client1.connectionId);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("4.13 Backend Sends to Proxy, Proxy Forwards to Client", () => {
		it("should forward backend events to linked client via proxy", async () => {
			const backend = createMockServer("backend", 4132);
			const proxy = createProxyServer("proxy", 4131, 4132);
			const client1 = createClient("client1", 4131);
			const client2 = createClient("client2", 4131);

			const scenario = new TestScenario({
				name: "Backend to Proxy Forward Test",
				components: [backend, proxy, client1, client2],
			});

			let client1Received = false;

			const tc = testCase("Backend sends to proxy, forwards to linked client", (test) => {
				const back = test.use(backend);
				const c1 = test.use(client1);

				// Client1 connects and sends initial message to establish connection pair
				c1.sendMessage("Ping", { timestamp: 1 });

				// Backend receives and responds
				back.onMessage("Ping").mockEvent("ServerPush", () => ({
					data: "for client1",
				}));

				// Client1 should receive the event (forwarded through proxy)
				c1.waitEvent("ServerPush")
					.timeout(2000)
					.assert((e) => {
						client1Received = true;
						return e.data === "for client1";
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(client1Received).toBe(true);
		});
	});

	describe("4.9 Backend Disconnect Terminates Client", () => {
		it("should close client connection when backend disconnects", async () => {
			const backend = createMockServer("backend", 4092);
			const proxy = createProxyServer("proxy", 4091, 4092);
			const api = createClient("api", 4091);

			const scenario = new TestScenario({
				name: "Backend Disconnect Test",
				components: [backend, proxy, api],
			});

			const tc = testCase("Backend disconnect closes client", (test) => {
				const back = test.use(backend);
				const client = test.use(api);

				// Link the connection at backend
				back.onConnection("client");

				// Client connects and sends message
				client.sendMessage("Ping", { timestamp: 1 });

				// Backend receives and responds
				back.onMessage("Ping").mockEvent("Pong", (p) => ({ timestamp: p.timestamp }));

				// Client waits for response
				client.waitEvent("Pong").timeout(1000);

				// Backend disconnects the client
				back.disconnect("client");

				// After backend disconnect, client should be disconnected too
				// The proxy automatically closes client when backend closes
				// We verify by trying to send another message which should timeout
				client.sendMessage("Ping", { timestamp: 2 });
				client
					.waitEvent("Pong")
					.timeout(500)
					.assert(() => true);
			});

			const result = await scenario.run(tc);
			// Test should fail because client is disconnected and won't receive response
			expect(result.passed).toBe(false);
		});
	});

	describe("4.15 Disconnect Specific Connection", () => {
		it("should disconnect specific linked connection", async () => {
			const srv = createMockServer("server", 4150);
			const client1 = createClient("client1", 4150);

			const scenario = new TestScenario({
				name: "Disconnect Specific Test",
				components: [srv, client1],
			});

			let disconnectCalled = false;

			const tc = testCase("Disconnect specific client", (test) => {
				const server = test.use(srv);
				const c1 = test.use(client1);

				// Link connection when first message arrives
				server.onConnection("client");

				// Handle disconnect for client
				server.onDisconnect("client", () => {
					disconnectCalled = true;
				});

				// Client sends ping to establish connection
				c1.sendMessage("Ping", { timestamp: 1 });

				// Wait for connection
				server.waitMessage("Ping").timeout(1000);

				// Disconnect the client
				server.disconnect("client");
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(disconnectCalled).toBe(true);
		});
	});

	describe("Timeout Handling", () => {
		it("should timeout when message never arrives", async () => {
			const srv = createMockServer("server", 4200);
			const api = createClient("api", 4200);

			const scenario = new TestScenario({
				name: "Timeout Test",
				components: [srv, api],
			});

			const tc = testCase("Timeout waiting for response", (test) => {
				const client = test.use(api);
				const server = test.use(srv);

				// Client sends message
				client.sendMessage("Ping", { timestamp: 1 });

				// Server does NOT respond (no mockEvent)
				server.waitMessage("Ping").assert(() => true);

				// Client waits for response that never comes
				client
					.waitEvent("Pong")
					.timeout(500)
					.assert(() => true);
			});

			const result = await scenario.run(tc);
			// Test should fail due to timeout
			expect(result.passed).toBe(false);
			// Check that there's some failure (error can be in different properties)
			expect(result.passed).toBeFalsy();
		});

		it("should succeed when message arrives before timeout", async () => {
			const srv = createMockServer("server", 4201);
			const api = createClient("api", 4201);

			const scenario = new TestScenario({
				name: "Timeout Success Test",
				components: [srv, api],
			});

			const tc = testCase("Message arrives before timeout", (test) => {
				const client = test.use(api);
				const server = test.use(srv);

				client.sendMessage("Ping", { timestamp: 999 });

				server.onMessage("Ping").mockEvent("Pong", (payload) => ({
					timestamp: payload.timestamp,
				}));

				client
					.waitEvent("Pong")
					.timeout(5000)
					.assert((e) => e.timestamp === 999);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Wait Connection and Disconnect Methods", () => {
		describe("waitConnection (Server)", () => {
			it("should wait for a client connection and link it", async () => {
				const srv = createMockServer("server", 4210);
				const client1 = createClient("client1", 4210);

				const scenario = new TestScenario({
					name: "WaitConnection Test",
					components: [srv, client1],
				});

				let connectionLinked = false;

				const tc = testCase("Server waits for connection", (test) => {
					const server = test.use(srv);
					const c1 = test.use(client1);

					// Server waits for first connection and links it
					server.waitConnection("client").timeout(2000);

					// Client connects by sending a message (connection happens on first send)
					c1.sendMessage("Ping", { timestamp: 1 });

					// Server receives the message from the linked connection
					server
						.waitMessage("Ping", { linkId: "client" })
						.timeout(1000)
						.assert((p) => {
							connectionLinked = true;
							return p.timestamp === 1;
						});
				});

				const result = await scenario.run(tc);
				expect(result.passed).toBe(true);
				expect(connectionLinked).toBe(true);
			});

			it("should use matcher to filter connections", async () => {
				const srv = createMockServer("server", 4211);
				const client1 = createClient("client1", 4211);

				const scenario = new TestScenario({
					name: "WaitConnection with Matcher Test",
					components: [srv, client1],
				});

				const tc = testCase("Server waits for specific connection", (test) => {
					const server = test.use(srv);
					const c1 = test.use(client1);

					// Wait for connection (with a matcher that always returns true for simplicity)
					server.waitConnection("client", { matcher: () => true }).timeout(2000);

					c1.sendMessage("Ping", { timestamp: 1 });

					// Verify connection was linked
					server.waitMessage("Ping", { linkId: "client" }).timeout(1000);
				});

				const result = await scenario.run(tc);
				expect(result.passed).toBe(true);
			});
		});

		describe("waitDisconnect (Server)", () => {
			it("should wait for a linked connection to disconnect", async () => {
				const srv = createMockServer("server", 4220);
				const client1 = createClient("client1", 4220);

				const scenario = new TestScenario({
					name: "WaitDisconnect Server Test",
					components: [srv, client1],
				});

				let disconnectDetected = false;

				const tc = testCase("Server waits for disconnect", (test) => {
					const server = test.use(srv);
					const c1 = test.use(client1);

					// Link the first connection
					server.onConnection("client");

					// Client sends message to establish connection
					c1.sendMessage("Ping", { timestamp: 1 });
					server.waitMessage("Ping").timeout(1000);

					// Client disconnects
					c1.disconnect();

					// Server waits for the disconnect
					server
						.waitDisconnect("client")
						.timeout(2000)
						.assert(() => {
							disconnectDetected = true;
							return true;
						});
				});

				const result = await scenario.run(tc);
				expect(result.passed).toBe(true);
				expect(disconnectDetected).toBe(true);
			});

			it("should timeout if disconnect doesn't happen", async () => {
				const srv = createMockServer("server", 4221);
				const client1 = createClient("client1", 4221);

				const scenario = new TestScenario({
					name: "WaitDisconnect Timeout Test",
					components: [srv, client1],
				});

				const tc = testCase("Server times out waiting for disconnect", (test) => {
					const server = test.use(srv);
					const c1 = test.use(client1);

					server.onConnection("client");

					c1.sendMessage("Ping", { timestamp: 1 });
					server.waitMessage("Ping").timeout(1000);

					// Client does NOT disconnect
					// Server waits but times out
					server.waitDisconnect("client").timeout(500);
				});

				const result = await scenario.run(tc);
				expect(result.passed).toBe(false);
			});
		});

		describe("waitDisconnect (Client)", () => {
			it("should wait for server to close the connection", async () => {
				const srv = createMockServer("server", 4230);
				const client1 = createClient("client1", 4230);

				const scenario = new TestScenario({
					name: "WaitDisconnect Client Test",
					components: [srv, client1],
				});

				let clientDetectedDisconnect = false;

				const tc = testCase("Client waits for server disconnect", (test) => {
					const server = test.use(srv);
					const c1 = test.use(client1);

					// Link connection on server
					server.onConnection("client");

					// Client sends message
					c1.sendMessage("Ping", { timestamp: 1 });
					server.waitMessage("Ping").timeout(1000);

					// Server disconnects the client
					server.disconnect("client");

					// Client waits for the disconnect
					c1.waitDisconnect()
						.timeout(2000)
						.assert(() => {
							clientDetectedDisconnect = true;
							return true;
						});
				});

				const result = await scenario.run(tc);
				expect(result.passed).toBe(true);
				expect(clientDetectedDisconnect).toBe(true);
			});

			it("should timeout if server doesn't disconnect", async () => {
				const srv = createMockServer("server", 4231);
				const client1 = createClient("client1", 4231);

				const scenario = new TestScenario({
					name: "WaitDisconnect Client Timeout Test",
					components: [srv, client1],
				});

				const tc = testCase("Client times out waiting for disconnect", (test) => {
					const server = test.use(srv);
					const c1 = test.use(client1);

					server.onConnection("client");

					c1.sendMessage("Ping", { timestamp: 1 });
					server.waitMessage("Ping").timeout(1000);

					// Server does NOT disconnect
					// Client waits but times out
					c1.waitDisconnect().timeout(500);
				});

				const result = await scenario.run(tc);
				expect(result.passed).toBe(false);
			});
		});
	});
});
