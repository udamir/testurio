/**
 * TestScenario Tests
 */

import { describe, expect, it } from "vitest";
import {
	testCase,
	TestScenario,
	scenario,
	BaseSyncProtocol,
	Client,
} from "testurio";
import type { TestScenarioConfig } from "testurio";

// Mock adapter class
class MockAdapter extends BaseSyncProtocol {
	readonly type = "http";
	readonly characteristics = {
		type: "http",
		async: false,
		supportsProxy: true,
		supportsMock: true,
		streaming: false,
		requiresConnection: false,
		bidirectional: false,
	};

	async startServer() {}
	async stopServer() {}
	async createClient() {}
	async closeClient() {}

	async request<TRes = unknown>(): Promise<TRes> {
		return { status: 200, data: "ok" } as TRes;
	}

	respond(): void {}
}

// Helper to create type-safe client for tests
const createTestClient = () => new Client("api", {
	protocol: new MockAdapter() as unknown as Parameters<typeof Client.create>[1]["protocol"],
	targetAddress: { host: "localhost", port: 8080 },
});

describe("TestScenario", () => {
	const config: TestScenarioConfig = {
		name: "Test Scenario",
		components: [createTestClient()],
	};

	describe("constructor", () => {
		it("should create a scenario with config", () => {
			const testScenario = new TestScenario(config);

			expect(testScenario).toBeInstanceOf(TestScenario);
		});

		it("should accept config with recording option", () => {
			const configWithRecording = {
				...config,
				recording: true,
			};

			const testScenario = new TestScenario(configWithRecording);

			expect(testScenario).toBeInstanceOf(TestScenario);
		});
	});

	describe("init/stop handlers", () => {
		it("should chain init handler", () => {
			const testScenario = new TestScenario(config);

			const result = testScenario.init(() => {});

			expect(result).toBe(testScenario);
		});

		it("should chain stop handler", () => {
			const testScenario = new TestScenario(config);

			const result = testScenario.stop(() => {});

			expect(result).toBe(testScenario);
		});
	});

	describe("run", () => {
		it("should run a single test case", async () => {
			const testScenario = new TestScenario(config);

			const tc = testCase("Simple Test", (test) => {
				test.wait(10);
			});

			const result = await testScenario.run(tc);

			expect(result.passed).toBe(true);
			expect(result.totalTests).toBe(1);
			expect(result.passedTests).toBe(1);
			expect(result.failedTests).toBe(0);
		});

		it("should run multiple test cases", async () => {
			const testScenario = new TestScenario(config);

			const tc1 = testCase("Test 1", (test) => {
				test.wait(5);
			});

			const tc2 = testCase("Test 2", (test) => {
				test.wait(5);
			});

			const result = await testScenario.run(tc1, tc2);

			expect(result.passed).toBe(true);
			expect(result.totalTests).toBe(2);
			expect(result.passedTests).toBe(2);
		});

		it("should handle failing test cases", async () => {
			const testScenario = new TestScenario(config);

			const tc = testCase("Failing Test", (test) => {
				test.waitUntil(
					() => {
						throw new Error("Test failed");
					},
					{ timeout: 100 },
				);
			});

			const result = await testScenario.run(tc);

			expect(result.passed).toBe(false);
			expect(result.failedTests).toBe(1);
		});

		it("should run init handler before tests", async () => {
			const testScenario = new TestScenario(config).init(() => {
				// Init runs synchronously, no steps registered
			});

			const tc = testCase("Test", (test) => {
				test.wait(10);
			});

			const result = await testScenario.run(tc);

			expect(result.passed).toBe(true);
		});

		it("should run stop handler after tests", async () => {
			const testScenario = new TestScenario(config).stop(() => {
				// Stop runs synchronously, no steps registered
			});

			const tc = testCase("Test", (test) => {
				test.wait(10);
			});

			const result = await testScenario.run(tc);

			expect(result.passed).toBe(true);
		});

		it("should include summary in result", async () => {
			const testScenario = new TestScenario(config);

			const tc = testCase("Test", (test) => {
				test.wait(10);
				test.wait(10);
			});

			const result = await testScenario.run(tc);

			expect(result.summary).toBeDefined();
			expect(result.summary?.totalTestCases).toBe(1);
			expect(result.summary?.totalSteps).toBe(2);
			expect(result.summary?.passRate).toBe(1);
		});

		it("should record duration", async () => {
			const testScenario = new TestScenario(config);

			const tc = testCase("Test", (test) => {
				test.wait(50);
			});

			const result = await testScenario.run(tc);

			expect(result.duration).toBeGreaterThanOrEqual(40);
			expect(result.startTime).toBeLessThan(result.endTime);
		});
	});

	describe("getContext", () => {
		it("should return shared context", () => {
			const testScenario = new TestScenario(config);

			const context = testScenario.getContext();

			expect(context).toEqual({});
		});
	});

	describe("scenario factory", () => {
		it("should create a TestScenario instance", () => {
			const testScenario = scenario(config);

			expect(testScenario).toBeInstanceOf(TestScenario);
		});
	});

	describe("sequential test execution", () => {
		it("should run array of tests sequentially", async () => {
			const testScenario = new TestScenario(config);

			const tc1 = testCase("Test 1", (test) => {
				test.wait(10);
			});

			const tc2 = testCase("Test 2", (test) => {
				test.wait(10);
			});

			const result = await testScenario.run([tc1, tc2]);

			expect(result.passed).toBe(true);
			expect(result.totalTests).toBe(2);
		});
	});
});
