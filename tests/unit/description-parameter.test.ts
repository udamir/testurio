/**
 * Description Parameter Tests
 *
 * Tests for optional description parameter on builder methods.
 */

import { describe, expect, it } from "vitest";
import {
	AsyncClient,
	AsyncServer,
	Client,
	HttpProtocol,
	Server,
	TestScenario,
	testCase,
} from "../../packages/core/src";
import { WebSocketProtocol } from "../../packages/protocol-ws/src";

describe("Description Parameter", () => {
	describe("SyncClientHookBuilder.assert()", () => {
		const PORT = 17000;

		it("should include description in error message when assertion fails", async () => {
			const client = new Client("api", {
				protocol: new HttpProtocol(),
				targetAddress: { host: "localhost", port: PORT },
			});

			const server = new Server("mock", {
				protocol: new HttpProtocol(),
				listenAddress: { host: "localhost", port: PORT },
			});

			const scenario = new TestScenario({
				name: "Description Test",
				components: [server, client],
			});

			const tc = testCase("test with description", (test) => {
				const api = test.use(client);
				const mock = test.use(server);

				api.request("test", { method: "GET", path: "/test" });
				mock.onRequest("test", { method: "GET", path: "/test" }).mockResponse(() => ({
					code: 500,
					body: { error: "fail" },
				}));
				api.onResponse("test").assert("status should be 200", (res) => res.code === 200);
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(false);
			expect(result.testCases[0].error).toContain("Assertion failed: status should be 200");
		});

		it("should work without description (backwards compatible)", async () => {
			const client = new Client("api", {
				protocol: new HttpProtocol(),
				targetAddress: { host: "localhost", port: PORT + 1 },
			});

			const server = new Server("mock", {
				protocol: new HttpProtocol(),
				listenAddress: { host: "localhost", port: PORT + 1 },
			});

			const scenario = new TestScenario({
				name: "No Description Test",
				components: [server, client],
			});

			const tc = testCase("test without description", (test) => {
				const api = test.use(client);
				const mock = test.use(server);

				api.request("test", { method: "GET", path: "/test" });
				mock.onRequest("test", { method: "GET", path: "/test" }).mockResponse(() => ({
					code: 200,
					body: { ok: true },
				}));
				api.onResponse("test").assert((res) => res.code === 200);
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
		});

		it("should support multiple assertions with descriptions", async () => {
			const client = new Client("api", {
				protocol: new HttpProtocol(),
				targetAddress: { host: "localhost", port: PORT + 2 },
			});

			const server = new Server("mock", {
				protocol: new HttpProtocol(),
				listenAddress: { host: "localhost", port: PORT + 2 },
			});

			const scenario = new TestScenario({
				name: "Multiple Assertions Test",
				components: [server, client],
			});

			const tc = testCase("multiple assertions", (test) => {
				const api = test.use(client);
				const mock = test.use(server);

				api.request("test", { method: "GET", path: "/test" });
				mock.onRequest("test", { method: "GET", path: "/test" }).mockResponse(() => ({
					code: 200,
					body: { name: "John", age: 30 },
				}));
				api
					.onResponse("test")
					.assert("status should be 200", (res) => res.code === 200)
					.assert("should have name", (res) => (res.body as { name?: string }).name !== undefined)
					.assert((res) => (res.body as { age?: number }).age === 30); // Mixed with no description
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
		});
	});

	describe("SyncHookBuilderImpl (server)", () => {
		const PORT = 17100;

		it("assert() should include description in error message", async () => {
			const client = new Client("api", {
				protocol: new HttpProtocol(),
				targetAddress: { host: "localhost", port: PORT },
			});

			const server = new Server("mock", {
				protocol: new HttpProtocol(),
				listenAddress: { host: "localhost", port: PORT },
			});

			const scenario = new TestScenario({
				name: "Server Assert Test",
				components: [server, client],
			});

			const tc = testCase("server assert with description", (test) => {
				const api = test.use(client);
				const mock = test.use(server);

				api.request("test", { method: "POST", path: "/test", body: { invalid: true } });
				mock
					.onRequest("test", { method: "POST", path: "/test" })
					.assert("request body should have name field", (req) => {
						// Explicitly check for name property
						return typeof req.body === "object" && req.body !== null && "name" in req.body;
					})
					.mockResponse(() => ({ code: 200, body: {} }));
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(false);
			expect(result.testCases[0].error).toContain("Assertion failed: request body should have name field");
		});

		it("mockResponse() should accept description", async () => {
			const client = new Client("api", {
				protocol: new HttpProtocol(),
				targetAddress: { host: "localhost", port: PORT + 1 },
			});

			const server = new Server("mock", {
				protocol: new HttpProtocol(),
				listenAddress: { host: "localhost", port: PORT + 1 },
			});

			const scenario = new TestScenario({
				name: "MockResponse Description Test",
				components: [server, client],
			});

			const tc = testCase("mockResponse with description", (test) => {
				const api = test.use(client);
				const mock = test.use(server);

				api.request("test", { method: "GET", path: "/users" });
				mock
					.onRequest("test", { method: "GET", path: "/users" })
					.mockResponse("return empty user list", () => ({ code: 200, body: [] }));
				api.onResponse("test").assert((res) => Array.isArray(res.body));
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
		});

		it("delay() should accept description", async () => {
			const client = new Client("api", {
				protocol: new HttpProtocol(),
				targetAddress: { host: "localhost", port: PORT + 2 },
			});

			const server = new Server("mock", {
				protocol: new HttpProtocol(),
				listenAddress: { host: "localhost", port: PORT + 2 },
			});

			const scenario = new TestScenario({
				name: "Delay Description Test",
				components: [server, client],
			});

			const start = Date.now();
			const tc = testCase("delay with description", (test) => {
				const api = test.use(client);
				const mock = test.use(server);

				api.request("test", { method: "GET", path: "/slow" });
				mock
					.onRequest("test", { method: "GET", path: "/slow" })
					.delay("simulate network latency", 50)
					.mockResponse(() => ({ code: 200, body: {} }));
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(Date.now() - start).toBeGreaterThanOrEqual(50);
		});

		it("proxy() should accept description", async () => {
			const backend = new Server("backend", {
				protocol: new HttpProtocol(),
				listenAddress: { host: "localhost", port: PORT + 3 },
			});

			const proxy = new Server("proxy", {
				protocol: new HttpProtocol(),
				listenAddress: { host: "localhost", port: PORT + 4 },
				targetAddress: { host: "localhost", port: PORT + 3 },
			});

			const client = new Client("api", {
				protocol: new HttpProtocol(),
				targetAddress: { host: "localhost", port: PORT + 4 },
			});

			const scenario = new TestScenario({
				name: "Proxy Description Test",
				components: [backend, proxy, client],
			});

			const tc = testCase("proxy with description", (test) => {
				const api = test.use(client);
				const prx = test.use(proxy);
				const back = test.use(backend);

				api.request("test", { method: "GET", path: "/data" });
				prx.onRequest("test", { method: "GET", path: "/data" }).proxy("add tracing header", (req) => ({
					...req,
					headers: { ...req.headers, "X-Trace-Id": "123" },
				}));
				back.onRequest("test", { method: "GET", path: "/data" }).mockResponse(() => ({
					code: 200,
					body: { data: "test" },
				}));
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
		});
	});

	describe("AsyncClientHookBuilder", () => {
		const PORT = 17200;

		it("assert() should work with description (passing case)", async () => {
			interface WsMessages {
				clientMessages: { ping: { seq: number } };
				serverMessages: { pong: { seq: number } };
			}

			const wsServer = new AsyncServer("ws-server", {
				protocol: new WebSocketProtocol<WsMessages>(),
				listenAddress: { host: "localhost", port: PORT },
			});

			const wsClient = new AsyncClient("ws-client", {
				protocol: new WebSocketProtocol<WsMessages>(),
				targetAddress: { host: "localhost", port: PORT },
			});

			const scenario = new TestScenario({
				name: "WS Assert Test",
				components: [wsServer, wsClient],
			});

			const tc = testCase("ws assert with description", (test) => {
				const client = test.use(wsClient);
				const server = test.use(wsServer);

				client.sendMessage("ping", { seq: 42 });
				server.onMessage("ping").mockEvent("pong", (payload) => ({ seq: payload.seq }));
				client.onEvent("pong").assert("seq should be 42", (payload) => payload.seq === 42);
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
		});

		it("delay() should accept description and work correctly", async () => {
			interface WsMessages {
				clientMessages: { ping: { seq: number } };
				serverMessages: { pong: { seq: number } };
			}

			const wsServer = new AsyncServer("ws-server", {
				protocol: new WebSocketProtocol<WsMessages>(),
				listenAddress: { host: "localhost", port: PORT + 1 },
			});

			const wsClient = new AsyncClient("ws-client", {
				protocol: new WebSocketProtocol<WsMessages>(),
				targetAddress: { host: "localhost", port: PORT + 1 },
			});

			const scenario = new TestScenario({
				name: "WS Delay Test",
				components: [wsServer, wsClient],
			});

			const tc = testCase("ws delay with description", (test) => {
				const client = test.use(wsClient);
				const server = test.use(wsServer);

				client.sendMessage("ping", { seq: 1 });
				server
					.onMessage("ping")
					.delay("simulate processing time", 50)
					.mockEvent("pong", (payload) => ({ seq: payload.seq }));
				client.onEvent("pong").assert((payload) => payload.seq === 1);
			});

			const result = await scenario.run(tc);

			// Just verify the test passes - delay timing is handled by the framework
			expect(result.passed).toBe(true);
		});
	});

	describe("AsyncServerHookBuilder", () => {
		const PORT = 17300;

		it("mockEvent() should accept description", async () => {
			interface WsMessages {
				clientMessages: { subscribe: { channel: string } };
				serverMessages: { subscribed: { id: string; status: string } };
			}

			const wsServer = new AsyncServer("ws-server", {
				protocol: new WebSocketProtocol<WsMessages>(),
				listenAddress: { host: "localhost", port: PORT },
			});

			const wsClient = new AsyncClient("ws-client", {
				protocol: new WebSocketProtocol<WsMessages>(),
				targetAddress: { host: "localhost", port: PORT },
			});

			const scenario = new TestScenario({
				name: "MockEvent Description Test",
				components: [wsServer, wsClient],
			});

			const tc = testCase("mockEvent with description", (test) => {
				const client = test.use(wsClient);
				const server = test.use(wsServer);

				client.sendMessage("subscribe", { channel: "updates" });
				server.onMessage("subscribe").mockEvent("respond with subscription confirmation", "subscribed", () => ({
					id: "sub-123",
					status: "active",
				}));
				client.onEvent("subscribed").assert((payload) => payload.status === "active");
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
		});

		it("mockEvent() should work without description (backwards compatible)", async () => {
			interface WsMessages {
				clientMessages: { ping: { seq: number } };
				serverMessages: { pong: { seq: number } };
			}

			const wsServer = new AsyncServer("ws-server", {
				protocol: new WebSocketProtocol<WsMessages>(),
				listenAddress: { host: "localhost", port: PORT + 1 },
			});

			const wsClient = new AsyncClient("ws-client", {
				protocol: new WebSocketProtocol<WsMessages>(),
				targetAddress: { host: "localhost", port: PORT + 1 },
			});

			const scenario = new TestScenario({
				name: "MockEvent No Description Test",
				components: [wsServer, wsClient],
			});

			const tc = testCase("mockEvent without description", (test) => {
				const client = test.use(wsClient);
				const server = test.use(wsServer);

				client.sendMessage("ping", { seq: 42 });
				server.onMessage("ping").mockEvent("pong", (payload) => ({ seq: payload.seq }));
				client.onEvent("pong").assert((payload) => payload.seq === 42);
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
		});
	});
});
