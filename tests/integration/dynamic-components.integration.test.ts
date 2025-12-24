/**
 * Dynamic Component Creation Integration Tests
 *
 * Tests for creating components dynamically in init() and testCase()
 * using real protocol adapters.
 */

import { describe, expect, it } from "vitest";
import { TestScenario, testCase, Server, Client, HttpAdapter } from "testurio";

describe("Dynamic Component Creation Integration", () => {
	describe("addComponent in init()", () => {
		it("should create HTTP mock and client in init and use them in test", async () => {
			const scenario = new TestScenario({
				name: "Dynamic HTTP Components Test",
				components: [],
			});

			scenario.init((test) => {
				test.addComponent(new Server("backend", {
					adapter: new HttpAdapter(),
					listenAddress: { host: "127.0.0.1", port: 7001 },
				}));
				test.addComponent(new Client("api", {
					adapter: new HttpAdapter(),
					targetAddress: { host: "127.0.0.1", port: 7001 },
				}));
			});

			let responseData!: { created: string };

			const tc = testCase("Use dynamically created components", (test) => {
				const api = test.client("api");
				const backend = test.server("backend");

				api.request("getDynamic", { method: "GET", path: "/dynamic" });
				backend.onRequest("getDynamic", { method: "GET", path: "/dynamic" }).mockResponse(() => ({
					status: 200,
					headers: {},
					body: { created: "dynamically" },
				}));
				api.onResponse<{ created: string }>("getDynamic").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(responseData).toMatchObject({ created: "dynamically" });
		});

		it("should allow init components to be used across multiple test cases", async () => {
			const scenario = new TestScenario({
				name: "Shared Dynamic Components Test",
				components: [],
			});

			scenario.init((test) => {
				test.addComponent(new Server("shared-backend", {
					adapter: new HttpAdapter(),
					listenAddress: { host: "127.0.0.1", port: 7002 },
				}));
				test.addComponent(new Client("shared-api", {
					adapter: new HttpAdapter(),
					targetAddress: { host: "127.0.0.1", port: 7002 },
				}));
			});

			const responses: Array<{ request: number }> = [];

			const tc1 = testCase("First request", (test) => {
				const api = test.client("shared-api");
				const backend = test.server("shared-backend");

				api.request("getFirst", { method: "GET", path: "/first" });
				backend.onRequest("getFirst", { method: "GET", path: "/first" }).mockResponse(() => ({
					status: 200,
					headers: {},
					body: { request: 1 },
				}));
				api.onResponse<{ request: number }>("getFirst").assert((res) => {
					responses.push(res);
					return true;
				});
			});

			const tc2 = testCase("Second request", (test) => {
				const api = test.client("shared-api");
				const backend = test.server("shared-backend");

				api.request("getSecond", { method: "GET", path: "/second" });
				backend.onRequest("getSecond", { method: "GET", path: "/second" }).mockResponse(() => ({
					status: 200,
					headers: {},
					body: { request: 2 },
				}));
				api.onResponse<{ request: number }>("getSecond").assert((res) => {
					responses.push(res);
					return true;
				});
			});

			const result = await scenario.run([tc1, tc2]);

			expect(result.passed).toBe(true);
			expect(responses).toHaveLength(2);
			expect(responses[0]).toMatchObject({ request: 1 });
			expect(responses[1]).toMatchObject({ request: 2 });
		});
	});

	describe("addComponent in testCase()", () => {
		it("should create and use components within a single test case", async () => {
			const scenario = new TestScenario({
				name: "TestCase Dynamic Components Test",
				components: [],
			});

			let responseData!: { id: number; status: string };

			const tc = testCase("Create and use components in test", (test) => {
				test.addComponent(new Server("test-backend", {
					adapter: new HttpAdapter(),
					listenAddress: { host: "127.0.0.1", port: 7003 },
				}));
				test.addComponent(new Client("test-api", {
					adapter: new HttpAdapter(),
					targetAddress: { host: "127.0.0.1", port: 7003 },
				}));

				const api = test.client("test-api");
				const backend = test.server("test-backend");

				api.request("postData", { method: "POST", path: "/data" });
				backend.onRequest("postData", { method: "POST", path: "/data" }).mockResponse(() => ({
					status: 201,
					headers: {},
					body: { id: 123, status: "created" },
				}));
				api.onResponse<{ id: number; status: string }>("postData").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(responseData).toMatchObject({ id: 123, status: "created" });
		});

		it("should cleanup testCase-scoped components and allow reuse of names", async () => {
			const scenario = new TestScenario({
				name: "TestCase Scope Cleanup Test",
				components: [],
			});

			const responses: Array<{ test: number }> = [];

			const tc1 = testCase("First test with scoped component", (test) => {
				test.addComponent(new Server("temp-backend", {
					adapter: new HttpAdapter(),
					listenAddress: { host: "127.0.0.1", port: 7004 },
				}), { scope: "testCase" });
				test.addComponent(new Client("temp-api", {
					adapter: new HttpAdapter(),
					targetAddress: { host: "127.0.0.1", port: 7004 },
				}), { scope: "testCase" });

				const api = test.client("temp-api");
				const backend = test.server("temp-backend");

				api.request("getTest1", { method: "GET", path: "/test1" });
				backend.onRequest("getTest1", { method: "GET", path: "/test1" }).mockResponse(() => ({
					status: 200,
					headers: {},
					body: { test: 1 },
				}));
				api.onResponse<{ test: number }>("getTest1").assert((res) => {
					responses.push(res);
					return true;
				});
			});

			const tc2 = testCase("Second test reusing component names", (test) => {
				// Can reuse same names because previous components were cleaned up
				test.addComponent(new Server("temp-backend", {
					adapter: new HttpAdapter(),
					listenAddress: { host: "127.0.0.1", port: 7005 },
				}), { scope: "testCase" });
				test.addComponent(new Client("temp-api", {
					adapter: new HttpAdapter(),
					targetAddress: { host: "127.0.0.1", port: 7005 },
				}), { scope: "testCase" });

				const api = test.client("temp-api");
				const backend = test.server("temp-backend");

				api.request("getTest2", { method: "GET", path: "/test2" });
				backend.onRequest("getTest2", { method: "GET", path: "/test2" }).mockResponse(() => ({
					status: 200,
					headers: {},
					body: { test: 2 },
				}));
				api.onResponse<{ test: number }>("getTest2").assert((res) => {
					responses.push(res);
					return true;
				});
			});

			const result = await scenario.run([tc1, tc2]);

			expect(result.passed).toBe(true);
			expect(responses).toHaveLength(2);
			expect(responses[0]).toMatchObject({ test: 1 });
			expect(responses[1]).toMatchObject({ test: 2 });
		});
	});

	describe("mixed static and dynamic components", () => {
		it("should work with both static and dynamic components", async () => {
			const scenario = new TestScenario({
				name: "Mixed Components Test",
				components: [],
			});

			scenario.init((test) => {
				test.addComponent(new Server("static-backend", {
					adapter: new HttpAdapter(),
					listenAddress: { host: "127.0.0.1", port: 7006 },
				}));
				test.addComponent(new Client("dynamic-api", {
					adapter: new HttpAdapter(),
					targetAddress: { host: "127.0.0.1", port: 7006 },
				}));
			});

			let responseData!: { static: boolean; dynamic: boolean };

			const tc = testCase("Use static mock with dynamic client", (test) => {
				const api = test.client("dynamic-api");
				const backend = test.server("static-backend");

				api.request("getMixed", { method: "GET", path: "/mixed" });
				backend.onRequest("getMixed", { method: "GET", path: "/mixed" }).mockResponse(() => ({
					status: 200,
					headers: {},
					body: { static: true, dynamic: true },
				}));
				api.onResponse<{ static: boolean; dynamic: boolean }>("getMixed").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(responseData).toMatchObject({ static: true, dynamic: true });
		});
	});
});
