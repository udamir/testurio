/**
 * Connection Linking Integration Tests
 *
 * Tests the link-based connection tracking for AsyncServer.
 * Per SERVER_CONNECTION_HOOK_DESIGN.md, connections are identified by
 * test-defined string identifiers (linkIds), not opaque connectionIds.
 *
 * Key features tested:
 * - onConnection("id") - order-based linking
 * - onMessage(...).link("id") - auth-based linking
 * - onMessage({ linkId }) - linkId-based filtering
 * - sendEvent(linkId, ...) - targeted sending
 * - disconnect(linkId) - connection disconnection
 * - onDisconnect(linkId, handler) - disconnect callbacks
 */

import { TcpProtocol } from "@testurio/protocol-tcp";
import { AsyncClient, AsyncServer, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";

// ============================================================================
// Message Type Definitions
// ============================================================================

interface PingRequest {
	seq: number;
	clientName?: string;
}

interface PongResponse {
	seq: number;
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

interface LoginRequest {
	username: string;
}

interface LoginResponse {
	username: string;
	status: string;
}

interface NotificationEvent {
	message: string;
}

// Service definition for type-safe TCP messaging
interface ConnectionTestService {
	clientMessages: {
		Ping: PingRequest;
		Data: DataRequest;
		Login: LoginRequest;
	};
	serverMessages: {
		Pong: PongResponse;
		DataResponse: DataResponse;
		LoginResponse: LoginResponse;
		Notification: NotificationEvent;
	};
}

// Port counter for this test file (16xxx range)
let portCounter = 16000;
function getNextPort(): number {
	return portCounter++;
}

// Helper functions for creating TCP components
const createMockServer = (name: string, port: number) =>
	new AsyncServer(name, {
		protocol: new TcpProtocol<ConnectionTestService>(),
		listenAddress: { host: "localhost", port },
	});

const createClient = (name: string, port: number) =>
	new AsyncClient(name, {
		protocol: new TcpProtocol<ConnectionTestService>(),
		targetAddress: { host: "localhost", port },
	});

describe("Connection Linking", () => {
	// ============================================================================
	// Order-Based Linking Tests
	// ============================================================================
	describe("Order-Based Linking", () => {
		it("should link first connection via onConnection()", async () => {
			const port = getNextPort();
			const server = createMockServer("server", port);
			const client = createClient("client", port);

			const scenario = new TestScenario({
				name: "Order-Based Link Test",
				components: [server, client],
			});

			// Link first connection in init phase
			scenario.init((test) => {
				test.use(server).onConnection("client1");
			});

			const tc = testCase("Link first connection", (test) => {
				const cli = test.use(client);
				const srv = test.use(server);

				// Client sends a message
				cli.sendMessage("Ping", { seq: 1 });

				// Server responds - no linkId filter means handle any connection
				srv.onMessage("Ping").mockEvent("Pong", (p) => ({ seq: p.seq }));

				// Wait for response
				cli
					.waitEvent("Pong")
					.timeout(2000)
					.assert((p) => p.seq === 1);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should link multiple connections in order", async () => {
			const port = getNextPort();
			const server = createMockServer("server", port);
			const client1 = createClient("client1", port);
			const client2 = createClient("client2", port);

			const scenario = new TestScenario({
				name: "Multiple Links Test",
				components: [server, client1, client2],
			});

			// Link connections in order during init
			scenario.init((test) => {
				const srv = test.use(server);
				srv.onConnection("conn1"); // First connection
				srv.onConnection("conn2"); // Second connection
			});

			const tc = testCase("Link multiple connections", (test) => {
				const srv = test.use(server);
				const c1 = test.use(client1);
				const c2 = test.use(client2);

				// Both clients send messages
				c1.sendMessage("Ping", { seq: 1 });
				c2.sendMessage("Ping", { seq: 2 });

				// Server responds to all
				srv.onMessage("Ping").mockEvent("Pong", (p) => ({ seq: p.seq }));

				// Wait for responses
				c1.waitEvent("Pong", { matcher: (p) => p.seq === 1 }).timeout(2000);
				c2.waitEvent("Pong", { matcher: (p) => p.seq === 2 }).timeout(2000);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	// ============================================================================
	// Auth-Based Linking Tests
	// ============================================================================
	describe("Auth-Based Linking", () => {
		it("should link connection via onMessage().link()", async () => {
			const port = getNextPort();
			const server = createMockServer("server", port);
			const client = createClient("client", port);

			const scenario = new TestScenario({
				name: "Auth-Based Link Test",
				components: [server, client],
			});

			// Link based on login message
			scenario.init((test) => {
				test
					.use(server)
					.onMessage("Login", { matcher: (p) => p.username === "alice" })
					.link("alice")
					.mockEvent("LoginResponse", (p) => ({
						username: p.username,
						status: "ok",
					}));
			});

			const tc = testCase("Link via auth message", (test) => {
				const cli = test.use(client);
				const srv = test.use(server);

				// Client logs in as alice
				cli.sendMessage("Login", { username: "alice" });
				cli
					.waitEvent("LoginResponse")
					.timeout(2000)
					.assert((p) => p.status === "ok");

				// After login, filter messages by linkId
				srv.onMessage("Data", { linkId: "alice" }).mockEvent("DataResponse", (p) => ({
					clientId: p.clientId,
					data: p.data,
					processed: true,
				}));

				cli.sendMessage("Data", { clientId: "alice", data: "test-data" });
				cli
					.waitEvent("DataResponse")
					.timeout(2000)
					.assert((p) => p.processed === true);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should support multiple auth-based links", async () => {
			const port = getNextPort();
			const server = createMockServer("server", port);
			const client1 = createClient("client1", port);
			const client2 = createClient("client2", port);

			const scenario = new TestScenario({
				name: "Multiple Auth Links Test",
				components: [server, client1, client2],
			});

			// Link connections based on login usernames
			scenario.init((test) => {
				const srv = test.use(server);

				srv
					.onMessage("Login", { matcher: (p) => p.username === "alice" })
					.link("alice")
					.mockEvent("LoginResponse", () => ({ username: "alice", status: "ok" }));

				srv
					.onMessage("Login", { matcher: (p) => p.username === "bob" })
					.link("bob")
					.mockEvent("LoginResponse", () => ({ username: "bob", status: "ok" }));
			});

			const tc = testCase("Multiple auth links", (test) => {
				const srv = test.use(server);
				const c1 = test.use(client1);
				const c2 = test.use(client2);

				// Both clients login
				c1.sendMessage("Login", { username: "alice" });
				c2.sendMessage("Login", { username: "bob" });

				c1.waitEvent("LoginResponse", { matcher: (p) => p.username === "alice" }).timeout(2000);
				c2.waitEvent("LoginResponse", { matcher: (p) => p.username === "bob" }).timeout(2000);

				// Handler only for alice's messages
				srv.onMessage("Data", { linkId: "alice" }).mockEvent("DataResponse", (p) => ({
					clientId: "alice",
					data: p.data,
					processed: true,
				}));

				// Handler only for bob's messages
				srv.onMessage("Data", { linkId: "bob" }).mockEvent("DataResponse", (p) => ({
					clientId: "bob",
					data: p.data,
					processed: true,
				}));

				// Both send data
				c1.sendMessage("Data", { clientId: "alice", data: "alice-data" });
				c2.sendMessage("Data", { clientId: "bob", data: "bob-data" });

				// Both receive responses
				c1.waitEvent("DataResponse", { matcher: (p) => p.clientId === "alice" }).timeout(2000);
				c2.waitEvent("DataResponse", { matcher: (p) => p.clientId === "bob" }).timeout(2000);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	// ============================================================================
	// LinkId Filtering Tests
	// ============================================================================
	describe("LinkId Filtering", () => {
		it("should filter messages by linkId", async () => {
			const port = getNextPort();
			const server = createMockServer("server", port);
			const client1 = createClient("client1", port);
			const client2 = createClient("client2", port);

			const scenario = new TestScenario({
				name: "LinkId Filter Test",
				components: [server, client1, client2],
			});

			let aliceHandlerCalled = false;
			let bobHandlerCalled = false;

			// Link connections by order in init
			scenario.init((test) => {
				const srv = test.use(server);
				srv.onConnection("alice");
				srv.onConnection("bob");
			});

			const tc = testCase("Filter by linkId", (test) => {
				const srv = test.use(server);
				const c1 = test.use(client1);
				const c2 = test.use(client2);

				// Handler only for alice (first connection)
				srv.onMessage("Data", { linkId: "alice" }).mockEvent("DataResponse", (p) => {
					aliceHandlerCalled = true;
					return { clientId: "alice", data: p.data, processed: true };
				});

				// Handler only for bob (second connection)
				srv.onMessage("Data", { linkId: "bob" }).mockEvent("DataResponse", (p) => {
					bobHandlerCalled = true;
					return { clientId: "bob", data: p.data, processed: true };
				});

				// Both clients send data
				c1.sendMessage("Data", { clientId: "c1", data: "from-alice" });
				c2.sendMessage("Data", { clientId: "c2", data: "from-bob" });

				// Both receive responses
				c1.waitEvent("DataResponse", { matcher: (p) => p.clientId === "alice" }).timeout(2000);
				c2.waitEvent("DataResponse", { matcher: (p) => p.clientId === "bob" }).timeout(2000);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(aliceHandlerCalled).toBe(true);
			expect(bobHandlerCalled).toBe(true);
		});
	});

	// ============================================================================
	// SendEvent Tests
	// ============================================================================
	describe("SendEvent with LinkId", () => {
		it("should send event to specific linked connection", async () => {
			const port = getNextPort();
			const server = createMockServer("server", port);
			const client1 = createClient("client1", port);
			const client2 = createClient("client2", port);

			const scenario = new TestScenario({
				name: "SendEvent LinkId Test",
				components: [server, client1, client2],
			});

			// Link connections in init
			scenario.init((test) => {
				const srv = test.use(server);
				srv.onConnection("alice");
				srv.onConnection("bob");
			});

			const tc = testCase("Send to specific link", (test) => {
				const srv = test.use(server);
				const c1 = test.use(client1);
				const c2 = test.use(client2);

				// Ping handler to verify connections are working
				srv.onMessage("Ping").mockEvent("Pong", (p) => ({ seq: p.seq }));

				c1.sendMessage("Ping", { seq: 1 });
				c2.sendMessage("Ping", { seq: 2 });

				c1.waitEvent("Pong", { matcher: (p) => p.seq === 1 }).timeout(2000);
				c2.waitEvent("Pong", { matcher: (p) => p.seq === 2 }).timeout(2000);

				// Send notification only to alice
				srv.sendEvent("alice", "Notification", { message: "hello alice" });

				// Alice receives it
				c1.waitEvent("Notification")
					.timeout(2000)
					.assert((p) => p.message === "hello alice");

				// Bob should NOT receive it (we don't wait for it)
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	// ============================================================================
	// Disconnect Tests
	// ============================================================================
	describe("Disconnect", () => {
		it("should disconnect specific linked connection", async () => {
			const port = getNextPort();
			const server = createMockServer("server", port);
			const client1 = createClient("client1", port);
			const client2 = createClient("client2", port);

			const scenario = new TestScenario({
				name: "Disconnect Test",
				components: [server, client1, client2],
			});

			// Link connections in init
			scenario.init((test) => {
				const srv = test.use(server);
				srv.onConnection("alice");
				srv.onConnection("bob");
			});

			const tc = testCase("Disconnect specific connection", (test) => {
				const srv = test.use(server);
				const c1 = test.use(client1);
				const c2 = test.use(client2);

				// Ping handler
				srv.onMessage("Ping").mockEvent("Pong", (p) => ({ seq: p.seq }));

				c1.sendMessage("Ping", { seq: 1 });
				c2.sendMessage("Ping", { seq: 2 });

				c1.waitEvent("Pong", { matcher: (p) => p.seq === 1 }).timeout(2000);
				c2.waitEvent("Pong", { matcher: (p) => p.seq === 2 }).timeout(2000);

				// Disconnect alice
				srv.disconnect("alice");

				// Bob's connection should still work
				c2.sendMessage("Ping", { seq: 3 });
				c2.waitEvent("Pong", { matcher: (p) => p.seq === 3 }).timeout(2000);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	// ============================================================================
	// onDisconnect Callback Tests
	// ============================================================================
	describe("onDisconnect Callback", () => {
		it("should call onDisconnect handler when linked connection closes", async () => {
			const port = getNextPort();
			const server = createMockServer("server", port);
			const client = createClient("client", port);

			const scenario = new TestScenario({
				name: "onDisconnect Callback Test",
				components: [server, client],
			});

			// Use a promise to properly wait for async disconnect callback
			let disconnectResolve: () => void;
			const disconnectPromise = new Promise<void>((resolve) => {
				disconnectResolve = resolve;
			});

			// Link connection and register disconnect handler
			scenario.init((test) => {
				const srv = test.use(server);
				srv.onConnection("client1");
				srv.onDisconnect("client1", () => {
					disconnectResolve();
				});
			});

			const tc = testCase("Disconnect callback fires", (test) => {
				const srv = test.use(server);
				const cli = test.use(client);

				srv.onMessage("Ping").mockEvent("Pong", (p) => ({ seq: p.seq }));

				cli.sendMessage("Ping", { seq: 1 });
				cli.waitEvent("Pong").timeout(2000);

				// Disconnect the client
				srv.disconnect("client1");
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);

			// Wait for disconnect callback with timeout
			await Promise.race([
				disconnectPromise,
				new Promise<void>((_, reject) =>
					setTimeout(() => reject(new Error("Disconnect callback not called within 1000ms")), 1000)
				),
			]);
		});
	});

	// ============================================================================
	// Connection Context Tests
	// ============================================================================
	describe("Connection Context", () => {
		it("should link connection with matcher on protocol context", async () => {
			const port = getNextPort();
			const server = createMockServer("server", port);
			const client = createClient("client", port);

			const scenario = new TestScenario({
				name: "Connection Matcher Test",
				components: [server, client],
			});

			// Link with matcher on protocol context (TCP context has remoteAddress)
			scenario.init((test) => {
				test.use(server).onConnection("client1", {
					matcher: (ctx) => {
						// TCP protocol context includes remoteAddress
						const tcpCtx = ctx as { remoteAddress?: string };
						return tcpCtx.remoteAddress !== undefined;
					},
				});
			});

			const tc = testCase("Link with matcher", (test) => {
				const srv = test.use(server);
				const cli = test.use(client);

				srv.onMessage("Ping").mockEvent("Pong", (p) => ({ seq: p.seq }));

				cli.sendMessage("Ping", { seq: 1 });
				cli.waitEvent("Pong").timeout(2000);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});
});
