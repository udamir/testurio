/**
 * Test Case Builder Tests
 *
 * Tests for the new three-phase execution model TestCaseBuilder.
 */

import type { Component, ITestCaseContext, Step } from "testurio";
import { TestCaseBuilder } from "testurio";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mock step builder type for testing
 */
interface MockStepBuilder {
	doAction(description: string): void;
	onEvent(description: string): void;
}

/**
 * Mock component for testing the new execution model.
 * Implements the Component interface with registerHook, executeStep, clearHooks.
 */
function createMockComponent(name: string): Component<MockStepBuilder> {
	const hooks: Step[] = [];

	return {
		name,
		state: "started",
		hooks,
		registerHook: vi.fn((step: Step) => {
			hooks.push(step);
		}),
		executeStep: vi.fn(async (_step: Step) => {
			// No-op for testing
		}),
		clearHooks: vi.fn((_testCaseId?: string) => {
			hooks.length = 0;
		}),
		createStepBuilder: vi.fn((context: ITestCaseContext) => ({
			// Return a mock step builder that registers steps
			doAction: (description: string) => {
				context.registerStep({
					id: `step_${Date.now()}`,
					type: "action",
					component: createMockComponent(name) as unknown as Step["component"],
					description,
					params: {},
					handlers: [],
					mode: "action",
				});
			},
			onEvent: (description: string) => {
				context.registerStep({
					id: `step_${Date.now()}`,
					type: "onEvent",
					component: createMockComponent(name) as unknown as Step["component"],
					description,
					params: {},
					handlers: [],
					mode: "hook",
				});
			},
		})),
		start: vi.fn(async () => {}),
		stop: vi.fn(async () => {}),
	} as unknown as Component<MockStepBuilder>;
}

describe("TestCaseBuilder", () => {
	let components: Map<string, Component>;
	let builder: TestCaseBuilder;

	beforeEach(() => {
		components = new Map<string, Component>();
		builder = new TestCaseBuilder(components);
	});

	describe("use", () => {
		it("should return step builder from component", () => {
			const mockComponent = createMockComponent("test");

			const stepBuilder = builder.use(mockComponent);

			expect(stepBuilder).toBeDefined();
			expect(mockComponent.createStepBuilder).toHaveBeenCalledWith(builder);
		});

		it("should auto-register component if not in components map", () => {
			const mockComponent = createMockComponent("test");

			builder.use(mockComponent);

			expect(components.has("test")).toBe(true);
		});

		it("should queue pending component for starting", () => {
			const mockComponent = createMockComponent("test");

			builder.use(mockComponent);

			const pending = builder.getPendingComponents();
			expect(pending).toHaveLength(1);
			expect(pending[0].component).toBe(mockComponent);
			expect(pending[0].options.scope).toBe("testCase");
		});

		it("should not queue pending if component already registered", () => {
			const mockComponent = createMockComponent("test");
			components.set("test", mockComponent);

			builder.use(mockComponent);

			const pending = builder.getPendingComponents();
			expect(pending).toHaveLength(0);
		});
	});

	describe("step registration", () => {
		it("should register steps via registerStep", () => {
			const step: Step = {
				id: "step_1",
				type: "action",
				component: createMockComponent("test") as unknown as Step["component"],
				description: "Test step",
				params: {},
				handlers: [],
				mode: "action",
			};

			builder.registerStep(step);

			const steps = builder.getSteps();
			expect(steps).toHaveLength(1);
			expect(steps[0].type).toBe("action");
			expect(steps[0].description).toBe("Test step");
		});

		it("should track phase for registered steps", () => {
			const component = createMockComponent("test");

			builder.setPhase("init");
			const initBuilder = builder.use(component);
			initBuilder.doAction("Init action");

			builder.setPhase("test");
			const testBuilder = builder.use(component);
			testBuilder.doAction("Test action");

			builder.setPhase("after");
			const afterBuilder = builder.use(component);
			afterBuilder.doAction("After action");

			// Phase is tracked on the builder, not the step
			// Verify builder phase changes work
			expect(builder.phase).toBe("after");
		});
	});

	describe("testCaseId", () => {
		it("should store and retrieve testCaseId", () => {
			builder.setTestCaseId("tc_123");

			expect(builder.testCaseId).toBe("tc_123");
		});
	});

	describe("pendingComponents", () => {
		it("should clear pending components", () => {
			const mockComponent = createMockComponent("test");
			builder.use(mockComponent);

			expect(builder.getPendingComponents()).toHaveLength(1);

			builder.clearPendingComponents();

			expect(builder.getPendingComponents()).toHaveLength(0);
		});
	});
});
