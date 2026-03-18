import { WebSocketProtocol } from "@testurio/protocol-ws";
import { AsyncClient, AsyncServer, Client, HttpProtocol, Server, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";

// =============================================================================
// Service Definitions
// =============================================================================

interface HttpService {
	login: {
		request: { method: "POST"; path: "/login"; body: { user: string } };
		response: { code: 200; body: { token: string } };
	};
	getProfile: {
		request: { method: "GET"; path: "/profile"; headers?: Record<string, string> };
		response: { code: 200; body: { name: string; token: string } };
	};
}

interface WsMessages {
	clientMessages: {
		auth: { token: string };
		join: { room: string; sessionId: string };
	};
	serverMessages: {
		authResult: { success: boolean; sessionId: string };
		joined: { room: string; members: number };
	};
}

// =============================================================================
// Port Allocation: 16000-16099
// =============================================================================

let portCounter = 16000;
function getNextPort(): number {
	return portCounter++;
}

// =============================================================================
// HTTP Factory Params Tests
// =============================================================================

describe("Factory Step Parameters", () => {
	describe("HTTP: Multi-step flow with factory params", () => {
		it("should use factory to pass data from one step to the next", async () => {
			const port = getNextPort();

			const server = new Server("mock", {
				protocol: new HttpProtocol<HttpService>(),
				listenAddress: { host: "localhost", port },
			});

			const client = new Client("api", {
				protocol: new HttpProtocol<HttpService>(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "HTTP factory params",
				components: [server, client],
			});

			let token = "";

			const tc = testCase("login then use token in factory request", (test) => {
				const api = test.use(client);
				const mock = test.use(server);

				// Step 1: Login — static params
				api.request("login", { method: "POST", path: "/login", body: { user: "admin" } });

				mock.onRequest("login", { method: "POST", path: "/login" }).mockResponse(() => ({
					code: 200,
					body: { token: "tok-secret-123" },
				}));

				// Extract the token from login response
				api.onResponse("login").transform((res) => {
					token = res.body.token;
					return res;
				});

				// Step 2: Get profile — factory reads token at execution time
				api.request("getProfile", () => ({
					method: "GET" as const,
					path: "/profile",
					headers: { Authorization: `Bearer ${token}` },
				}));

				mock.onRequest("getProfile", { method: "GET", path: "/profile" }).mockResponse((req) => ({
					code: 200,
					body: { name: "admin", token: req.headers?.authorization ?? "" },
				}));

				api.onResponse("getProfile").assert((res) => {
					// Verify the factory-resolved token was actually sent in the request
					return res.body.token === "Bearer tok-secret-123";
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(token).toBe("tok-secret-123");
		});

		it("should work with static params (backward compatibility)", async () => {
			const port = getNextPort();

			const server = new Server("mock", {
				protocol: new HttpProtocol<HttpService>(),
				listenAddress: { host: "localhost", port },
			});

			const client = new Client("api", {
				protocol: new HttpProtocol<HttpService>(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "HTTP static params",
				components: [server, client],
			});

			const tc = testCase("static params still work", (test) => {
				const api = test.use(client);
				const mock = test.use(server);

				api.request("login", { method: "POST", path: "/login", body: { user: "Bob" } });

				mock.onRequest("login", { method: "POST", path: "/login" }).mockResponse(() => ({
					code: 200,
					body: { token: "tok-bob" },
				}));

				api.onResponse("login").assert((res) => res.body.token === "tok-bob");
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	// =============================================================================
	// WebSocket Factory Params Tests
	// =============================================================================

	describe("WebSocket: Multi-step flow with factory params", () => {
		it("should use factory to pass session data between steps", async () => {
			const port = getNextPort();

			const server = new AsyncServer("ws-mock", {
				protocol: new WebSocketProtocol<WsMessages>(),
				listenAddress: { host: "127.0.0.1", port },
			});

			const client = new AsyncClient("ws-client", {
				autoConnect: true,
				protocol: new WebSocketProtocol<WsMessages>(),
				targetAddress: { host: "127.0.0.1", port },
			});

			const scenario = new TestScenario({
				name: "WS factory params",
				components: [server, client],
			});

			let sessionId = "";

			const tc = testCase("auth then join room using factory", (test) => {
				const ws = test.use(client);
				const mock = test.use(server);

				mock.onConnection("client1");

				// Step 1: Auth — static payload
				ws.sendMessage("auth", { token: "secret-token" });

				mock.onMessage("auth").mockEvent("authResult", () => ({
					success: true,
					sessionId: "sess-abc",
				}));

				// Extract session ID from auth response
				ws.waitEvent("authResult").transform((payload) => {
					sessionId = payload.sessionId;
					return payload;
				});

				// Step 2: Join room — factory reads sessionId at execution time
				ws.sendMessage("join", () => ({
					room: "general",
					sessionId,
				}));

				mock.onMessage("join").mockEvent("joined", () => ({
					room: "general",
					members: 5,
				}));

				ws.waitEvent("joined").assert((payload) => {
					return payload.room === "general";
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(sessionId).toBe("sess-abc");
		});
	});

	// =============================================================================
	// AsyncServer sendEvent with Factory Params
	// =============================================================================

	describe("AsyncServer: sendEvent with factory params", () => {
		it("should use factory to build event payload at execution time", async () => {
			const port = getNextPort();

			const server = new AsyncServer("ws-srv", {
				protocol: new WebSocketProtocol<WsMessages>(),
				listenAddress: { host: "127.0.0.1", port },
			});

			// Manual connect to ensure onConnection hook fires
			const client = new AsyncClient("ws-cli", {
				protocol: new WebSocketProtocol<WsMessages>(),
				targetAddress: { host: "127.0.0.1", port },
			});

			const scenario = new TestScenario({
				name: "sendEvent factory",
				components: [server, client],
			});

			let extractedSessionId: string;

			const tc = testCase("server sends event with factory payload", (test) => {
				const ws = test.use(client);
				const srv = test.use(server);

				// Register connection hook (non-blocking)
				srv.onConnection("conn");

				// Client connects explicitly
				ws.connect();

				// Client sends auth
				ws.sendMessage("auth", { token: "tok-123" });

				// Server receives and extracts data
				srv.waitMessage("auth").transform((payload) => {
					extractedSessionId = "sess-xyz";
					return payload;
				});

				// Server sends event with factory payload — reads extractedSessionId at execution time
				srv.sendEvent("conn", "authResult", () => ({
					success: true,
					sessionId: extractedSessionId,
				}));

				// Client verifies
				ws.waitEvent("authResult").assert((payload) => {
					return payload.sessionId === "sess-xyz";
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});
});
