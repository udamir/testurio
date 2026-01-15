/**
 * Tests for component fixes from implementation-analysis-v3.md
 *
 * Covers:
 * - 4.4: Unhandled error tracking
 * - 5.3: Hook execution order (deterministic - first match)
 */

import type { Step, Handler } from "testurio";
import { BaseComponent } from "testurio";
import type { ITestCaseContext } from "testurio";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Minimal test component that extends BaseComponent for testing hooks
 */
class TestComponent extends BaseComponent {
	public executionOrder: string[] = [];

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
		handler: Handler,
		payload: unknown,
		_context?: TContext
	): Promise<unknown> {
		const params = handler.params as Record<string, unknown>;

		switch (handler.type) {
			case "track": {
				const name = params.name as string;
				this.executionOrder.push(name);
				return payload;
			}
			case "error": {
				const errorMessage = params.message as string;
				throw new Error(errorMessage);
			}
			case "drop":
				return null;
			default:
				return payload;
		}
	}

	// Expose protected method for testing
	public testFindMatchingHook<T>(message: T) {
		return this.findMatchingHook(message);
	}

	// Execute handlers for a hook's step
	public async testExecuteHookHandlers<T>(message: T) {
		const hook = this.findMatchingHook(message);
		if (!hook || !hook.step) {
			return message;
		}
		try {
			return await this.executeHandlers(hook.step, message);
		} catch (error) {
			this.trackUnhandledError(error instanceof Error ? error : new Error(String(error)));
			throw error;
		}
	}
}

function createStep(component: TestComponent, overrides: Partial<Step> = {}): Step {
	return {
		id: `step_${Math.random().toString(36).substring(7)}`,
		type: "onResponse",
		component,
		description: "Test step",
		params: { messageType: "TestMessage" },
		handlers: [],
		mode: "hook",
		testCaseId: "tc_1",
		...overrides,
	};
}

describe("Component Fixes", () => {
	describe("5.3 First Match Hook Execution", () => {
		let component: TestComponent;

		beforeEach(() => {
			component = new TestComponent("test");
		});

		it("should execute only the first matching hook", async () => {
			const step1 = createStep(component, {
				params: { messageType: "TestMessage" },
				handlers: [{ type: "track", params: { name: "first" } }],
			});
			const step2 = createStep(component, {
				params: { messageType: "TestMessage" },
				handlers: [{ type: "track", params: { name: "second" } }],
			});

			component.registerHook(step1);
			component.registerHook(step2);

			const message = { type: "TestMessage", payload: {} };
			await component.testExecuteHookHandlers(message);

			// Only first matching hook should execute
			expect(component.executionOrder).toEqual(["first"]);
		});

		it("should skip non-matching hooks and execute first match", async () => {
			const stepOther = createStep(component, {
				params: { messageType: "OtherMessage" },
				handlers: [{ type: "track", params: { name: "other" } }],
			});
			const stepTarget = createStep(component, {
				params: { messageType: "TestMessage" },
				handlers: [{ type: "track", params: { name: "target" } }],
			});

			component.registerHook(stepOther);
			component.registerHook(stepTarget);

			const message = { type: "TestMessage", payload: {} };
			await component.testExecuteHookHandlers(message);

			// Should skip non-matching and execute first match
			expect(component.executionOrder).toEqual(["target"]);
		});
	});

	describe("4.4 Unhandled Error Tracking", () => {
		it("should throw and track error when hook handler fails", async () => {
			const component = new TestComponent("test-error");

			const step = createStep(component, {
				params: { messageType: "TestMessage" },
				handlers: [{ type: "error", params: { message: "Hook execution failed" } }],
			});

			component.registerHook(step);

			const message = { type: "TestMessage", payload: {} };

			// Hook handler errors are thrown and tracked
			await expect(component.testExecuteHookHandlers(message)).rejects.toThrow("Hook execution failed");

			// Error should be tracked for detection by test scenario
			expect(component.getUnhandledErrors()).toHaveLength(1);
			expect(component.getUnhandledErrors()[0].message).toBe("Hook execution failed");
		});

		it("should return null when hook drops message", async () => {
			const component = new TestComponent("test-drop");

			const step = createStep(component, {
				params: { messageType: "TestMessage" },
				handlers: [{ type: "drop", params: {} }],
			});

			component.registerHook(step);

			const message = { type: "TestMessage", payload: {} };

			// Drop should return null
			const result = await component.testExecuteHookHandlers(message);
			expect(result).toBeNull();
		});
	});
});
