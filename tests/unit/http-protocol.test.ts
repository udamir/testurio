/**
 * HTTP Protocol Tests
 *
 * Tests for the Protocol API.
 * The HttpProtocol uses:
 * - startServer() / stopServer() without handles
 * - createClient() / closeClient() without handles
 * - setRequestHandler() for request handling
 * - request() for making requests
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HttpProtocol } from "testurio";

// Use different ports for each test to avoid conflicts
let portCounter = 9100;
function getNextPort(): number {
	return portCounter++;
}

describe("HttpAdapter (Protocol API)", () => {
	let adapter: HttpProtocol;

	beforeEach(() => {
		adapter = new HttpProtocol();
	});

	afterEach(async () => {
		// Clean up
		if (adapter.server.isRunning) {
			await adapter.stopServer();
		}
		if (adapter.client.isConnected) {
			await adapter.closeClient();
		}
	});

	describe("type", () => {
		it("should have correct type", () => {
			expect(adapter.type).toBe("http");
		});
	});

	describe("server lifecycle", () => {
		it("should start and stop a server", async () => {
			const port = getNextPort();

			await adapter.startServer({
				listenAddress: { host: "localhost", port },
			});

			expect(adapter.server.isRunning).toBe(true);
			expect(adapter.server.ref).toBeDefined();

			await adapter.stopServer();

			expect(adapter.server.isRunning).toBe(false);
		});

		it("should handle stopServer when not running", async () => {
			// Should not throw
			await adapter.stopServer();
			expect(adapter.server.isRunning).toBe(false);
		});
	});

	describe("client lifecycle", () => {
		it("should create and close a client", async () => {
			await adapter.createClient({
				targetAddress: { host: "localhost", port: 3000 },
			});

			expect(adapter.client.isConnected).toBe(true);
			expect(adapter.client.ref).toBe("http://localhost:3000");

			await adapter.closeClient();

			expect(adapter.client.isConnected).toBe(false);
		});

		it("should use https for TLS", async () => {
			await adapter.createClient({
				targetAddress: { host: "localhost", port: 443 },
				tls: { enabled: true },
			});

			expect(adapter.client.ref).toBe("https://localhost:443");
		});
	});

	describe("setRequestHandler", () => {
		it("should set request handler before starting server", async () => {
			const port = getNextPort();
			let handlerCalled = false;

			adapter.setRequestHandler(async () => {
				handlerCalled = true;
				return { code: 200, body: { ok: true } };
			});

			await adapter.startServer({
				listenAddress: { host: "localhost", port },
			});

			// Make a request to trigger the handler
			await adapter.createClient({
				targetAddress: { host: "localhost", port },
			});

			const response = await adapter.request("test", {
				method: "GET",
				path: "/test",
			});

			expect(handlerCalled).toBe(true);
			expect(response.code).toBe(200);
			expect(response.body).toEqual({ ok: true });
		});
	});

	describe("request/response flow", () => {
		it("should make GET request and receive response", async () => {
			const port = getNextPort();

			adapter.setRequestHandler(async (type, req) => {
				if (type === "GET /users" && req.method === "GET" && req.path === "/users") {
					return {
						code: 200,
						headers: { "content-type": "application/json" },
						body: [{ id: 1, name: "Alice" }],
					};
				}
				return null;
			});

			await adapter.startServer({ listenAddress: { host: "localhost", port } });
			await adapter.createClient({ targetAddress: { host: "localhost", port } });

			const response = await adapter.request<{ id: number; name: string }[]>("getUsers", {
				method: "GET",
				path: "/users",
			});

			expect(response.code).toBe(200);
			expect(response.body).toEqual([{ id: 1, name: "Alice" }]);
		});

		it("should make POST request with body", async () => {
			const port = getNextPort();
			let receivedBody: unknown;

			adapter.setRequestHandler(async (type, req) => {
				if (type === "POST /users" && req.method === "POST" && req.path === "/users") {
					receivedBody = req.body;
					return {
						code: 201,
						body: { id: 2, ...req.body as object },
					};
				}
				return null;
			});

			await adapter.startServer({ listenAddress: { host: "localhost", port } });
			await adapter.createClient({ targetAddress: { host: "localhost", port } });

			const response = await adapter.request<{ id: number; name: string; email: string }>("createUser", {
				method: "POST",
				path: "/users",
				body: { name: "Bob", email: "bob@example.com" },
			});

			expect(response.code).toBe(201);
			expect(response.body).toMatchObject({ id: 2, name: "Bob", email: "bob@example.com" });
			expect(receivedBody).toEqual({ name: "Bob", email: "bob@example.com" });
		});

		it("should return error body when no handler matches", async () => {
			const port = getNextPort();

			// No handler set - should return error body
			await adapter.startServer({ listenAddress: { host: "localhost", port } });
			await adapter.createClient({ targetAddress: { host: "localhost", port } });

			const response = await adapter.request<{ error: string }>("unknown", {
				method: "GET",
				path: "/unknown",
			});

			expect(response.code).toBe(404);
			expect(response.body?.error).toBe("Not Found");
		});

		it("should return error body when handler returns null", async () => {
			const port = getNextPort();

			adapter.setRequestHandler(async () => null);

			await adapter.startServer({ listenAddress: { host: "localhost", port } });
			await adapter.createClient({ targetAddress: { host: "localhost", port } });

			const response = await adapter.request<{ error: string }>("test", {
				method: "GET",
				path: "/test",
			});

			expect(response.code).toBe(404);
			expect(response.body?.error).toBe("Not Found");
		});
	});

	describe("respond", () => {
		it("should send response with custom status code", async () => {
			const port = getNextPort();

			adapter.setRequestHandler(async () => {
				return {
					code: 418,
					headers: { "x-custom": "teapot" },
					body: { message: "I'm a teapot" },
				};
			});

			await adapter.startServer({ listenAddress: { host: "localhost", port } });
			await adapter.createClient({ targetAddress: { host: "localhost", port } });

			const response = await adapter.request<{ message: string }>("teapot", {
				method: "GET",
				path: "/teapot",
			});

			expect(response.code).toBe(418);
			expect(response.headers?.["x-custom"]).toBe("teapot");
			expect(response.body?.message).toBe("I'm a teapot");
		});
	});

	describe("error handling", () => {
		it("should throw when requesting without client connection", async () => {
			await expect(
				adapter.request("test", { method: "GET", path: "/test" }),
			).rejects.toThrow("Client is not connected");
		});

		it("should throw when request missing method or path", async () => {
			await adapter.createClient({
				targetAddress: { host: "localhost", port: 3000 },
			});

			await expect(
				adapter.request("test"),
			).rejects.toThrow("HTTP request requires method and path");
		});
	});

	describe("dispose", () => {
		it("should clean up resources", async () => {
			const port = getNextPort();

			await adapter.startServer({ listenAddress: { host: "localhost", port } });
			await adapter.createClient({ targetAddress: { host: "localhost", port } });

			await adapter.dispose();

			// After dispose, server and client should be cleaned up
			expect(adapter.server.isRunning).toBe(false);
			expect(adapter.client.isConnected).toBe(false);
		});
	});
});
