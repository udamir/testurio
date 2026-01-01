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
	BaseSyncProtocol,
	Server,
	Client,
} from "testurio";
import type {
	ProtocolCharacteristics,
	HttpServiceDefinition,
} from "testurio";

// Mock HTTP service definition for type-safe tests
interface MockServiceDef extends HttpServiceDefinition {
	getTest: {
		request: { method: "GET"; path: "/test" };
		response: { code: 200; body: { ok: boolean } };
	};
}

// Track component lifecycle for testing
const componentLifecycle: string[] = [];

// Mock adapter class that tracks lifecycle
class MockProtocol extends BaseSyncProtocol<MockServiceDef> {
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
		this.serverId = `server-${config.listenAddress.port}`;
	}

	private serverId?: string;

	async stopServer() {
		if (this.serverId) {
			componentLifecycle.push(`server-stop:${this.serverId}`);
		}
	}

	private clientId?: string;

	async createClient(config: { targetAddress: { host: string; port: number } }) {
		componentLifecycle.push(`client-start:${config.targetAddress.port}`);
		this.clientId = `client-${config.targetAddress.port}`;
	}

	async closeClient() {
		if (this.clientId) {
			componentLifecycle.push(`client-stop:${this.clientId}`);
		}
	}

	async request<TRes = unknown>(): Promise<TRes> {
		return { status: 200, data: "ok" } as TRes;
	}

	respond(): void {
		// Mock implementation
	}
}

// Helper to create components
// Cast to ISyncProtocol to bypass protected property mismatch
const createServer = (name: string, port: number) => new Server(name, {
	protocol: new MockProtocol() as unknown as Parameters<typeof Server.create>[1]["protocol"],
	listenAddress: { host: "localhost", port },
});

const createClient = (name: string, port: number) => new Client(name, {
	protocol: new MockProtocol() as unknown as Parameters<typeof Client.create>[1]["protocol"],
	targetAddress: { host: "localhost", port },
});

describe("Dynamic Component Creation", () => {
	beforeEach(() => {
		componentLifecycle.length = 0;
	});

	describe("addComponent in init()", () => {
		it("should add and start component in init handler", async () => {
			const dynamicServer = createServer("dynamic-mock", 9001);

			const scenario = new TestScenario({
				name: "Dynamic Init Test",
				components: [],
			});

			scenario.init((test) => {
				test.use(dynamicServer);
			});

			const tc = testCase("Use dynamic component", (test) => {
				test.wait(10);
			});

			await scenario.run(tc);

			expect(componentLifecycle).toContain("server-start:9001");
		});

		it("should allow using dynamically added component in test case", async () => {
			const backendServer = createServer("backend", 9002);
			const apiClient = createClient("api", 9002);

			const scenario = new TestScenario({
				name: "Dynamic Init Usage Test",
				components: [],
			});

			scenario.init((test) => {
				test.use(backendServer);
				test.use(apiClient);
			});

			let clientUsed = false;

			const tc = testCase("Use dynamic components", (test) => {
				const api = test.use(apiClient);
				const backend = test.use(backendServer);

				// This should work because components were added in init
				api.request("getTest", { method: "GET", path: "/test" });
				backend.onRequest("getTest", { method: "GET", path: "/test" }).mockResponse(() => ({
					code: 200,
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
			const initialServer = createServer("initial-mock", 9003);
			const dynamicServer = createServer("dynamic-mock", 9004);

			const scenario = new TestScenario({
				name: "Component Order Test",
				components: [initialServer],
			});

			scenario.init((test) => {
				test.use(dynamicServer);
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
				test.use(createServer("test-mock", 9010));
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
				test.use(createServer("backend", 9011));
				test.use(createClient("api", 9011));
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
				// test.use() auto-registers with testCase scope
				test.use(createServer("scoped-mock", 9012));
				test.wait(10);
			});

			await scenario.run(tc);

			// Component should be started and then stopped
			expect(componentLifecycle).toContain("server-start:9012");
			expect(componentLifecycle).toContain("server-stop:server-9012");
		});

		it("should keep scenario-scoped components after test", async () => {
			const persistentServer = createServer("persistent-mock", 9013);

			const scenario = new TestScenario({
				name: "Scenario Scope Test",
				components: [],
			});

			// Add in init for scenario scope
			scenario.init((test) => {
				test.use(persistentServer);
			});

			const tc1 = testCase("Use persistent component", (test) => {
				test.wait(10);
			});

			const tc2 = testCase("Use persistent component again", (test) => {
				// Component should still exist
				test.wait(10);
			});

			await scenario.run([tc1, tc2]);

			// Component should be started once and stopped at scenario cleanup
			const startCount = componentLifecycle.filter(e => e === "server-start:9013").length;
			const stopCount = componentLifecycle.filter(e => e.includes("server-stop:server-9013")).length;

			expect(startCount).toBe(1);
			// Stop may happen multiple times due to cleanup logic
			expect(stopCount).toBeGreaterThanOrEqual(1);
		});

		it("should default to testCase scope for test.use()", async () => {
			const scenario = new TestScenario({
				name: "Default Scope Test",
				components: [],
			});

			const tc1 = testCase("Create component with test.use()", (test) => {
				// test.use() defaults to testCase scope (auto-cleanup)
				test.use(createServer("default-scope-mock", 9014));
				test.wait(10);
			});

			const tc2 = testCase("Component should be cleaned up", (test) => {
				test.wait(10);
			});

			await scenario.run([tc1, tc2]);

			// Should start once and be stopped after tc1
			const startCount = componentLifecycle.filter(e => e === "server-start:9014").length;
			expect(startCount).toBe(1);
			expect(componentLifecycle).toContain("server-stop:server-9014");
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

		it("should handle duplicate component in init", async () => {
			const existingServer = createServer("existing", 9022);

			const scenario = new TestScenario({
				name: "Duplicate Component Test",
				components: [existingServer],
			});

			scenario.init((test) => {
				// Using same component instance is fine
				test.use(existingServer);
			});

			const tc = testCase("Test", (test) => {
				test.wait(10);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should handle test.use() with auto-registration", () => {
			const builder = new TestCaseBuilder(new Map(), {});
			const server = createServer("test", 9030);

			// test.use() should work and auto-register the component
			const stepBuilder = builder.use(server);
			expect(stepBuilder).toBeDefined();
		});
	});

	describe("multiple test cases", () => {
		it("should isolate testCase-scoped components between tests", async () => {
			const scenario = new TestScenario({
				name: "Isolation Test",
				components: [],
			});

			const tc1 = testCase("First test with scoped component", (test) => {
				// test.use() auto-registers with testCase scope
				test.use(createServer("isolated-1", 9040));
				test.wait(10);
			});

			const tc2 = testCase("Second test with same name", (test) => {
				// Should be able to add component with same name since first was cleaned up
				test.use(createServer("isolated-1", 9041));
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
