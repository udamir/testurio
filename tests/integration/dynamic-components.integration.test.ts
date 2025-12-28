/**
 * Dynamic Component Creation Integration Tests
 *
 * Tests for creating components dynamically in init() and testCase()
 * using real protocol adapters.
 */

import { describe, expect, it } from "vitest";
import { TestScenario, testCase, Server, Client, HttpAdapter } from "testurio";

// Type-safe HTTP service definition
interface HttpServiceDef {
	getDynamic: {
		request: { method: string; path: string; body?: never };
		responses: { 200: { body: { created: string } } };
	};
	getFirst: {
		request: { method: string; path: string; body?: never };
		responses: { 200: { body: { request: number } } };
	};
	getSecond: {
		request: { method: string; path: string; body?: never };
		responses: { 200: { body: { request: number } } };
	};
	postData: {
		request: { method: string; path: string; body?: never };
		responses: { 201: { body: { id: number; status: string } } };
	};
	getTest1: {
		request: { method: string; path: string; body?: never };
		responses: { 200: { body: { test: number } } };
	};
	getTest2: {
		request: { method: string; path: string; body?: never };
		responses: { 200: { body: { test: number } } };
	};
	getMixed: {
		request: { method: string; path: string; body?: never };
		responses: { 200: { body: { static: boolean; dynamic: boolean } } };
	};
	[key: string]: {
		request: { method: string; path: string; body?: unknown };
		responses: Record<number, { body?: unknown }>;
	};
}

describe("Dynamic Component Creation Integration", () => {
	describe("addComponent in init()", () => {
		it("should create HTTP mock and client in init and use them in test", async () => {
			const backendServer = new Server("backend", {
				protocol: new HttpAdapter<HttpServiceDef>(),
				listenAddress: { host: "127.0.0.1", port: 7001 },
			});
			const apiClient = new Client("api", {
				adapter: new HttpAdapter<HttpServiceDef>(),
				targetAddress: { host: "127.0.0.1", port: 7001 },
			});

			const scenario = new TestScenario({
				name: "Dynamic HTTP Components Test",
				components: [],
			});

			scenario.init((test) => {
				test.use(backendServer);
				test.use(apiClient);
			});

			let responseData: { created: string } | undefined;

			const tc = testCase("Use dynamically created components", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.request("getDynamic", { method: "GET", path: "/dynamic" });
				backend.onRequest("getDynamic", { method: "GET", path: "/dynamic" }).mockResponse(() => ({
					status: 200,
					headers: {},
					body: { created: "dynamically" },
				}));
				api.onResponse("getDynamic").assert((res) => {
					responseData = res;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(responseData).toMatchObject({ created: "dynamically" });
		});

		it("should allow init components to be used across multiple test cases", async () => {
			const backendServer = new Server("shared-backend", {
				protocol: new HttpAdapter<HttpServiceDef>(),
				listenAddress: { host: "127.0.0.1", port: 7002 },
			});
			const apiClient = new Client("shared-api", {
				adapter: new HttpAdapter<HttpServiceDef>(),
				targetAddress: { host: "127.0.0.1", port: 7002 },
			});

			const scenario = new TestScenario({
				name: "Shared Dynamic Components Test",
				components: [],
			});

			const responses: Array<{ request: number }> = [];

			const tc1 = testCase("First request", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.request("getFirst", { method: "GET", path: "/first" });
				backend.onRequest("getFirst", { method: "GET", path: "/first" }).mockResponse(() => ({
					status: 200,
					headers: {},
					body: { request: 1 },
				}));
				api.onResponse("getFirst").assert((res) => {
					responses.push(res);
					return true;
				});
			});

			const tc2 = testCase("Second request", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.request("getSecond", { method: "GET", path: "/second" });
				backend.onRequest("getSecond", { method: "GET", path: "/second" }).mockResponse(() => ({
					status: 200,
					headers: {},
					body: { request: 2 },
				}));
				api.onResponse("getSecond").assert((res) => {
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

			let responseData: { id: number; status: string } | undefined;

			const tc = testCase("Create and use components in test", (test) => {
				const backendServer = new Server("test-backend", {
					protocol: new HttpAdapter<HttpServiceDef>(),
					listenAddress: { host: "127.0.0.1", port: 7003 },
				});
				const apiClient = new Client("test-api", {
					adapter: new HttpAdapter<HttpServiceDef>(),
					targetAddress: { host: "127.0.0.1", port: 7003 },
				});

				test.use(backendServer);
				test.use(apiClient);

				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.request("postData", { method: "POST", path: "/data" });
				backend.onRequest("postData", { method: "POST", path: "/data" }).mockResponse(() => ({
					status: 201,
					headers: {},
					body: { id: 123, status: "created" },
				}));
				api.onResponse("postData").assert((res) => {
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
				const backendServer = new Server("temp-backend", {
					protocol: new HttpAdapter<HttpServiceDef>(),
					listenAddress: { host: "127.0.0.1", port: 7004 },
				});
				const apiClient = new Client("temp-api", {
					adapter: new HttpAdapter<HttpServiceDef>(),
					targetAddress: { host: "127.0.0.1", port: 7004 },
				});

				test.use(backendServer);
				test.use(apiClient);

				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.request("getTest1", { method: "GET", path: "/test1" });
				backend.onRequest("getTest1", { method: "GET", path: "/test1" }).mockResponse(() => ({
					status: 200,
					headers: {},
					body: { test: 1 },
				}));
				api.onResponse("getTest1").assert((res) => {
					responses.push(res);
					return true;
				});
			});

			const tc2 = testCase("Second test reusing component names", (test) => {
				const backendServer = new Server("temp-backend", {
					protocol: new HttpAdapter<HttpServiceDef>(),
					listenAddress: { host: "127.0.0.1", port: 7005 },
				});
				const apiClient = new Client("temp-api", {
					adapter: new HttpAdapter<HttpServiceDef>(),
					targetAddress: { host: "127.0.0.1", port: 7005 },
				});

				test.use(backendServer);
				test.use(apiClient);

				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.request("getTest2", { method: "GET", path: "/test2" });
				backend.onRequest("getTest2", { method: "GET", path: "/test2" }).mockResponse(() => ({
					status: 200,
					headers: {},
					body: { test: 2 },
				}));
				api.onResponse("getTest2").assert((res) => {
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
			const backendServer = new Server("static-backend", {
				protocol: new HttpAdapter<HttpServiceDef>(),
				listenAddress: { host: "127.0.0.1", port: 7006 },
			});
			const apiClient = new Client("dynamic-api", {
				adapter: new HttpAdapter<HttpServiceDef>(),
				targetAddress: { host: "127.0.0.1", port: 7006 },
			});

			const scenario = new TestScenario({
				name: "Mixed Components Test",
				components: [],
			});

			scenario.init((test) => {
				test.use(backendServer);
				test.use(apiClient);
			});

			let responseData: { static: boolean; dynamic: boolean } | undefined;

			const tc = testCase("Use static mock with dynamic client", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				api.request("getMixed", { method: "GET", path: "/mixed" });
				backend.onRequest("getMixed", { method: "GET", path: "/mixed" }).mockResponse(() => ({
					status: 200,
					headers: {},
					body: { static: true, dynamic: true },
				}));
				api.onResponse("getMixed").assert((res) => {
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
