/**
 * Hook Matching Tests
 *
 * Tests hook matching via BaseComponent.findMatchingHook using isMatch function
 */

import type { Handler, ITestCaseContext, Step } from "testurio";
import { BaseComponent } from "testurio";
import { describe, expect, it } from "vitest";

// Minimal test component with exposed findMatchingHook
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
		const params = step.params as {
			messageType?: string;
			matcher?: (msg: { type: string; payload: unknown; traceId?: string }) => boolean;
		};

		return (message: unknown): boolean => {
			const msg = message as { type: string; payload: unknown; traceId?: string };

			// If custom matcher is provided, use it
			if (params.matcher) {
				return params.matcher(msg);
			}

			// Default: match by message type
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

function createStep(
	component: TestComponent,
	overrides: Partial<Step> & { matcher?: (msg: { type: string; payload: unknown; traceId?: string }) => boolean } = {}
): Step {
	const { matcher, ...rest } = overrides;
	return {
		id: `step_${Math.random().toString(36).substring(7)}`,
		type: "onResponse",
		component,
		description: "Test step",
		params: {
			messageType: "Order",
			...(matcher ? { matcher } : {}),
		},
		handlers: [],
		mode: "hook",
		testCaseId: "tc_1",
		...rest,
	};
}

describe("Hook Matching", () => {
	describe("message type matching", () => {
		it("should match exact message type", () => {
			const component = new TestComponent("test");
			const step = createStep(component, { params: { messageType: "Order" } });
			component.registerHook(step);

			expect(component.testFindMatchingHook({ type: "Order", payload: {} })).not.toBeNull();
			expect(component.testFindMatchingHook({ type: "Trade", payload: {} })).toBeNull();
		});

		it("should match with function matcher", () => {
			const component = new TestComponent("test");
			const step = createStep(component, {
				matcher: (msg) => msg.type.startsWith("Order"),
			});
			component.registerHook(step);

			expect(component.testFindMatchingHook({ type: "OrderCreate", payload: {} })).not.toBeNull();
			expect(component.testFindMatchingHook({ type: "OrderUpdate", payload: {} })).not.toBeNull();
			expect(component.testFindMatchingHook({ type: "TradeCreate", payload: {} })).toBeNull();
		});
	});

	describe("payload matching", () => {
		it("should match by traceId", () => {
			const component = new TestComponent("test");
			const step = createStep(component, {
				matcher: (msg) => msg.type === "Order" && msg.traceId === "trace-123",
			});
			component.registerHook(step);

			expect(component.testFindMatchingHook({ type: "Order", payload: {}, traceId: "trace-123" })).not.toBeNull();
			expect(component.testFindMatchingHook({ type: "Order", payload: {}, traceId: "trace-456" })).toBeNull();
		});

		it("should match by function", () => {
			const component = new TestComponent("test");
			const step = createStep(component, {
				matcher: (msg) => msg.type === "Order" && (msg.payload as { amount: number }).amount > 100,
			});
			component.registerHook(step);

			expect(component.testFindMatchingHook({ type: "Order", payload: { amount: 200 } })).not.toBeNull();
			expect(component.testFindMatchingHook({ type: "Order", payload: { amount: 50 } })).toBeNull();
		});

		it("should handle function matcher errors as no match", () => {
			const component = new TestComponent("test");
			const step = createStep(component, {
				matcher: () => {
					throw new Error("Test error");
				},
			});
			component.registerHook(step);

			expect(component.testFindMatchingHook({ type: "Order", payload: {} })).toBeNull();
		});
	});

	describe("combined matching", () => {
		it("should require both type and payload to match", () => {
			const component = new TestComponent("test");
			const step = createStep(component, {
				matcher: (msg) => msg.type === "Order" && msg.traceId === "trace-123",
			});
			component.registerHook(step);

			// Both match
			expect(component.testFindMatchingHook({ type: "Order", payload: {}, traceId: "trace-123" })).not.toBeNull();
			// Type matches, payload doesn't
			expect(component.testFindMatchingHook({ type: "Order", payload: {}, traceId: "trace-456" })).toBeNull();
			// Type doesn't match
			expect(component.testFindMatchingHook({ type: "Trade", payload: {}, traceId: "trace-123" })).toBeNull();
		});
	});
});
