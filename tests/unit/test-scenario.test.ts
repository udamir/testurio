/**
 * TestScenario Tests
 *
 * Tests for the new three-phase execution model TestScenario.
 */

import type { Component, ITestCaseContext, Step, TestScenarioConfig } from "testurio";
import { scenario, TestScenario, testCase } from "testurio";
import { describe, expect, it, vi } from "vitest";

/**
 * Mock step builder type for testing
 */
interface MockStepBuilder {
	doAction(description: string): void;
	onEvent(description: string): void;
}

/**
 * Mock component for testing the new execution model.
 * Implements the full Component interface.
 */
function createMockComponent(
	name: string,
	executeStepFn?: (step: Step) => Promise<void> | void
): Component<MockStepBuilder> {
	const hooks: Step[] = [];
	const unhandledErrors: Error[] = [];
	let state: "created" | "starting" | "started" | "stopping" | "stopped" | "error" = "created";

	const component = {
		name,
		hooks,
		// State methods
		getState: vi.fn(() => state),
		isStarted: vi.fn(() => state === "started"),
		isStopped: vi.fn(() => state === "stopped"),
		// Hook methods
		registerHook: vi.fn((step: Step) => {
			hooks.push(step);
		}),
		executeStep: vi.fn(async (step: Step) => {
			if (executeStepFn) {
				await executeStepFn(step);
			}
		}),
		clearHooks: vi.fn((_testCaseId?: string) => {
			hooks.length = 0;
		}),
		// Error tracking
		getUnhandledErrors: vi.fn(() => [...unhandledErrors]),
		clearUnhandledErrors: vi.fn(() => {
			unhandledErrors.length = 0;
		}),
		// Step builder factory
		createStepBuilder: vi.fn((context: ITestCaseContext) => ({
			// Return a mock step builder that registers steps
			doAction: (description: string) => {
				context.registerStep({
					id: `step_${Date.now()}_${Math.random()}`,
					type: "action",
					component: component as unknown as Step["component"],
					description,
					params: {},
					handlers: [],
					mode: "action",
				});
			},
			onEvent: (description: string) => {
				context.registerStep({
					id: `step_${Date.now()}_${Math.random()}`,
					type: "onEvent",
					component: component as unknown as Step["component"],
					description,
					params: {},
					handlers: [],
					mode: "hook",
				});
			},
		})),
		// Lifecycle
		start: vi.fn(async () => {
			state = "started";
		}),
		stop: vi.fn(async () => {
			state = "stopped";
		}),
	};

	return component as unknown as Component<MockStepBuilder>;
}

describe("TestScenario", () => {
	const createConfig = (): TestScenarioConfig => ({
		name: "Test Scenario",
		components: [createMockComponent("api")],
	});

	describe("constructor", () => {
		it("should create a scenario with config", () => {
			const testScenario = new TestScenario(createConfig());

			expect(testScenario).toBeInstanceOf(TestScenario);
		});

		it("should accept config with recording option", () => {
			const configWithRecording = {
				...createConfig(),
				recording: true,
			};

			const testScenario = new TestScenario(configWithRecording);

			expect(testScenario).toBeInstanceOf(TestScenario);
		});
	});

	describe("init/stop handlers", () => {
		it("should chain init handler", () => {
			const testScenario = new TestScenario(createConfig());

			const result = testScenario.init(() => {});

			expect(result).toBe(testScenario);
		});

		it("should chain stop handler", () => {
			const testScenario = new TestScenario(createConfig());

			const result = testScenario.stop(() => {});

			expect(result).toBe(testScenario);
		});
	});

	describe("run", () => {
		it("should run a single test case", async () => {
			const mockComponent = createMockComponent("api");
			const testScenario = new TestScenario({
				name: "Test",
				components: [mockComponent],
			});

			const tc = testCase("Simple Test", (test) => {
				const api = test.use(mockComponent);
				api.doAction("Action 1");
			});

			const result = await testScenario.run(tc);

			expect(result.passed).toBe(true);
			expect(result.totalTests).toBe(1);
			expect(result.passedTests).toBe(1);
			expect(result.failedTests).toBe(0);
		});

		it("should run multiple test cases", async () => {
			const mockComponent = createMockComponent("api");
			const testScenario = new TestScenario({
				name: "Test",
				components: [mockComponent],
			});

			const tc1 = testCase("Test 1", (test) => {
				const api = test.use(mockComponent);
				api.doAction("Action 1");
			});

			const tc2 = testCase("Test 2", (test) => {
				const api = test.use(mockComponent);
				api.doAction("Action 2");
			});

			const result = await testScenario.run(tc1, tc2);

			expect(result.passed).toBe(true);
			expect(result.totalTests).toBe(2);
			expect(result.passedTests).toBe(2);
		});

		it("should handle failing test cases", async () => {
			const failingComponent = createMockComponent("api", () => {
				throw new Error("Test failed");
			});
			const testScenario = new TestScenario({
				name: "Test",
				components: [failingComponent],
			});

			const tc = testCase("Failing Test", (test) => {
				const api = test.use(failingComponent);
				api.doAction("Failing action");
			});

			const result = await testScenario.run(tc);

			expect(result.passed).toBe(false);
			expect(result.failedTests).toBe(1);
		});

		it("should run init handler before tests", async () => {
			const mockComponent = createMockComponent("api");
			const initCalled = vi.fn();

			const testScenario = new TestScenario({
				name: "Test",
				components: [mockComponent],
			}).init((test) => {
				initCalled();
				// Init can register hooks
				const api = test.use(mockComponent);
				api.onEvent("Init event");
			});

			const tc = testCase("Test", (test) => {
				const api = test.use(mockComponent);
				api.doAction("Action");
			});

			const result = await testScenario.run(tc);

			expect(result.passed).toBe(true);
			expect(initCalled).toHaveBeenCalled();
		});

		it("should run stop handler after tests", async () => {
			const mockComponent = createMockComponent("api");
			const stopCalled = vi.fn();

			const testScenario = new TestScenario({
				name: "Test",
				components: [mockComponent],
			}).stop(() => {
				stopCalled();
			});

			const tc = testCase("Test", (test) => {
				const api = test.use(mockComponent);
				api.doAction("Action");
			});

			const result = await testScenario.run(tc);

			expect(result.passed).toBe(true);
			expect(stopCalled).toHaveBeenCalled();
		});

		it("should include summary in result", async () => {
			const mockComponent = createMockComponent("api");
			const testScenario = new TestScenario({
				name: "Test",
				components: [mockComponent],
			});

			const tc = testCase("Test", (test) => {
				const api = test.use(mockComponent);
				api.doAction("Action 1");
				api.doAction("Action 2");
			});

			const result = await testScenario.run(tc);

			expect(result.summary).toBeDefined();
			expect(result.summary?.totalTestCases).toBe(1);
			expect(result.summary?.totalSteps).toBe(2);
			expect(result.summary?.passRate).toBe(1);
		});

		it("should record duration", async () => {
			const slowComponent = createMockComponent("api", async () => {
				await new Promise((resolve) => setTimeout(resolve, 50));
			});
			const testScenario = new TestScenario({
				name: "Test",
				components: [slowComponent],
			});

			const tc = testCase("Test", (test) => {
				const api = test.use(slowComponent);
				api.doAction("Slow action");
			});

			const result = await testScenario.run(tc);

			expect(result.duration).toBeGreaterThanOrEqual(40);
			expect(result.startTime).toBeLessThan(result.endTime);
		});
	});

	describe("scenario factory", () => {
		it("should create a TestScenario instance", () => {
			const testScenario = scenario(createConfig());

			expect(testScenario).toBeInstanceOf(TestScenario);
		});
	});

	describe("sequential test execution", () => {
		it("should run array of tests sequentially", async () => {
			const mockComponent = createMockComponent("api");
			const testScenario = new TestScenario({
				name: "Test",
				components: [mockComponent],
			});

			const tc1 = testCase("Test 1", (test) => {
				const api = test.use(mockComponent);
				api.doAction("Action 1");
			});

			const tc2 = testCase("Test 2", (test) => {
				const api = test.use(mockComponent);
				api.doAction("Action 2");
			});

			const result = await testScenario.run([tc1, tc2]);

			expect(result.passed).toBe(true);
			expect(result.totalTests).toBe(2);
		});
	});

	describe("component lifecycle", () => {
		it("should start components before running tests", async () => {
			const mockComponent = createMockComponent("api");
			const testScenario = new TestScenario({
				name: "Test",
				components: [mockComponent],
			});

			const tc = testCase("Test", (test) => {
				const api = test.use(mockComponent);
				api.doAction("Action");
			});

			await testScenario.run(tc);

			expect(mockComponent.start).toHaveBeenCalled();
		});

		it("should stop components after running tests", async () => {
			const mockComponent = createMockComponent("api");
			const testScenario = new TestScenario({
				name: "Test",
				components: [mockComponent],
			});

			const tc = testCase("Test", (test) => {
				const api = test.use(mockComponent);
				api.doAction("Action");
			});

			await testScenario.run(tc);

			expect(mockComponent.stop).toHaveBeenCalled();
		});
	});
});
