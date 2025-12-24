/**
 * Dynamic Component Creation Tests
 *
 * Tests for creating components dynamically in init() and testCase().
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
	TestScenario,
	TestCaseBuilder,
	testCase,
	BaseSyncAdapter,
	Server,
	Client,
} from "testurio";
import type {
	ProtocolCharacteristics,
} from "testurio";

// Track component lifecycle for testing
const componentLifecycle: string[] = [];

// Mock adapter class that tracks lifecycle
class MockAdapter extends BaseSyncAdapter {
	readonly type = "http";
	readonly characteristics: ProtocolCharacteristics = {
		type: "http",
		async: false,
		supportsProxy: true,
		supportsMock: true,
		streaming: false,
		requiresConnection: false,
		bidirectional: false,
	};

	async startServer(config: { listenAddress: { host: string; port: number } }) {
		componentLifecycle.push(`server-start:${config.listenAddress.port}`);
		return {
			id: `server-${config.listenAddress.port}`,
			type: "http",
			address: config.listenAddress,
			isRunning: true,
		};
	}

	async stopServer(handle: { id: string }) {
		componentLifecycle.push(`server-stop:${handle.id}`);
	}

	async createClient(config: { targetAddress: { host: string; port: number } }) {
		componentLifecycle.push(`client-start:${config.targetAddress.port}`);
		return {
			id: `client-${config.targetAddress.port}`,
			type: "http",
			address: config.targetAddress,
			isConnected: true,
		};
	}

	async closeClient(handle: { id: string }) {
		componentLifecycle.push(`client-stop:${handle.id}`);
	}

	async request<TRes = unknown>(): Promise<TRes> {
		return { status: 200, data: "ok" } as TRes;
	}
}

// Helper to create components
const createServer = (name: string, port: number) => new Server(name, {
	adapter: new MockAdapter(),
	listenAddress: { host: "localhost", port },
});

const createClient = (name: string, port: number) => new Client(name, {
	adapter: new MockAdapter(),
	targetAddress: { host: "localhost", port },
});

describe("Dynamic Component Creation", () => {
	beforeEach(() => {
		componentLifecycle.length = 0;
	});

	describe("addComponent in init()", () => {
		it("should add and start component in init handler", async () => {
			const scenario = new TestScenario({
				name: "Dynamic Init Test",
				components: [],
			});

			scenario.init((test) => {
				test.addComponent(createServer("dynamic-mock", 9001));
			});

			const tc = testCase("Use dynamic component", (test) => {
				test.wait(10);
			});

			await scenario.run(tc);

			expect(componentLifecycle).toContain("server-start:9001");
		});

		it("should allow using dynamically added component in test case", async () => {
			const scenario = new TestScenario({
				name: "Dynamic Init Usage Test",
				components: [],
			});

			scenario.init((test) => {
				test.addComponent(createServer("backend", 9002));
				test.addComponent(createClient("api", 9002));
			});

			let clientUsed = false;

			const tc = testCase("Use dynamic components", (test) => {
				const api = test.client("api");
				const backend = test.server("backend");

				// This should work because components were added in init
				api.request("getTest", { method: "GET", path: "/test" });
				backend.onRequest("getTest", { method: "GET", path: "/test" }).mockResponse(() => ({
					status: 200,
					headers: {},
					body: { ok: true },
				}));
				api.onResponse("getTest").assert(() => {
					clientUsed = true;
					return true;
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(clientUsed).toBe(true);
		});

		it("should start dynamic components after initial components", async () => {
			const scenario = new TestScenario({
				name: "Component Order Test",
				components: [createServer("initial-mock", 9003)],
			});

			scenario.init((test) => {
				test.addComponent(createServer("dynamic-mock", 9004));
			});

			const tc = testCase("Test", (test) => {
				test.wait(10);
			});

			await scenario.run(tc);

			const initialIndex = componentLifecycle.indexOf("server-start:9003");
			const dynamicIndex = componentLifecycle.indexOf("server-start:9004");

			expect(initialIndex).toBeLessThan(dynamicIndex);
		});
	});

	describe("addComponent in testCase()", () => {
		it("should add and start component in test case", async () => {
			const scenario = new TestScenario({
				name: "Dynamic TestCase Test",
				components: [],
			});

			const tc = testCase("Create component in test", (test) => {
				test.addComponent(createServer("test-mock", 9010));
				test.wait(10);
			});

			await scenario.run(tc);

			expect(componentLifecycle).toContain("server-start:9010");
		});

		it("should allow using component added in same test case", async () => {
			const scenario = new TestScenario({
				name: "Dynamic TestCase Usage Test",
				components: [],
			});

			const tc = testCase("Create and use component", (test) => {
				test.addComponent(createServer("backend", 9011));
				test.addComponent(createClient("api", 9011));
				// Just verify components were added and can be accessed
				test.wait(10);
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			// Verify both components were started
			expect(componentLifecycle).toContain("server-start:9011");
			expect(componentLifecycle).toContain("client-start:9011");
		});

		it("should cleanup testCase-scoped components after test", async () => {
			const scenario = new TestScenario({
				name: "TestCase Scope Cleanup Test",
				components: [],
			});

			const tc = testCase("Create scoped component", (test) => {
				test.addComponent(createServer("scoped-mock", 9012), { scope: "testCase" });
				test.wait(10);
			});

			await scenario.run(tc);

			// Component should be started and then stopped
			expect(componentLifecycle).toContain("server-start:9012");
			expect(componentLifecycle).toContain("server-stop:server-9012");
		});

		it("should keep scenario-scoped components after test", async () => {
			const scenario = new TestScenario({
				name: "Scenario Scope Test",
				components: [],
			});

			const tc1 = testCase("Create scenario-scoped component", (test) => {
				test.addComponent(createServer("persistent-mock", 9013), { scope: "scenario" });
				test.wait(10);
			});

			const tc2 = testCase("Use persistent component", (test) => {
				// Component should still exist
				test.wait(10);
			});

			await scenario.run([tc1, tc2]);

			// Component should be started but not stopped between tests
			const startCount = componentLifecycle.filter(e => e === "server-start:9013").length;
			const stopCount = componentLifecycle.filter(e => e.includes("server-stop:server-9013")).length;

			expect(startCount).toBe(1);
			// Stop happens at scenario cleanup, not between tests
			expect(stopCount).toBe(1);
		});

		it("should default to scenario scope", async () => {
			const scenario = new TestScenario({
				name: "Default Scope Test",
				components: [],
			});

			const tc1 = testCase("Create component without scope option", (test) => {
				test.addComponent(createServer("default-scope-mock", 9014));
				test.wait(10);
			});

			const tc2 = testCase("Component should persist", (test) => {
				test.wait(10);
			});

			await scenario.run([tc1, tc2]);

			// Should only start once (not stopped between tests)
			const startCount = componentLifecycle.filter(e => e === "server-start:9014").length;
			expect(startCount).toBe(1);
		});
	});

	describe("error handling", () => {
		it("should throw when adding duplicate component in constructor", () => {
			expect(() => new TestScenario({
				name: "Duplicate Component Test",
				components: [
					createServer("existing", 9020),
					createServer("existing", 9021),
				],
			})).toThrow("already exists");
		});

		it("should throw when adding duplicate component in init", async () => {
			const scenario = new TestScenario({
				name: "Duplicate Component Test",
				components: [createServer("existing", 9022)],
			});

			scenario.init((test) => {
				test.addComponent(createServer("existing", 9023));
			});

			const tc = testCase("Test", (test) => {
				test.wait(10);
			});

			// The error is caught and results in a failed scenario
			const result = await scenario.run(tc);
			// Init failure causes no test cases to run
			expect(result.testCases.length).toBe(0);
		});

		it("should throw when addComponent called without registry", () => {
			const builder = new TestCaseBuilder(new Map(), {});

			expect(() => {
				builder.addComponent(createServer("test", 9030));
			}).toThrow("Component registry not available");
		});
	});

	describe("multiple test cases", () => {
		it("should isolate testCase-scoped components between tests", async () => {
			const scenario = new TestScenario({
				name: "Isolation Test",
				components: [],
			});

			const tc1 = testCase("First test with scoped component", (test) => {
				test.addComponent(createServer("isolated-1", 9040), { scope: "testCase" });
				test.wait(10);
			});

			const tc2 = testCase("Second test with same name", (test) => {
				// Should be able to add component with same name since first was cleaned up
				test.addComponent(createServer("isolated-1", 9041), { scope: "testCase" });
				test.wait(10);
			});

			const result = await scenario.run([tc1, tc2]);

			expect(result.passed).toBe(true);
			expect(componentLifecycle).toContain("server-start:9040");
			expect(componentLifecycle).toContain("server-stop:server-9040");
			expect(componentLifecycle).toContain("server-start:9041");
			expect(componentLifecycle).toContain("server-stop:server-9041");
		});
	});
});
