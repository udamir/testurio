/**
 * HTTP Protocol Integration Tests
 *
 * Tests HTTP adapter edge cases and error scenarios.
 */

import { Client, HttpProtocol, Server, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";

// ============================================================================
// Type Definitions
// ============================================================================

interface TestApiService {
	getResource: {
		request: { method: "GET"; path: "/resource/{id}"; headers?: { Authorization: string; "X-Custom-Header": string } };
		response: { code: 200; body: { id: string; data: string } };
	};
	createResource: {
		request: { method: "POST"; path: "/resource"; body: { data: string } };
		response: { code: 201; body: { id: string; data: string } };
	};
	updateResource: {
		request: { method: "PUT"; path: "/resource/{id}"; body: { data: string } };
		response: { code: 200; body: { id: string; data: string } };
	};
	deleteResource: {
		request: { method: "DELETE"; path: "/resource/{id}" };
		response: { code: 200; body: { message: string } };
	};
	notFound: {
		request: { method: "GET"; path: "/missing" };
		response: { code: 404; body: { error: string } };
	};
	serverError: {
		request: { method: "GET"; path: "/error" };
		response: { code: 500; body: { error: string } };
	};
}

// Port counter for this test file (21xxx range)
let portCounter = 21000;
function getNextPort(): number {
	return portCounter++;
}

// ============================================================================
// HTTP Protocol Tests
// ============================================================================

describe("HTTP Protocol Integration Tests", () => {
	describe("Basic HTTP Methods", () => {
		it("should handle GET request", async () => {
			const port = getNextPort();

			const server = new Server("backend", {
				protocol: new HttpProtocol<TestApiService>(),
				listenAddress: { host: "localhost", port },
			});

			const client = new Client("api", {
				protocol: new HttpProtocol<TestApiService>(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "HTTP GET Test",
				components: [server, client],
			});

			scenario.init((test) => {
				test
					.use(server)
					.onRequest("getResource", { method: "GET", path: "/resource/123" })
					.mockResponse(() => ({
						code: 200,
						body: { id: "123", data: "test data" },
					}));
			});

			const tc = testCase("GET request", (test) => {
				const api = test.use(client);

				api.request("getResource", { method: "GET", path: "/resource/123" });
				api.onResponse("getResource").assert((res) => {
					return res.code === 200 && res.body.id === "123";
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should handle POST request with body", async () => {
			const port = getNextPort();

			const server = new Server("backend", {
				protocol: new HttpProtocol<TestApiService>(),
				listenAddress: { host: "localhost", port },
			});

			const client = new Client("api", {
				protocol: new HttpProtocol<TestApiService>(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "HTTP POST Test",
				components: [server, client],
			});

			let receivedBody: { data: string } | undefined;

			scenario.init((test) => {
				test
					.use(server)
					.onRequest("createResource", { method: "POST", path: "/resource" })
					.mockResponse((req) => {
						receivedBody = req.body as { data: string };
						return {
							code: 201,
							body: { id: "new-id", data: receivedBody?.data ?? "" },
						};
					});
			});

			const tc = testCase("POST request with body", (test) => {
				const api = test.use(client);

				api.request("createResource", {
					method: "POST",
					path: "/resource",
					body: { data: "new resource" },
				});
				api.onResponse("createResource").assert((res) => {
					return res.code === 201 && res.body.data === "new resource";
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(receivedBody?.data).toBe("new resource");
		});

		it("should handle PUT request", async () => {
			const port = getNextPort();

			const server = new Server("backend", {
				protocol: new HttpProtocol<TestApiService>(),
				listenAddress: { host: "localhost", port },
			});

			const client = new Client("api", {
				protocol: new HttpProtocol<TestApiService>(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "HTTP PUT Test",
				components: [server, client],
			});

			scenario.init((test) => {
				test
					.use(server)
					.onRequest("updateResource", { method: "PUT", path: "/resource/{id}" })
					.mockResponse((req) => ({
						code: 200,
						body: { id: "456", data: req.body.data },
					}));
			});

			const tc = testCase("PUT request", (test) => {
				const api = test.use(client);

				api.request("updateResource", {
					method: "PUT",
					path: "/resource/456",
					body: { data: "updated" },
				});
				api.onResponse("updateResource").assert((res) => {
					return res.code === 200 && res.body.data === "updated";
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should handle DELETE request", async () => {
			const port = getNextPort();
			let deleteReceived = false;
			let capturedReq: unknown = null;

			const server = new Server("backend", {
				protocol: new HttpProtocol<TestApiService>(),
				listenAddress: { host: "localhost", port },
			});

			const client = new Client("api", {
				protocol: new HttpProtocol<TestApiService>(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "HTTP DELETE Test",
				components: [server, client],
			});

			scenario.init((test) => {
				test
					.use(server)
					.onRequest("deleteResource", { method: "DELETE", path: "/resource/{id}" })
					.mockResponse((req) => {
						deleteReceived = true;
						capturedReq = req;
						const id = req.params?.id ?? "unknown";
						// Use 200 instead of 204 because 204 No Content shouldn't have a body
						return { code: 200, body: { message: `Resource ${id} deleted` } };
					});
			});

			const tc = testCase("DELETE request", (test) => {
				const api = test.use(client);

				api.request("deleteResource", { method: "DELETE", path: "/resource/789" });
				api
					.onResponse("deleteResource")
					.assert((res) => res.code === 200 && res.body.message === "Resource 789 deleted");
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(deleteReceived).toBe(true);
			expect(capturedReq).not.toBeNull();
			expect((capturedReq as { params?: { id: string } })?.params?.id).toBe("789");
		});
	});

	describe("Error Status Codes", () => {
		it("should handle 404 Not Found", async () => {
			const port = getNextPort();

			const server = new Server("backend", {
				protocol: new HttpProtocol<TestApiService>(),
				listenAddress: { host: "localhost", port },
			});

			const client = new Client("api", {
				protocol: new HttpProtocol<TestApiService>(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "HTTP 404 Test",
				components: [server, client],
			});

			scenario.init((test) => {
				test
					.use(server)
					.onRequest("notFound", { method: "GET", path: "/missing" })
					.mockResponse(() => ({
						code: 404,
						body: { error: "Resource not found" },
					}));
			});

			const tc = testCase("404 response", (test) => {
				const api = test.use(client);

				api.request("notFound", { method: "GET", path: "/missing" });
				api.onResponse("notFound").assert((res) => {
					return res.code === 404 && res.body.error === "Resource not found";
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should handle 500 Server Error", async () => {
			const port = getNextPort();

			const server = new Server("backend", {
				protocol: new HttpProtocol<TestApiService>(),
				listenAddress: { host: "localhost", port },
			});

			const client = new Client("api", {
				protocol: new HttpProtocol<TestApiService>(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "HTTP 500 Test",
				components: [server, client],
			});

			scenario.init((test) => {
				test
					.use(server)
					.onRequest("serverError", { method: "GET", path: "/error" })
					.mockResponse(() => ({
						code: 500,
						body: { error: "Internal server error" },
					}));
			});

			const tc = testCase("500 response", (test) => {
				const api = test.use(client);

				api.request("serverError", { method: "GET", path: "/error" });
				api.onResponse("serverError").assert((res) => {
					return res.code === 500;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Headers", () => {
		it("should pass custom headers in request", async () => {
			const port = getNextPort();
			let receivedHeaders: Record<string, string | undefined> | undefined;

			const server = new Server("backend", {
				protocol: new HttpProtocol<TestApiService>(),
				listenAddress: { host: "localhost", port },
			});

			const client = new Client("api", {
				protocol: new HttpProtocol<TestApiService>(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "HTTP Headers Test",
				components: [server, client],
			});

			scenario.init((test) => {
				test
					.use(server)
					.onRequest("getResource", { method: "GET", path: "/resource/1" })
					.mockResponse((req) => {
						receivedHeaders = req.headers;
						return {
							code: 200,
							body: { id: "1", data: "with headers" },
						};
					});
			});

			const tc = testCase("Request with custom headers", (test) => {
				const api = test.use(client);

				api.request("getResource", {
					method: "GET",
					path: "/resource/1",
					headers: {
						Authorization: "Bearer token123",
						"X-Custom-Header": "custom-value",
					},
				});
				api.onResponse("getResource").assert((res) => res.code === 200);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(receivedHeaders).toBeDefined();
			// HTTP headers are case-insensitive, Node.js lowercases them
			expect(receivedHeaders?.authorization ?? receivedHeaders?.Authorization).toBe("Bearer token123");
			expect(receivedHeaders?.["x-custom-header"] ?? receivedHeaders?.["X-Custom-Header"]).toBe("custom-value");
		});

		it("should return custom headers in response", async () => {
			const port = getNextPort();

			const server = new Server("backend", {
				protocol: new HttpProtocol<TestApiService>(),
				listenAddress: { host: "localhost", port },
			});

			const client = new Client("api", {
				protocol: new HttpProtocol<TestApiService>(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "HTTP Response Headers Test",
				components: [server, client],
			});

			scenario.init((test) => {
				test
					.use(server)
					.onRequest("getResource", { method: "GET", path: "/resource/2" })
					.mockResponse(() => ({
						code: 200,
						headers: {
							"Content-Type": "application/json",
							"X-Response-Id": "resp-123",
						},
						body: { id: "2", data: "response headers" },
					}));
			});

			const tc = testCase("Response with custom headers", (test) => {
				const api = test.use(client);

				api.request("getResource", { method: "GET", path: "/resource/2" });
				api.onResponse("getResource").assert((res) => {
					return res.code === 200;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Request Timeout", () => {
		it("should timeout on slow response", async () => {
			const port = getNextPort();

			const server = new Server("backend", {
				protocol: new HttpProtocol<TestApiService>(),
				listenAddress: { host: "localhost", port },
			});

			const client = new Client("api", {
				protocol: new HttpProtocol<TestApiService>(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "HTTP Timeout Test",
				components: [server, client],
			});

			scenario.init((test) => {
				test
					.use(server)
					.onRequest("getResource", { method: "GET", path: "/resource/slow" })
					.delay(2000)
					.mockResponse(() => ({
						code: 200,
						body: { id: "slow", data: "delayed response" },
					}));
			});

			const tc = testCase("Request times out", (test) => {
				const api = test.use(client);

				api.request("getResource", {
					method: "GET",
					path: "/resource/slow",
				});
				api
					.onResponse("getResource")
					.timeout(500)
					.assert((res) => res.code === 200);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(false);
		});
	});

	describe("Multiple Requests", () => {
		it("should handle request-response cycle", async () => {
			const port = getNextPort();
			let requestCount = 0;

			const server = new Server("backend", {
				protocol: new HttpProtocol<TestApiService>(),
				listenAddress: { host: "localhost", port },
			});

			const client = new Client("api", {
				protocol: new HttpProtocol<TestApiService>(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "HTTP Request Cycle Test",
				components: [server, client],
			});

			scenario.init((test) => {
				test
					.use(server)
					.onRequest("getResource", { method: "GET", path: "/resource/test" })
					.mockResponse(() => {
						requestCount++;
						return {
							code: 200,
							body: { id: "test", data: `request-${requestCount}` },
						};
					});
			});

			const tc = testCase("Request-response cycle", (test) => {
				const api = test.use(client);

				api.request("getResource", { method: "GET", path: "/resource/test" });
				api.onResponse("getResource").assert((res) => res.code === 200 && res.body.id === "test");
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
			expect(requestCount).toBe(1);
		});
	});
});
