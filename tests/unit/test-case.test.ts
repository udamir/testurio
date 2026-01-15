/**
 * TestCase Tests
 *
 * Tests for the new three-phase execution model TestCase.
 */

import type { Component, ITestCaseContext, Step } from "testurio";
import { TestCase, TestCaseBuilder, testCase } from "testurio";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mock step builder type for testing
 */
interface MockStepBuilder {
	doAction(description: string): void;
	onEvent(description: string): void;
	delay(ms: number): void;
}

/**
 * Mock component for testing the new execution model.
 * Implements the Component interface with registerHook, executeStep, clearHooks.
 */
function createMockComponent(
	name: string,
	executeStepFn?: (step: Step) => Promise<void> | void
): Component<MockStepBuilder> {
	const hooks: Step[] = [];
	const componentRef = {} as Component;

	const component = {
		name,
		state: "started",
		hooks,
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
		createStepBuilder: vi.fn((context: ITestCaseContext) => ({
			// Return a mock step builder that registers steps
			doAction: (description: string) => {
				context.registerStep({
					id: `step_${Date.now()}_${Math.random()}`,
					type: "action",
					component: componentRef as unknown as Step["component"],
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
					component: componentRef as unknown as Step["component"],
					description,
					params: {},
					handlers: [],
					mode: "hook",
				});
			},
			delay: (ms: number) => {
				context.registerStep({
					id: `step_${Date.now()}_${Math.random()}`,
					type: "delay",
					component: componentRef as unknown as Step["component"],
					description: `Delay ${ms}ms`,
					params: { ms },
					handlers: [],
					mode: "action",
				});
			},
		})),
		start: vi.fn(async () => {}),
		stop: vi.fn(async () => {}),
	};

	// Assign component reference for circular reference
	Object.assign(componentRef, component);

	return component as unknown as Component<MockStepBuilder>;
}

describe("TestCase", () => {
	let components: Map<string, Component>;
	let builder: TestCaseBuilder;
	let mockComponent: Component<MockStepBuilder>;

	beforeEach(() => {
		components = new Map<string, Component>();
		mockComponent = createMockComponent("test");
		components.set("test", mockComponent);
		builder = new TestCaseBuilder(components);
	});

	describe("constructor", () => {
		it("should create a test case with name", () => {
			const tc = new TestCase("My Test", () => {});

			expect(tc.name).toBe("My Test");
		});

		it("should generate unique testCaseId", () => {
			const tc1 = new TestCase("Test 1", () => {});
			const tc2 = new TestCase("Test 2", () => {});

			expect(tc1.testCaseId).toMatch(/^tc_/);
			expect(tc2.testCaseId).toMatch(/^tc_/);
			expect(tc1.testCaseId).not.toBe(tc2.testCaseId);
		});
	});

	describe("before/after", () => {
		it("should chain before and after handlers", () => {
			const tc = new TestCase("Test", () => {}).before(() => {}).after(() => {});

			expect(tc).toBeInstanceOf(TestCase);
		});
	});

	describe("buildSteps", () => {
		it("should build steps from test builder", () => {
			const tc = new TestCase("Test", (test) => {
				const api = test.use(mockComponent);
				api.doAction("Action 1");
				api.doAction("Action 2");
			});

			const steps = tc.buildSteps(builder);

			expect(steps).toHaveLength(2);
			expect(steps[0].type).toBe("action");
			expect(steps[1].type).toBe("action");
		});

		it("should build before steps first", () => {
			const tc = new TestCase("Test", (test) => {
				const api = test.use(mockComponent);
				api.doAction("Test action");
			}).before((test) => {
				const api = test.use(mockComponent);
				api.doAction("Before action");
			});

			const steps = tc.buildSteps(builder);

			expect(steps).toHaveLength(2);
			expect(steps[0].description).toBe("Before action");
			expect(steps[1].description).toBe("Test action");
		});

		it("should build after steps last", () => {
			const tc = new TestCase("Test", (test) => {
				const api = test.use(mockComponent);
				api.doAction("Test action");
			}).after((test) => {
				const api = test.use(mockComponent);
				api.doAction("After action");
			});

			const steps = tc.buildSteps(builder);

			expect(steps).toHaveLength(2);
			expect(steps[0].description).toBe("Test action");
			expect(steps[1].description).toBe("After action");
		});
	});

	describe("execute", () => {
		it("should execute all steps", async () => {
			const tc = new TestCase("Test", (test) => {
				const api = test.use(mockComponent);
				api.doAction("Action 1");
				api.doAction("Action 2");
			});

			const result = await tc.execute(builder);

			expect(result.passed).toBe(true);
			expect(result.totalSteps).toBe(2);
			expect(result.passedSteps).toBe(2);
		});

		it("should report failure on step error", async () => {
			const failingComponent = createMockComponent("failing", () => {
				throw new Error("Test error");
			});
			components.set("failing", failingComponent);

			const tc = new TestCase("Test", (test) => {
				const api = test.use(failingComponent);
				api.doAction("Failing action");
			});

			const result = await tc.execute(builder);

			expect(result.passed).toBe(false);
			expect(result.failedSteps).toBe(1);
			expect(result.error).toBe("Test error");
		});

		it("should call onStepComplete callback", async () => {
			const callback = vi.fn();

			const tc = new TestCase("Test", (test) => {
				const api = test.use(mockComponent);
				api.doAction("Action 1");
				api.doAction("Action 2");
			});

			await tc.execute(builder, { onStepComplete: callback });

			expect(callback).toHaveBeenCalledTimes(2);
		});

		it("should record duration", async () => {
			const slowComponent = createMockComponent("slow", async () => {
				await new Promise((resolve) => setTimeout(resolve, 50));
			});
			components.set("slow", slowComponent);

			const tc = new TestCase("Test", (test) => {
				const api = test.use(slowComponent);
				api.doAction("Slow action");
			});

			const result = await tc.execute(builder);

			expect(result.duration).toBeGreaterThanOrEqual(40);
			expect(result.startTime).toBeLessThan(result.endTime);
		});

		it("should set testCaseId on builder", async () => {
			const tc = new TestCase("Test", (test) => {
				const api = test.use(mockComponent);
				api.doAction("Action");
			});

			await tc.execute(builder);

			expect(builder.testCaseId).toBe(tc.testCaseId);
		});
	});

	describe("metadata", () => {
		it("should set and get metadata via fluent API", () => {
			const tc = new TestCase("Test", () => {})
				.epic("User Management")
				.feature("Login")
				.story("As a user I can login")
				.severity("critical")
				.tags("smoke", "regression")
				.issue("JIRA-123")
				.description("Test description")
				.label("custom", "value");

			const metadata = tc.getMetadata();

			expect(metadata.epic).toBe("User Management");
			expect(metadata.feature).toBe("Login");
			expect(metadata.story).toBe("As a user I can login");
			expect(metadata.severity).toBe("critical");
			expect(metadata.tags).toEqual(["smoke", "regression"]);
			expect(metadata.issues).toEqual(["JIRA-123"]);
			expect(metadata.description).toBe("Test description");
			expect(metadata.labels?.custom).toBe("value");
		});
	});

	describe("testCase factory", () => {
		it("should create a TestCase instance", () => {
			const tc = testCase("Factory Test", () => {});

			expect(tc).toBeInstanceOf(TestCase);
			expect(tc.name).toBe("Factory Test");
		});

		it("should accept metadata", () => {
			const tc = testCase("Test", () => {}, { epic: "Epic", feature: "Feature" });

			const metadata = tc.getMetadata();
			expect(metadata.epic).toBe("Epic");
			expect(metadata.feature).toBe("Feature");
		});
	});
});
