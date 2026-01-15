/**
 * Hook Registry Tests
 *
 * Tests for hook functionality in BaseComponent
 */

import type { Step, Handler } from "testurio";
import { BaseComponent } from "testurio";
import type { ITestCaseContext } from "testurio";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Minimal test component that extends BaseComponent for testing hooks
 */
class TestComponent extends BaseComponent {
	protected async doStart(): Promise<void> {}
	protected async doStop(): Promise<void> {}

	createStepBuilder(_context: ITestCaseContext): unknown {
		return {};
	}

	async executeStep(_step: Step): Promise<void> {
		// No-op for testing
	}

	protected createHookMatcher(step: Step): (message: unknown) => boolean {
		const params = step.params as { messageType?: string };
		return (message: unknown) => {
			const msg = message as { type: string };
			return msg.type === params.messageType;
		};
	}

	protected async executeHandler<TContext = unknown>(
		_handler: Handler,
		payload: unknown,
		_context?: TContext
	): Promise<unknown> {
		return payload;
	}

	// Expose protected method for testing
	public testFindMatchingHook<T>(message: T) {
		return this.findMatchingHook(message);
	}
}

function createStep(overrides: Partial<Step> = {}): Step {
	const component = new TestComponent("test");
	return {
		id: `step_${Math.random().toString(36).substring(7)}`,
		type: "onResponse",
		component,
		description: "Test step",
		params: { messageType: "Order" },
		handlers: [],
		mode: "hook",
		...overrides,
	};
}

describe("BaseComponent Hook Functionality", () => {
	let component: TestComponent;

	beforeEach(() => {
		component = new TestComponent("test");
	});

	describe("registerHook", () => {
		it("should register a single hook", () => {
			const step = createStep({ testCaseId: "tc_1" });
			step.component = component;

			component.registerHook(step);

			expect(component.getAllHooks()).toHaveLength(1);
			const registered = component.getAllHooks()[0];
			expect(registered.stepId).toBe(step.id);
			expect(registered.testCaseId).toBe("tc_1");
			expect(registered.persistent).toBe(false);
		});

		it("should register multiple hooks", () => {
			const step1 = createStep({ testCaseId: "tc_1" });
			step1.component = component;
			const step2 = createStep({ testCaseId: "tc_1", params: { messageType: "Payment" } });
			step2.component = component;

			component.registerHook(step1);
			component.registerHook(step2);

			expect(component.getAllHooks()).toHaveLength(2);
		});

		it("should store hooks in component", () => {
			const step = createStep({ testCaseId: "tc_1" });
			step.component = component;

			component.registerHook(step);

			expect(component.getAllHooks()).toHaveLength(1);
		});
	});

	describe("findMatchingHook", () => {
		it("should find matching hooks", () => {
			const step = createStep({ testCaseId: "tc_1", params: { messageType: "Order" } });
			step.component = component;

			component.registerHook(step);

			const message = { type: "Order", payload: {} };
			const hook = component.testFindMatchingHook(message);

			expect(hook).not.toBeNull();
			expect(hook?.stepId).toBe(step.id);
		});

		it("should return null if no hooks match", () => {
			const message = { type: "Order", payload: {} };
			const hook = component.testFindMatchingHook(message);

			expect(hook).toBeNull();
		});

		it("should not match hooks with different message type", () => {
			const step = createStep({ testCaseId: "tc_1", params: { messageType: "Order" } });
			step.component = component;

			component.registerHook(step);

			const message = { type: "Payment", payload: {} };
			const hook = component.testFindMatchingHook(message);

			expect(hook).toBeNull();
		});
	});

	describe("clearHooks with testCaseId", () => {
		it("should remove non-persistent hooks for testCaseId", () => {
			// Persistent hook (no testCaseId)
			const step1 = createStep({ params: { messageType: "Order" } });
			step1.component = component;
			delete (step1 as Partial<Step>).testCaseId;

			// Non-persistent hook
			const step2 = createStep({ testCaseId: "tc_1", params: { messageType: "Payment" } });
			step2.component = component;

			component.registerHook(step1);
			component.registerHook(step2);
			expect(component.getAllHooks()).toHaveLength(2);

			component.clearHooks("tc_1");

			// Only persistent hook (without testCaseId) remains
			expect(component.getAllHooks()).toHaveLength(1);
			expect(component.getAllHooks()[0].persistent).toBe(true);
		});
	});

	describe("clearHooks without testCaseId", () => {
		it("should remove all hooks", () => {
			const step1 = createStep({ testCaseId: "tc_1" });
			step1.component = component;
			const step2 = createStep({ params: { messageType: "Payment" } });
			step2.component = component;

			component.registerHook(step1);
			component.registerHook(step2);
			expect(component.getAllHooks()).toHaveLength(2);

			component.clearHooks();

			expect(component.getAllHooks()).toHaveLength(0);
		});
	});
});
