/**
 * Schema Validation Integration Tests
 *
 * Tests runtime schema validation across all component types:
 * - Schema-inferred types (no manual generic)
 * - Explicit .validate() handler
 * - Auto-validation at I/O boundaries
 * - ValidationError structure
 * - Validation flags (disable auto-validation)
 * - Protocol-level schema as single source of truth
 * - Backward compatibility (explicit generic, loose mode)
 *
 * Note: Auto-validation validates the complete protocol-level data:
 * - HTTP: validates full HttpRequest/HttpResponse objects (method, path, code, body, etc.)
 * - WebSocket/TCP: validates message payloads directly
 * - MQ: validates topic payloads directly
 *
 * Note: HTTP server-side auto-validation uses the adapter's messageType format
 * ("METHOD /path") for schema lookup, which differs from the user-defined operation name.
 * Auto-validation on async protocols (WebSocket, MQ) works directly because messageType
 * matches the schema key.
 */

import { WebSocketProtocol } from "@testurio/protocol-ws";
import {
	AsyncClient,
	AsyncServer,
	Client,
	HttpProtocol,
	Publisher,
	Server,
	Subscriber,
	TestScenario,
	testCase,
} from "testurio";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createFakeMQAdapter, createInMemoryBroker } from "../mocks/fakeMQAdapter";

// ============================================================================
// Port Management
// ============================================================================

let portCounter = 18000;
function getNextPort(): number {
	return portCounter++;
}

// ============================================================================
// Zod Schemas for Testing
// ============================================================================

// HTTP schemas must match the full protocol types (HttpRequest/HttpResponse)
const CreateUserRequestSchema = z
	.object({
		method: z.string(),
		path: z.string(),
		body: z.object({
			name: z.string().min(1),
			email: z.string().email(),
		}),
	})
	.passthrough();

const UserResponseSchema = z
	.object({
		code: z.number(),
		body: z.object({
			id: z.number(),
			name: z.string(),
			email: z.string().email(),
		}),
	})
	.passthrough();

const UsersListResponseSchema = z
	.object({
		code: z.number(),
		body: z.array(
			z.object({
				id: z.number(),
				name: z.string(),
				email: z.string().email(),
			})
		),
	})
	.passthrough();

// Async/MQ schemas validate payloads directly
const OrderEventSchema = z.object({
	orderId: z.string().uuid(),
	amount: z.number().positive(),
});

const ChatMessageSchema = z.object({
	text: z.string().min(1),
	roomId: z.string(),
});

const ChatResponseSchema = z.object({
	text: z.string(),
	userId: z.string(),
	timestamp: z.number(),
});

// ============================================================================
// Test Suite
// ============================================================================

describe("Schema Validation", () => {
	// ============================================================
	// 6.1 Schema-inferred types on async protocol
	// ============================================================
	describe("6.1 Schema-inferred types on async protocol", () => {
		it("should infer message types from async protocol schema", async () => {
			const port = getNextPort();

			const wsSchema = {
				clientMessages: {
					sendChat: ChatMessageSchema,
				},
				serverMessages: {
					chatResponse: ChatResponseSchema,
				},
			};

			const server = new AsyncServer("chat-server", {
				protocol: new WebSocketProtocol({ schema: wsSchema }),
				listenAddress: { host: "127.0.0.1", port },
			});

			const client = new AsyncClient("chat-client", {
				autoConnect: true,
				protocol: new WebSocketProtocol({ schema: wsSchema }),
				targetAddress: { host: "127.0.0.1", port },
			});

			const scenario = new TestScenario({
				name: "Async schema-inferred types",
				components: [server, client],
			});

			const tc = testCase("infer types from schema", (test) => {
				const api = test.use(client);
				const mock = test.use(server);

				api.sendMessage("sendChat", { text: "hello", roomId: "room-1" });

				mock.onMessage("sendChat").mockEvent("chatResponse", (payload) => {
					return { text: payload.text, userId: "user-1", timestamp: Date.now() };
				});

				api.onEvent("chatResponse").assert((payload) => {
					return payload.userId === "user-1" && typeof payload.timestamp === "number";
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	// ============================================================
	// 6.2 Schema-inferred types on sync protocol
	// ============================================================
	describe("6.2 Schema-inferred types on sync protocol", () => {
		it("should infer request/response types from sync protocol schema", async () => {
			const port = getNextPort();

			// Schema matches full HttpResponse shape
			const httpSchema = {
				getUsers: {
					response: UsersListResponseSchema,
				},
			};

			const server = new Server("api-server", {
				protocol: new HttpProtocol({ schema: httpSchema }),
				listenAddress: { host: "localhost", port },
			});

			const client = new Client("api-client", {
				protocol: new HttpProtocol({ schema: httpSchema }),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "Sync schema-inferred types",
				components: [server, client],
			});

			const tc = testCase("infer types from schema", (test) => {
				const api = test.use(client);
				const mock = test.use(server);

				api.request("getUsers", { method: "GET", path: "/users" });

				mock.onRequest("getUsers", { method: "GET", path: "/users" }).mockResponse(() => ({
					code: 200,
					body: [{ id: 1, name: "Alice", email: "alice@example.com" }],
				}));

				api.onResponse("getUsers").assert((res) => {
					return res.body.length === 1;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	// ============================================================
	// 6.3 Backward compat: explicit generic without schema
	// ============================================================
	describe("6.3 Backward compat: explicit generic", () => {
		it("should work with explicit generic and no schema", async () => {
			const port = getNextPort();

			interface MyOperations {
				getItems: {
					request: { method: "GET"; path: "/items"; body?: never };
					response: { code: 200; body: { items: string[] } };
				};
			}

			const server = new Server("mock", {
				protocol: new HttpProtocol<MyOperations>(),
				listenAddress: { host: "localhost", port },
			});

			const client = new Client("client", {
				protocol: new HttpProtocol<MyOperations>(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "Explicit generic test",
				components: [server, client],
			});

			const tc = testCase("explicit generic types work", (test) => {
				const api = test.use(client);
				const mock = test.use(server);

				api.request("getItems", { method: "GET", path: "/items" });

				mock.onRequest("getItems", { method: "GET", path: "/items" }).mockResponse(() => ({
					code: 200,
					body: { items: ["a", "b"] },
				}));

				api.onResponse("getItems").assert((res) => {
					return res.body.items.length === 2;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	// ============================================================
	// 6.4 Loose mode: no generic, no schema
	// ============================================================
	describe("6.4 Loose mode", () => {
		it("should work with no generic and no schema", async () => {
			const port = getNextPort();

			const server = new Server("mock", {
				protocol: new HttpProtocol(),
				listenAddress: { host: "localhost", port },
			});

			const client = new Client("client", {
				protocol: new HttpProtocol(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "Loose mode test",
				components: [server, client],
			});

			const tc = testCase("loose mode allows any keys", (test) => {
				const api = test.use(client);
				const mock = test.use(server);

				api.request("anyOperation", { method: "GET", path: "/anything" });

				mock.onRequest("anyOperation", { method: "GET", path: "/anything" }).mockResponse(() => ({
					code: 200,
					body: { ok: true },
				}));

				api.onResponse("anyOperation").assert((res) => {
					return res.body.ok === true;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	// ============================================================
	// 6.5 .validate() with explicit schema on sync client response
	// ============================================================
	describe("6.5 .validate() with explicit schema", () => {
		it("should validate response with explicit schema and pass", async () => {
			const port = getNextPort();

			const server = new Server("mock", {
				protocol: new HttpProtocol(),
				listenAddress: { host: "localhost", port },
			});

			const client = new Client("client", {
				protocol: new HttpProtocol(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "Explicit schema validate pass",
				components: [server, client],
			});

			// Schema validates the full HttpResponse
			const ResponseSchema = z
				.object({
					code: z.number(),
					body: z.object({ id: z.number(), name: z.string() }),
				})
				.passthrough();

			const tc = testCase("validate with explicit schema passes", (test) => {
				const api = test.use(client);
				const mock = test.use(server);

				api.request("getUser", { method: "GET", path: "/user" });

				mock.onRequest("getUser", { method: "GET", path: "/user" }).mockResponse(() => ({
					code: 200,
					body: { id: 1, name: "Alice" },
				}));

				api
					.onResponse("getUser")
					.validate(ResponseSchema)
					.assert((parsed) => {
						return typeof parsed === "object" && parsed !== null;
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should fail when explicit schema validation fails", async () => {
			const port = getNextPort();

			const server = new Server("mock", {
				protocol: new HttpProtocol(),
				listenAddress: { host: "localhost", port },
			});

			const client = new Client("client", {
				protocol: new HttpProtocol(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "Explicit schema validate fail",
				components: [server, client],
			});

			// Schema requires email field in body
			const StrictSchema = z
				.object({
					code: z.number(),
					body: z.object({
						id: z.number(),
						name: z.string(),
						email: z.string().email(),
					}),
				})
				.passthrough();

			const tc = testCase("validate with explicit schema fails", (test) => {
				const api = test.use(client);
				const mock = test.use(server);

				api.request("getUser", { method: "GET", path: "/user" });

				// Response missing required 'email' field
				mock.onRequest("getUser", { method: "GET", path: "/user" }).mockResponse(() => ({
					code: 200,
					body: { id: 1, name: "Alice" },
				}));

				api.onResponse("getUser").validate(StrictSchema);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(false);
			expect(result.testCases[0].error).toBeDefined();
			expect(result.testCases[0].error).toContain("Validation failed");
		});
	});

	// ============================================================
	// 6.6 .validate() with no args (protocol schema lookup)
	// ============================================================
	describe("6.6 .validate() with no args", () => {
		it("should look up and use protocol-level schema", async () => {
			const port = getNextPort();

			const httpSchema = {
				getUser: {
					response: z
						.object({
							code: z.number(),
							body: z.object({ id: z.number(), name: z.string() }),
						})
						.passthrough(),
				},
			};

			const server = new Server("mock", {
				protocol: new HttpProtocol({ schema: httpSchema }),
				listenAddress: { host: "localhost", port },
			});

			const client = new Client("client", {
				protocol: new HttpProtocol({ schema: httpSchema }),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "Protocol schema lookup",
				components: [server, client],
			});

			const tc = testCase("validate with protocol schema", (test) => {
				const api = test.use(client);
				const mock = test.use(server);

				api.request("getUser", { method: "GET", path: "/user" });

				mock.onRequest("getUser", { method: "GET", path: "/user" }).mockResponse(() => ({
					code: 200,
					body: { id: 1, name: "Bob" },
				}));

				api
					.onResponse("getUser")
					.validate()
					.assert((parsed) => {
						return typeof parsed === "object" && parsed !== null;
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	// ============================================================
	// 6.7 Auto-validation of outgoing request (Client)
	// ============================================================
	describe("6.7 Auto-validation of outgoing request", () => {
		it("should fail when outgoing request is invalid", async () => {
			const port = getNextPort();

			const httpSchema = {
				createUser: {
					request: CreateUserRequestSchema,
				},
			};

			const server = new Server("mock", {
				protocol: new HttpProtocol(),
				listenAddress: { host: "localhost", port },
			});

			const client = new Client("client", {
				protocol: new HttpProtocol({ schema: httpSchema }),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "Auto-validate outgoing request",
				components: [server, client],
			});

			const tc = testCase("invalid request fails auto-validation", (test) => {
				const api = test.use(client);
				const mock = test.use(server);

				// Send request with invalid email in body
				api.request("createUser", {
					method: "POST",
					path: "/users",
					body: { name: "Alice", email: "not-an-email" },
				});

				mock.onRequest("createUser", { method: "POST", path: "/users" }).mockResponse(() => ({
					code: 201,
					body: { id: 1 },
				}));
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(false);
			expect(result.testCases[0].error).toBeDefined();
			expect(result.testCases[0].error).toContain("Auto-validation failed");
			expect(result.testCases[0].error).toContain("client");
		});
	});

	// ============================================================
	// 6.8 Auto-validation of incoming client message (AsyncServer)
	// ============================================================
	describe("6.8 Auto-validation of incoming message on AsyncServer", () => {
		it("should track error when incoming client message fails auto-validation", async () => {
			const port = getNextPort();

			const wsSchema = {
				clientMessages: {
					join: z.object({ roomId: z.string().min(1) }),
				},
				serverMessages: {
					ack: z.object({ ok: z.boolean() }),
				},
			};

			const server = new AsyncServer("ws-server", {
				protocol: new WebSocketProtocol({ schema: wsSchema }),
				listenAddress: { host: "127.0.0.1", port },
			});

			const client = new AsyncClient("ws-client", {
				autoConnect: true,
				protocol: new WebSocketProtocol(),
				targetAddress: { host: "127.0.0.1", port },
			});

			const scenario = new TestScenario({
				name: "AsyncServer auto-validate incoming",
				components: [server, client],
			});

			const tc = testCase("invalid client message fails auto-validation", (test) => {
				const api = test.use(client);
				const mock = test.use(server);

				// Send message with empty roomId (fails min(1))
				api.sendMessage("join", { roomId: "" });

				mock.onMessage("join").mockEvent("ack", () => ({ ok: true }));

				// Use waitEvent with timeout - event never arrives because server
				// auto-validation fails and drops the message before handler runs
				api.waitEvent("ack").timeout(1000);
			});

			const result = await scenario.run(tc);
			// Server auto-validation error is tracked as unhandled error
			expect(result.passed).toBe(false);
		});
	});

	// ============================================================
	// 6.9 Auto-validation of outgoing event (AsyncServer mockEvent)
	// ============================================================
	describe("6.9 Auto-validation of outgoing event on AsyncServer", () => {
		it("should track error when outgoing event fails auto-validation", async () => {
			const port = getNextPort();

			const wsSchema = {
				clientMessages: {
					ping: z.object({ data: z.string() }),
				},
				serverMessages: {
					pong: z.object({ data: z.string().min(1), ts: z.number() }),
				},
			};

			const server = new AsyncServer("ws-server", {
				protocol: new WebSocketProtocol({ schema: wsSchema }),
				listenAddress: { host: "127.0.0.1", port },
			});

			const client = new AsyncClient("ws-client", {
				autoConnect: true,
				protocol: new WebSocketProtocol(),
				targetAddress: { host: "127.0.0.1", port },
			});

			const scenario = new TestScenario({
				name: "AsyncServer auto-validate outgoing event",
				components: [server, client],
			});

			const tc = testCase("invalid outgoing event tracked as error", (test) => {
				const api = test.use(client);
				const mock = test.use(server);

				api.sendMessage("ping", { data: "hello" });

				// Server responds with empty data (fails min(1) on pong schema)
				mock.onMessage("ping").mockEvent("pong", () => ({
					data: "",
					ts: Date.now(),
				}));

				// Use waitEvent with timeout - event never arrives because server
				// auto-validation of outgoing event fails
				api.waitEvent("pong").timeout(1000);
			});

			const result = await scenario.run(tc);
			// Server auto-validation error is tracked as unhandled error
			expect(result.passed).toBe(false);
		});
	});

	// ============================================================
	// 6.10 Validation flags disable auto-validation
	// ============================================================
	describe("6.10 Validation flags disable auto-validation", () => {
		it("should skip all validation when both flags are false", async () => {
			const port = getNextPort();

			const httpSchema = {
				createUser: {
					request: CreateUserRequestSchema,
					response: UserResponseSchema,
				},
			};

			const server = new Server("mock", {
				protocol: new HttpProtocol(),
				listenAddress: { host: "localhost", port },
			});

			const client = new Client("client", {
				protocol: new HttpProtocol({ schema: httpSchema }),
				targetAddress: { host: "localhost", port },
				validation: { validateRequests: false, validateResponses: false },
			});

			const scenario = new TestScenario({
				name: "Disable all validation",
				components: [server, client],
			});

			const tc = testCase("invalid data passes when all validation disabled", (test) => {
				const api = test.use(client);
				const mock = test.use(server);

				// Invalid request body (bad email) - should pass with validation disabled
				api.request("createUser", {
					method: "POST",
					path: "/users",
					body: { name: "Alice", email: "not-an-email" },
				});

				// Invalid response (no email field) - should pass
				mock.onRequest("createUser", { method: "POST", path: "/users" }).mockResponse(() => ({
					code: 201,
					body: { id: 1, name: "Alice" },
				}));

				api.onResponse("createUser").assert(() => true);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should skip request validation when validateRequests is false", async () => {
			const port = getNextPort();

			const httpSchema = {
				createUser: {
					request: CreateUserRequestSchema,
				},
			};

			// Client has schema but request validation disabled
			const client = new Client("client", {
				protocol: new HttpProtocol({ schema: httpSchema }),
				targetAddress: { host: "localhost", port },
				validation: { validateRequests: false },
			});

			// Server has no schema
			const server = new Server("mock", {
				protocol: new HttpProtocol(),
				listenAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "Disable request validation only",
				components: [server, client],
			});

			const tc = testCase("invalid request passes with validateRequests: false", (test) => {
				const api = test.use(client);
				const mock = test.use(server);

				// Invalid body (bad email) - should pass because validateRequests=false
				api.request("createUser", {
					method: "POST",
					path: "/users",
					body: { name: "Alice", email: "not-an-email" },
				});

				mock.onRequest("createUser", { method: "POST", path: "/users" }).mockResponse(() => ({
					code: 201,
					body: { id: 1 },
				}));

				api.onResponse("createUser").assert(() => true);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	// ============================================================
	// 6.11 .validate() with no schema registered throws clear error
	// ============================================================
	describe("6.11 .validate() with no schema throws error", () => {
		it("should throw with operation info when no schema registered", async () => {
			const port = getNextPort();

			const server = new Server("mock-server", {
				protocol: new HttpProtocol(),
				listenAddress: { host: "localhost", port },
			});

			const client = new Client("my-client", {
				protocol: new HttpProtocol(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "No schema validate error",
				components: [server, client],
			});

			const tc = testCase("validate() with no schema throws", (test) => {
				const api = test.use(client);
				const mock = test.use(server);

				api.request("getUser", { method: "GET", path: "/user" });

				mock.onRequest("getUser", { method: "GET", path: "/user" }).mockResponse(() => ({
					code: 200,
					body: { id: 1 },
				}));

				// Call validate() with no schema registered
				api.onResponse("getUser").validate();
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(false);
			expect(result.testCases[0].error).toBeDefined();
			expect(result.testCases[0].error).toContain("No schema registered");
			expect(result.testCases[0].error).toContain("getUser");
		});
	});

	// ============================================================
	// 6.12 ValidationError structure and message content
	// ============================================================
	describe("6.12 ValidationError structure", () => {
		it("should include component name, operation, and direction in error message", async () => {
			const port = getNextPort();

			const server = new Server("mock", {
				protocol: new HttpProtocol(),
				listenAddress: { host: "localhost", port },
			});

			const client = new Client("test-client", {
				protocol: new HttpProtocol(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "ValidationError structure",
				components: [server, client],
			});

			const tc = testCase("validation error has structured message", (test) => {
				const api = test.use(client);
				const mock = test.use(server);

				api.request("getUser", { method: "GET", path: "/user" });

				// Return response that will fail validation
				mock.onRequest("getUser", { method: "GET", path: "/user" }).mockResponse(() => ({
					code: 200,
					body: { id: "not-a-number" },
				}));

				// Schema expects id to be number
				api.onResponse("getUser").validate(
					z
						.object({
							code: z.number(),
							body: z.object({ id: z.number(), name: z.string() }),
						})
						.passthrough()
				);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(false);
			expect(result.testCases[0].error).toBeDefined();
			expect(result.testCases[0].error).toContain("Validation failed");
			expect(result.testCases[0].error).toContain("test-client");
			expect(result.testCases[0].error).toContain("getUser");
			expect(result.testCases[0].error).toContain("response");
		});
	});

	// ============================================================
	// 6.13 .validate() on async protocols (WebSocket)
	// ============================================================
	describe("6.13 .validate() on async protocol", () => {
		it("should validate incoming event with explicit schema on WebSocket", async () => {
			const port = getNextPort();

			const server = new AsyncServer("ws-server", {
				protocol: new WebSocketProtocol(),
				listenAddress: { host: "127.0.0.1", port },
			});

			const client = new AsyncClient("ws-client", {
				autoConnect: true,
				protocol: new WebSocketProtocol(),
				targetAddress: { host: "127.0.0.1", port },
			});

			const scenario = new TestScenario({
				name: "Async validate test",
				components: [server, client],
			});

			const EventSchema = z.object({
				userId: z.string(),
				action: z.string(),
			});

			const tc = testCase("validate event with explicit schema", (test) => {
				const api = test.use(client);
				const mock = test.use(server);

				api.sendMessage("getStatus", { query: "all" });

				mock.onMessage("getStatus").mockEvent("statusUpdate", () => ({
					userId: "user-1",
					action: "login",
				}));

				api
					.onEvent("statusUpdate")
					.validate(EventSchema)
					.assert((parsed) => {
						return parsed.userId === "user-1" && parsed.action === "login";
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should fail when async event fails explicit validation", async () => {
			const port = getNextPort();

			const server = new AsyncServer("ws-server", {
				protocol: new WebSocketProtocol(),
				listenAddress: { host: "127.0.0.1", port },
			});

			const client = new AsyncClient("ws-client", {
				autoConnect: true,
				protocol: new WebSocketProtocol(),
				targetAddress: { host: "127.0.0.1", port },
			});

			const scenario = new TestScenario({
				name: "Async validate fail test",
				components: [server, client],
			});

			const StrictEventSchema = z.object({
				userId: z.string().uuid(),
				action: z.enum(["login", "logout"]),
			});

			const tc = testCase("invalid event fails validation", (test) => {
				const api = test.use(client);
				const mock = test.use(server);

				api.sendMessage("getStatus", { query: "all" });

				// Response has non-UUID userId
				mock.onMessage("getStatus").mockEvent("statusUpdate", () => ({
					userId: "not-a-uuid",
					action: "login",
				}));

				// Use waitEvent to ensure we block until event arrives and validate runs
				api.waitEvent("statusUpdate").validate(StrictEventSchema);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(false);
			expect(result.testCases[0].error).toContain("Validation failed");
		});
	});

	// ============================================================
	// 6.14 .validate() on Subscriber with topic-based schema
	// ============================================================
	describe("6.14 .validate() on Subscriber with topic-based schema", () => {
		it("should validate message using explicit schema on subscriber", async () => {
			const broker = createInMemoryBroker();

			// Schema that matches the FakeMessage adapter-level structure.
			// In a real adapter, the codec decodes the message and only the payload
			// would be passed. With FakeMQAdapter the full FakeMessage is passed to handlers.
			const FakeMessageOrderSchema = z
				.object({
					topic: z.string(),
					payload: z.object({
						orderId: z.string().uuid(),
						amount: z.number().positive(),
					}),
					timestamp: z.number(),
				})
				.passthrough();

			const subscriber = new Subscriber("test-sub", {
				adapter: createFakeMQAdapter(broker),
				// No schema on constructor - we test explicit .validate() only
				validation: { validateMessages: false },
			});

			const publisher = new Publisher("test-pub", {
				adapter: createFakeMQAdapter(broker),
			});

			const scenario = new TestScenario({
				name: "Subscriber validate test",
				components: [subscriber, publisher],
			});

			const tc = testCase("validate with explicit schema", (test) => {
				const sub = test.use(subscriber);
				const pub = test.use(publisher);

				// Publish first so message is available when subscriber starts waiting
				pub.publish("orders.created", {
					orderId: "550e8400-e29b-41d4-a716-446655440000",
					amount: 99.99,
				});

				sub
					.waitMessage("orders.created")
					.validate(FakeMessageOrderSchema)
					.assert((parsed) => {
						return typeof parsed.payload.orderId === "string" && parsed.payload.amount > 0;
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	// ============================================================
	// 6.15 Auto-validation on Publisher outgoing payloads
	// ============================================================
	describe("6.15 Auto-validation on Publisher", () => {
		it("should fail when publishing invalid payload", async () => {
			const broker = createInMemoryBroker();

			const publisher = new Publisher("order-pub", {
				adapter: createFakeMQAdapter(broker),
				schema: {
					"orders.created": OrderEventSchema,
				},
			});

			const scenario = new TestScenario({
				name: "Publisher auto-validate test",
				components: [publisher],
			});

			const tc = testCase("invalid publish fails auto-validation", (test) => {
				const pub = test.use(publisher);

				// Publish with invalid data (negative amount, non-UUID orderId)
				pub.publish("orders.created", {
					orderId: "not-a-uuid",
					amount: -10,
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(false);
			expect(result.testCases[0].error).toBeDefined();
			expect(result.testCases[0].error).toContain("Auto-validation failed");
			expect(result.testCases[0].error).toContain("order-pub");
		});

		it("should pass when publishing valid payload", async () => {
			const broker = createInMemoryBroker();

			const publisher = new Publisher("order-pub", {
				adapter: createFakeMQAdapter(broker),
				schema: {
					"orders.created": OrderEventSchema,
				},
			});

			const scenario = new TestScenario({
				name: "Publisher valid publish test",
				components: [publisher],
			});

			const tc = testCase("valid publish passes auto-validation", (test) => {
				const pub = test.use(publisher);

				pub.publish("orders.created", {
					orderId: "550e8400-e29b-41d4-a716-446655440000",
					amount: 99.99,
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	// ============================================================
	// 6.16 Auto-validation on Subscriber incoming messages
	// ============================================================
	describe("6.16 Auto-validation on Subscriber", () => {
		it("should track error when incoming message fails auto-validation", async () => {
			const broker = createInMemoryBroker();

			const subscriber = new Subscriber("order-sub", {
				adapter: createFakeMQAdapter(broker),
				schema: {
					"orders.created": OrderEventSchema,
				},
			});

			const publisher = new Publisher("order-pub", {
				adapter: createFakeMQAdapter(broker),
			});

			const scenario = new TestScenario({
				name: "Subscriber auto-validate test",
				components: [subscriber, publisher],
			});

			const tc = testCase("invalid incoming message tracked as error", (test) => {
				const sub = test.use(subscriber);
				const pub = test.use(publisher);

				// Set up subscriber to wait for message
				sub.waitMessage("orders.created").timeout(2000);

				// Publish invalid data
				pub.publish("orders.created", {
					orderId: "not-a-uuid",
					amount: -10,
				});
			});

			const result = await scenario.run(tc);
			// Auto-validation error in subscriber callback drops the message and tracks error,
			// so waitMessage times out. The unhandled error also marks the test as failed.
			expect(result.passed).toBe(false);
		});
	});

	// ============================================================
	// 6.18 protoPath rename backward compatibility
	// ============================================================
	describe("6.18 protoPath rename", () => {
		it("should accept protoPath option on HTTP protocol", () => {
			const protocol = new HttpProtocol({ protoPath: "/path/to/openapi.yaml" });
			expect(protocol.getOptions().protoPath).toBe("/path/to/openapi.yaml");
		});

		it("should accept WebSocket protocol without protoPath", () => {
			const protocol = new WebSocketProtocol();
			expect(protocol.type).toBe("websocket");
		});
	});

	// ============================================================
	// 6.19 Auto-validation on async components
	// ============================================================
	describe("6.19 Auto-validation on async components", () => {
		it("should auto-validate outgoing messages on AsyncClient", async () => {
			const port = getNextPort();

			const wsSchema = {
				clientMessages: {
					sendChat: ChatMessageSchema,
				},
				serverMessages: {
					chatResponse: ChatResponseSchema,
				},
			};

			const server = new AsyncServer("ws-server", {
				protocol: new WebSocketProtocol(),
				listenAddress: { host: "127.0.0.1", port },
			});

			const client = new AsyncClient("ws-client", {
				autoConnect: true,
				protocol: new WebSocketProtocol({ schema: wsSchema }),
				targetAddress: { host: "127.0.0.1", port },
			});

			const scenario = new TestScenario({
				name: "AsyncClient auto-validate outgoing",
				components: [server, client],
			});

			const tc = testCase("invalid outgoing message fails", (test) => {
				const api = test.use(client);

				// Send message with empty text (min 1 char required)
				api.sendMessage("sendChat", { text: "", roomId: "room-1" });
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(false);
			expect(result.testCases[0].error).toBeDefined();
			expect(result.testCases[0].error).toContain("Auto-validation failed");
		});

		it("should auto-validate valid outgoing messages on AsyncClient", async () => {
			const port = getNextPort();

			const wsSchema = {
				clientMessages: {
					sendChat: ChatMessageSchema,
				},
				serverMessages: {
					chatResponse: ChatResponseSchema,
				},
			};

			const server = new AsyncServer("ws-server", {
				protocol: new WebSocketProtocol(),
				listenAddress: { host: "127.0.0.1", port },
			});

			const client = new AsyncClient("ws-client", {
				autoConnect: true,
				protocol: new WebSocketProtocol({ schema: wsSchema }),
				targetAddress: { host: "127.0.0.1", port },
			});

			const scenario = new TestScenario({
				name: "AsyncClient auto-validate valid outgoing",
				components: [server, client],
			});

			const tc = testCase("valid outgoing message passes", (test) => {
				const api = test.use(client);
				const mock = test.use(server);

				api.sendMessage("sendChat", { text: "hello", roomId: "room-1" });

				mock.onMessage("sendChat").mockEvent("chatResponse", (payload) => ({
					text: payload.text,
					userId: "user-1",
					timestamp: Date.now(),
				}));

				api.onEvent("chatResponse").assert((p) => p.userId === "user-1");
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should detect invalid outgoing events from AsyncServer via unhandled error", async () => {
			const port = getNextPort();

			const wsSchema = {
				clientMessages: {
					join: z.object({ roomId: z.string() }),
				},
				serverMessages: {
					welcome: z.object({ message: z.string().min(1), roomId: z.string() }),
				},
			};

			const server = new AsyncServer("ws-server", {
				protocol: new WebSocketProtocol({ schema: wsSchema }),
				listenAddress: { host: "127.0.0.1", port },
			});

			const client = new AsyncClient("ws-client", {
				autoConnect: true,
				protocol: new WebSocketProtocol(),
				targetAddress: { host: "127.0.0.1", port },
			});

			const scenario = new TestScenario({
				name: "AsyncServer auto-validate outgoing event",
				components: [server, client],
			});

			const tc = testCase("invalid server event tracked as error", (test) => {
				const api = test.use(client);
				const mock = test.use(server);

				api.sendMessage("join", { roomId: "room-1" });

				// Server responds with empty message (fails min(1) on welcome schema)
				mock.onMessage("join").mockEvent("welcome", () => ({
					message: "",
					roomId: "room-1",
				}));

				// Use waitEvent with timeout - event won't arrive because server
				// auto-validation fails on outgoing event
				api.waitEvent("welcome").timeout(1000);
			});

			const result = await scenario.run(tc);
			// The mockEvent handler on the server throws a ValidationError because the
			// outgoing event payload ("") fails the schema. Error is tracked as unhandled.
			expect(result.passed).toBe(false);
		});
	});
});
