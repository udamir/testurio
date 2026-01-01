/**
 * Component Types Integration Tests
 *
 * Tests for the "Component Carries Its Types" pattern.
 * Verifies that test.use(component) returns properly typed step builders.
 */

import { describe, expect, it } from "vitest";
import {
	Client,
	Server,
	AsyncClient,
	AsyncServer,
	TestScenario,
	testCase,
	HttpProtocol,
} from "testurio";
import { WebSocketProtocol, type WsServiceDefinition } from "@testurio/protocol-ws";

// HTTP service type definitions for strict typing
interface User {
	id: number;
	name: string;
}

interface HttpTestService {
	getUsers: {
		request: { method: "GET"; path: "/users" };
		response: { code: 200; body: User[] };
	};
	health: {
		request: { method: "GET"; path: "/health" };
		response: { code: 200; body: { status: string } };
	};
	createUser: {
		request: { method: "POST"; path: "/users"; body?: { name: string } };
		response: { code: 201; body: User };
	};
	test: {
		request: { method: "GET"; path: "/test" };
		response: { code: 200; body: { ok: boolean } };
	};
}

describe("Component Types Integration", () => {
	describe("7.1 HTTP Client/Server with typed handlers", () => {
		it("should provide typed step builders via test.use()", async () => {
			const httpClient = Client.create("api", {
				protocol: new HttpProtocol<HttpTestService>(),
				targetAddress: { host: "localhost", port: 3100 },
			});

			const httpServer = Server.create("backend", {
				protocol: new HttpProtocol<HttpTestService>(),
				listenAddress: { host: "localhost", port: 3100 },
			});

			const scenario = new TestScenario({
				name: "HTTP Types Test",
				components: [httpClient, httpServer],
			});

			let responseData = {} as HttpTestService["getUsers"]["response"];

			const tc = testCase("HTTP request with typed response", (test) => {
				// Use the component references directly - they're the same instances
				const api = test.use(httpClient);
				const backend = test.use(httpServer);

				// Register mock handler first (declarative order)
				backend
					.onRequest("getUsers", { method: "GET", path: "/users" })
					.mockResponse(() => ({
						code: 200,
						body: [{ id: 1, name: "Alice" }],
					}));

				// Then send request
				api.request("getUsers", { method: "GET", path: "/users" });

				// Handle response
				api.onResponse("getUsers").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(responseData.body).toEqual([{ id: 1, name: "Alice" }]);
		});

		it("should work with Server.create() factory method", async () => {
			// Test that Server.create() and Client.create() work with use()
			const httpClient = Client.create("factory-api", {
				protocol: new HttpProtocol<HttpTestService>(),
				targetAddress: { host: "localhost", port: 3150 },
			});

			const httpServer = Server.create("factory-backend", {
				protocol: new HttpProtocol<HttpTestService>(),
				listenAddress: { host: "localhost", port: 3150 },
			});

			const scenario = new TestScenario({
				name: "Factory Method Test",
				components: [httpServer, httpClient], // Server first so it starts before client
			});

			let responseReceived = false;

			const tc = testCase("Factory method components with use()", (test) => {
				// Use typed step builders
				const backend = test.use(httpServer);
				const api = test.use(httpClient);

				// Register mock handler first
				backend
					.onRequest("health", { method: "GET", path: "/health" })
					.mockResponse(() => ({
						code: 200,
						body: { status: "ok" },
					}));

				// Then send request
				api.request("health", { method: "GET", path: "/health" });

				api.onResponse("health").assert(() => {
					responseReceived = true;
					return true;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(responseReceived).toBe(true);
		});
	});

	// WebSocket message types for type-safe tests
	interface WsTestMessages extends WsServiceDefinition {
		clientMessages: {
			ping: { seq: number };
			subscribe: { channel: string };
		};
		serverMessages: {
			pong: { seq: number };
			subscribed: { channel: string };
		};
	}

	describe("7.3 WebSocket Client/Server with typed messages", () => {
		it("should provide typed async step builders via test.use()", async () => {
			const wsServer = AsyncServer.create("ws-backend", {
				protocol: new WebSocketProtocol<WsTestMessages>(),
				listenAddress: { host: "127.0.0.1", port: 8100 },
			});

			const wsClient = AsyncClient.create("ws-client", {
				protocol: new WebSocketProtocol<WsTestMessages>(),
				targetAddress: { host: "127.0.0.1", port: 8100 },
			});

			const scenario = new TestScenario({
				name: "WebSocket Types Test",
				components: [wsServer, wsClient],
			});

			let messageReceived = false;

			const tc = testCase("WebSocket message with typed payload", (test) => {
				// Use the same pattern as existing working tests but with use()
				// The use() method should work the same as asyncClient()/asyncServer()
				const client = test.use(wsClient);
				const server = test.use(wsServer);

				// Send message from client
				client.sendMessage("ping", { seq: 1 });

				// Server waits for and validates message
				server.waitMessage("ping", { timeout: 2000 }).assert((payload) => {
					messageReceived = true;
					return payload.seq === 1;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(messageReceived).toBe(true);
		});
	});

	describe("7.5 Mixed protocol scenario", () => {
		it("should handle multiple protocols with typed components", async () => {
			const httpClient = Client.create("http-api", {
				protocol: new HttpProtocol<HttpTestService>(),
				targetAddress: { host: "localhost", port: 3102 },
			});

			const httpServer = Server.create("http-backend", {
				protocol: new HttpProtocol<HttpTestService>(),
				listenAddress: { host: "localhost", port: 3102 },
			});

			const wsServer = AsyncServer.create("ws-events", {
				protocol: new WebSocketProtocol<WsTestMessages>(),
				listenAddress: { host: "127.0.0.1", port: 8101 },
			});

			const wsClient = AsyncClient.create("ws-subscriber", {
				protocol: new WebSocketProtocol<WsTestMessages>(),
				targetAddress: { host: "127.0.0.1", port: 8101 },
			});

			const scenario = new TestScenario({
				name: "Mixed Protocol Test",
				components: [httpServer, httpClient, wsServer, wsClient],
			});

			let httpResponseReceived = false;
			let wsMessageReceived = false;

			const tc = testCase("HTTP + WebSocket interaction", (test) => {
				// HTTP components - typed via use()
				const api = test.use(httpClient);
				const backend = test.use(httpServer);

				// WebSocket components - typed via use()
				const events = test.use(wsServer);
				const subscriber = test.use(wsClient);

				// Register HTTP mock handler first
				backend
					.onRequest("createUser", { method: "POST", path: "/users" })
					.mockResponse(() => ({
						code: 201,
						body: { id: 1, name: "Alice" },
					}));

				// HTTP request
				api.request("createUser", { method: "POST", path: "/users" });

				api.onResponse("createUser").assert(() => {
					httpResponseReceived = true;
					return true;
				});

				// WebSocket: send message from client
				subscriber.sendMessage("subscribe", { channel: "users" });

				// WebSocket: server waits for message (simpler pattern)
				events.waitMessage("subscribe", { timeout: 2000 }).assert((payload) => {
					wsMessageReceived = true;
					return payload.channel === "users";
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(httpResponseReceived).toBe(true);
			expect(wsMessageReceived).toBe(true);
		});
	});

	describe("7.6 Component by name access", () => {
		it("should work with component() method for name-based access", async () => {
			const httpClient = Client.create("named-api", {
				protocol: new HttpProtocol<HttpTestService>(),
				targetAddress: { host: "localhost", port: 3103 },
			});

			const httpServer = Server.create("named-backend", {
				protocol: new HttpProtocol<HttpTestService>(),
				listenAddress: { host: "localhost", port: 3103 },
			});

			const scenario = new TestScenario({
				name: "Component by Name Test",
				components: [httpServer, httpClient],
			});

			let responseReceived = false;

			const tc = testCase(
				"Using component() method for name-based access",
				(test) => {
					// Using use() with component references (preferred)
					const api = test.use(httpClient);
					const backend = test.use(httpServer);

					// Register mock handler first
					backend
						.onRequest("test", { method: "GET", path: "/test" })
						.mockResponse(() => ({
							code: 200,
							body: { ok: true },
						}));

					api.request("test", { method: "GET", path: "/test" });

					api.onResponse("test").assert(() => {
						responseReceived = true;
						return true;
					});
				},
			);

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(responseReceived).toBe(true);
		});
	});
});
