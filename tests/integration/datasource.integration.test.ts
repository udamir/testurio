/**
 * DataSource Integration Tests
 *
 * Tests DataSource component integration with TestScenario and network components.
 */

import { Client, DataSource, HttpProtocol, Server, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";
import { createFakeAdapter, createInMemoryClient } from "../mocks/fakeDSAdapter";

// Service definition for typed HTTP requests
interface TestServiceDef {
	getUser: {
		request: { method: "GET"; path: "/users/1" };
		response: { code: 200; body: { id: number; name: string } };
	};
	getData: {
		request: { method: "GET"; path: "/data" };
		response: { code: 200; body: { value: number } };
	};
}

describe("DataSource Integration", () => {
	// Port allocation: 14xxx range for DataSource integration tests
	const PORT_BASE = 14000;
	let portCounter = PORT_BASE;
	const getPort = () => portCounter++;

	describe("TestScenario lifecycle", () => {
		it("should start and stop DataSource with TestScenario", async () => {
			const client = createInMemoryClient();
			const adapter = createFakeAdapter(client);
			const db = new DataSource("db", { adapter });

			const scenario = new TestScenario({
				name: "Lifecycle Test",
				components: [db],
			});

			const tc = testCase("test lifecycle", (test) => {
				const store = test.use(db);
				store.exec(async (c) => {
					c.set("key", "value");
				});
			});

			expect(db.isStarted()).toBe(false);

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(client.get("key")).toBe("value");
			expect(db.isStopped()).toBe(true);
		});

		it("should start DataSource before network components", async () => {
			const port = getPort();
			const startOrder: string[] = [];

			const adapter = createFakeAdapter(createInMemoryClient(), {
				onInit: () => {
					startOrder.push("db");
				},
			});
			const db = new DataSource("db", { adapter });

			const server = new Server("api", {
				protocol: new HttpProtocol(),
				listenAddress: { host: "localhost", port },
			});

			// Patch server start to track order
			const originalStart = server.start.bind(server);
			server.start = async () => {
				startOrder.push("server");
				return originalStart();
			};

			const scenario = new TestScenario({
				name: "Start Order Test",
				components: [db, server],
			});

			const tc = testCase("test start order", () => {
				// Empty test
			});

			await scenario.run(tc);

			// DataSource (non-network) should start before Server (network)
			expect(startOrder[0]).toBe("db");
			expect(startOrder[1]).toBe("server");
		});
	});

	describe("Step execution with network components", () => {
		it("should execute DataSource steps in order with HTTP requests", async () => {
			const port = getPort();
			const executionOrder: string[] = [];

			const client = createInMemoryClient();
			const adapter = createFakeAdapter(client);
			const db = new DataSource("db", { adapter });

			const server = new Server("api", {
				protocol: new HttpProtocol<TestServiceDef>(),
				listenAddress: { host: "localhost", port },
			});

			const httpClient = new Client("client", {
				protocol: new HttpProtocol<TestServiceDef>(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "Execution Order Test",
				components: [db, server, httpClient],
			});

			const tc = testCase("test execution order", (test) => {
				const store = test.use(db);
				const api = test.use(httpClient);
				const mock = test.use(server);

				// Setup: DataSource operation before HTTP
				store.exec("setup data", async (c) => {
					executionOrder.push("db:setup");
					c.set("user:1", { id: 1, name: "John" });
				});

				// HTTP request
				api.request("getUser", { method: "GET", path: "/users/1" });
				mock.onRequest("getUser", { method: "GET", path: "/users/1" }).mockResponse(() => {
					executionOrder.push("server:response");
					return { code: 200, body: { id: 1, name: "John" } };
				});
				api.onResponse("getUser").assert((res) => {
					executionOrder.push("client:assert");
					return res.code === 200;
				});

				// Verify: DataSource operation after HTTP
				store.exec("verify data", async (c) => {
					executionOrder.push("db:verify");
					return c.get("user:1");
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(executionOrder).toEqual(["db:setup", "server:response", "client:assert", "db:verify"]);
		});

		it("should interleave DataSource and HTTP operations", async () => {
			const port = getPort();
			const operations: string[] = [];

			const client = createInMemoryClient();
			const adapter = createFakeAdapter(client);
			const db = new DataSource("cache", { adapter });

			const server = new Server("api", {
				protocol: new HttpProtocol<TestServiceDef>(),
				listenAddress: { host: "localhost", port },
			});

			const httpClient = new Client("client", {
				protocol: new HttpProtocol<TestServiceDef>(),
				targetAddress: { host: "localhost", port },
			});

			const scenario = new TestScenario({
				name: "Interleave Test",
				components: [db, server, httpClient],
			});

			const tc = testCase("interleaved operations", (test) => {
				const cache = test.use(db);
				const api = test.use(httpClient);
				const mock = test.use(server);

				// 1. Check cache (miss)
				cache.exec(async (c) => {
					operations.push("cache:check:1");
					return c.get("data");
				});

				// 2. Make HTTP request and wait for response
				api.request("getData", { method: "GET", path: "/data" });
				mock.onRequest("getData", { method: "GET", path: "/data" }).mockResponse(() => {
					operations.push("http:request");
					return { code: 200, body: { value: 42 } };
				});
				// Must wait for response to ensure mock is called before cache operations
				api.onResponse("getData").assert((res) => res.code === 200);

				// 3. Cache the response
				cache.exec(async (c) => {
					operations.push("cache:set");
					c.set("data", { value: 42 });
				});

				// 4. Verify cache
				cache
					.exec(async (c) => {
						operations.push("cache:verify");
						return c.get("data");
					})
					.assert((result) => {
						const data = result as { value: number };
						return data.value === 42;
					});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(operations).toEqual(["cache:check:1", "http:request", "cache:set", "cache:verify"]);
		});
	});

	describe("Assertions", () => {
		it("should fail test when DataSource assertion fails", async () => {
			const client = createInMemoryClient();
			const adapter = createFakeAdapter(client);
			const db = new DataSource("db", { adapter });

			const scenario = new TestScenario({
				name: "Assertion Failure Test",
				components: [db],
			});

			const tc = testCase("should fail assertion", (test) => {
				test
					.use(db)
					.exec(async (c) => c.get("nonexistent"))
					.assert("value should exist", (result) => result !== null);
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(false);
			expect(result.testCases[0].error).toContain("Assertion failed");
			expect(result.testCases[0].error).toContain("value should exist");
		});

		it("should pass test when DataSource assertion passes", async () => {
			const client = createInMemoryClient();
			client.set("key", "value");
			const adapter = createFakeAdapter(client);
			const db = new DataSource("db", { adapter });

			const scenario = new TestScenario({
				name: "Assertion Pass Test",
				components: [db],
			});

			const tc = testCase("should pass assertion", (test) => {
				test
					.use(db)
					.exec(async (c) => c.get("key"))
					.assert("value should be 'value'", (result) => result === "value");
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
		});

		it("should support multiple chained assertions", async () => {
			const client = createInMemoryClient();
			client.set("user", { id: 1, name: "John", age: 30 });
			const adapter = createFakeAdapter(client);
			const db = new DataSource("db", { adapter });

			const scenario = new TestScenario({
				name: "Multiple Assertions Test",
				components: [db],
			});

			const tc = testCase("multiple assertions", (test) => {
				const store = test.use(db);

				store
					.exec(async (c) => c.get("user"))
					.assert("user should exist", (result) => result !== null)
					.assert("user should have id", (result) => {
						const user = result as { id: number };
						return user.id === 1;
					})
					.assert("user should have name", (result) => {
						const user = result as { name: string };
						return user.name === "John";
					});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
		});
	});

	describe("Error handling", () => {
		it("should handle DataSource exec error gracefully", async () => {
			const adapter = createFakeAdapter({
				failingOp: async () => {
					throw new Error("Database connection lost");
				},
			});
			const db = new DataSource("db", { adapter });

			const scenario = new TestScenario({
				name: "Error Handling Test",
				components: [db],
			});

			const tc = testCase("should handle error", (test) => {
				test.use(db).exec(async (c) => {
					const client = c as { failingOp: () => Promise<void> };
					return client.failingOp();
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(false);
			expect(result.testCases[0].error).toContain("Database connection lost");
		});

		it("should continue test scenario cleanup after error", async () => {
			const port = getPort();
			let serverStopped = false;
			let dbStopped = false;

			const adapter = createFakeAdapter(
				{
					fail: async () => {
						throw new Error("Test error");
					},
				},
				{
					onDispose: () => {
						dbStopped = true;
					},
				}
			);
			const db = new DataSource("db", { adapter });

			const server = new Server("api", {
				protocol: new HttpProtocol(),
				listenAddress: { host: "localhost", port },
			});

			// Patch server stop to track
			const originalStop = server.stop.bind(server);
			server.stop = async () => {
				serverStopped = true;
				return originalStop();
			};

			const scenario = new TestScenario({
				name: "Cleanup After Error Test",
				components: [db, server],
			});

			const tc = testCase("error during test", (test) => {
				test.use(db).exec(async (c) => {
					const client = c as { fail: () => Promise<void> };
					return client.fail();
				});
			});

			await scenario.run(tc);

			expect(serverStopped).toBe(true);
			expect(dbStopped).toBe(true);
		});
	});

	describe("Multiple DataSources", () => {
		it("should support multiple DataSource components", async () => {
			const cacheClient = createInMemoryClient();
			const dbClient = createInMemoryClient();

			const cache = new DataSource("cache", {
				adapter: createFakeAdapter(cacheClient),
			});

			const db = new DataSource("db", {
				adapter: createFakeAdapter(dbClient),
			});

			const scenario = new TestScenario({
				name: "Multiple DataSources Test",
				components: [cache, db],
			});

			const tc = testCase("use multiple datasources", (test) => {
				const redis = test.use(cache);
				const postgres = test.use(db);

				// Store in DB
				postgres.exec(async (c) => {
					c.set("user:1", { id: 1, name: "John" });
				});

				// Cache from DB
				redis.exec(async (c) => {
					const user = dbClient.get("user:1");
					c.set("cached:user:1", user);
				});

				// Verify cache
				redis
					.exec(async (c) => c.get("cached:user:1"))
					.assert((result) => {
						const user = result as { name: string };
						return user.name === "John";
					});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(cacheClient.get("cached:user:1")).toEqual({ id: 1, name: "John" });
		});
	});

	describe("Timeout handling", () => {
		it("should fail step when timeout exceeded", async () => {
			const client = createInMemoryClient();
			const adapter = createFakeAdapter(client);
			const db = new DataSource("db", { adapter });

			const scenario = new TestScenario({
				name: "Timeout Test",
				components: [db],
			});

			const tc = testCase("should timeout", (test) => {
				test.use(db).exec(
					"slow operation",
					async () => {
						await new Promise((resolve) => setTimeout(resolve, 200));
						return "done";
					},
					{ timeout: 50 }
				);
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(false);
			expect(result.testCases[0].error).toMatch(/timeout/i);
		});
	});

	describe("Step metadata", () => {
		it("should include exec description in step", async () => {
			const client = createInMemoryClient();
			client.set("key", "value");
			const adapter = createFakeAdapter(client);
			const db = new DataSource("db", { adapter });

			const scenario = new TestScenario({
				name: "Metadata Test",
				components: [db],
			});

			const tc = testCase("metadata test", (test) => {
				test
					.use(db)
					.exec("fetch from cache", async (c) => c.get("key"))
					.assert("value should exist", (result) => result !== null);
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			// The step description should contain the exec description
			expect(result.testCases[0].steps[0].description).toContain("fetch from cache");
		});
	});
});
