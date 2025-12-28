/**
 * HTTP Adapter Tests
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHttpAdapter } from "testurio";
import { HttpAdapter } from "testurio";

// Use different ports for each test to avoid conflicts
let portCounter = 9000;
function getNextPort(): number {
	return portCounter++;
}

describe("HttpAdapter", () => {
	let adapter: HttpAdapter;

	beforeEach(() => {
		adapter = new HttpAdapter();
	});

	afterEach(() => {
		// Clean up any remaining servers/clients
	});

	describe("characteristics", () => {
		it("should have correct type", () => {
			expect(adapter.type).toBe("http");
		});

		it("should be sync protocol", () => {
			expect(adapter.characteristics.async).toBe(false);
		});

		it("should support proxy and mock", () => {
			expect(adapter.characteristics.supportsProxy).toBe(true);
			expect(adapter.characteristics.supportsMock).toBe(true);
		});
	});

	describe("startServer", () => {
		it("should start a mock server", async () => {
			const port = getNextPort();
			const handle = await adapter.startServer({
				listenAddress: { host: "localhost", port },
			});

			expect(handle).toBeDefined();
			expect(handle.id).toMatch(/^http-server-/);
			expect(handle.isRunning).toBe(true);
			expect(handle.address.host).toBe("localhost");
			expect(handle.address.port).toBe(port);

			await adapter.stopServer(handle);
		});

		it("should start a proxy server", async () => {
			const port = getNextPort();
			const handle = await adapter.startServer({
				listenAddress: { host: "localhost", port },
				targetAddress: { host: "api.example.com", port: 443 },
			});

			expect(handle).toBeDefined();
			expect(handle.isRunning).toBe(true);

			await adapter.stopServer(handle);
		});
	});

	describe("stopServer", () => {
		it("should stop a running server", async () => {
			const port = getNextPort();
			const handle = await adapter.startServer({
				listenAddress: { host: "localhost", port },
			});

			await adapter.stopServer(handle);

			expect(handle.isRunning).toBe(false);
		});

		it("should throw for unknown server", async () => {
			await expect(
				adapter.stopServer({
					id: "unknown-server",
					type: "http",
					address: { host: "localhost", port: 9999 },
					isRunning: true,
				}),
			).rejects.toThrow("Server unknown-server not found");
		});
	});

	describe("createClient", () => {
		it("should create a client", async () => {
			const handle = await adapter.createClient({
				targetAddress: { host: "api.example.com", port: 443 },
			});

			expect(handle).toBeDefined();
			expect(handle.id).toMatch(/^http-client-/);
			expect(handle.isConnected).toBe(true);
			expect(handle.address.host).toBe("api.example.com");

			await adapter.closeClient(handle);
		});
	});

	describe("closeClient", () => {
		it("should close a client", async () => {
			const handle = await adapter.createClient({
				targetAddress: { host: "api.example.com", port: 443 },
			});

			await adapter.closeClient(handle);

			expect(handle.isConnected).toBe(false);
		});

		it("should throw for unknown client", async () => {
			await expect(
				adapter.closeClient({
					id: "unknown-client",
					type: "http",
					address: { host: "localhost", port: 8080 },
					isConnected: true,
				}),
			).rejects.toThrow("Client unknown-client not found");
		});
	});

	describe("request", () => {
		it("should make request to mock server", async () => {
			const port = getNextPort();
			// Start mock server with onRequest callback
			const server = await adapter.startServer({
				listenAddress: { host: "localhost", port },
				onRequest: async (message) => {
					if (message.type === "GET /api/users") {
						return {
							type: "response",
							payload: { status: 200, headers: {}, body: [{ id: 1, name: "John" }] },
						};
					}
					return null;
				},
			});

			// Create client
			const client = await adapter.createClient({
				targetAddress: { host: "localhost", port },
			});

			// Make request with method/path in options
			const response = await adapter.request(client, "getUsers", {
				method: "GET",
				path: "/api/users",
			});

			expect(response).toEqual([{ id: 1, name: "John" }]);

			await adapter.closeClient(client);
			await adapter.stopServer(server);
		});

		it("should return 404 for unhandled path", async () => {
			const port = getNextPort();
			const server = await adapter.startServer({
				listenAddress: { host: "localhost", port },
			});

			const client = await adapter.createClient({
				targetAddress: { host: "localhost", port },
			});

			const response = await adapter.request<{ error: string }>(
				client,
				"getUnknown",
				{ method: "GET", path: "/unknown" },
			);

			expect(response.error).toContain("No handler");

			await adapter.closeClient(client);
			await adapter.stopServer(server);
		});
	});

	describe("onRequest callback", () => {
		it("should handle request via onRequest callback", async () => {
			const port = getNextPort();
			const server = await adapter.startServer({
				listenAddress: { host: "localhost", port },
				onRequest: async (message) => {
					if (message.type === "POST /api/orders") {
						return {
							type: "response",
							payload: { status: 201, headers: {}, body: { id: "order-123", item: "widget" } },
						};
					}
					return null;
				},
			});

			const client = await adapter.createClient({
				targetAddress: { host: "localhost", port },
			});

			const response = await adapter.request(client, "createOrder", {
				method: "POST",
				path: "/api/orders",
				payload: { item: "widget" },
			});

			expect(response).toMatchObject({ id: "order-123" });

			await adapter.closeClient(client);
			await adapter.stopServer(server);
		});

		it("should match path parameters via onRequest callback", async () => {
			const port = getNextPort();
			const server = await adapter.startServer({
				listenAddress: { host: "localhost", port },
				onRequest: async (message) => {
					// Match GET /api/users/* pattern
					if (message.type.startsWith("GET /api/users/")) {
						return {
							type: "response",
							payload: { status: 200, headers: {}, body: { id: "123", name: "John" } },
						};
					}
					return null;
				},
			});

			const client = await adapter.createClient({
				targetAddress: { host: "localhost", port },
			});

			const response = await adapter.request(client, "getUser", {
				method: "GET",
				path: "/api/users/123",
			});

			expect(response).toMatchObject({ id: "123", name: "John" });

			await adapter.closeClient(client);
			await adapter.stopServer(server);
		});
	});
});
