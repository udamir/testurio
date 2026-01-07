/**
 * Hook Matching Tests
 *
 * Tests hook matching via BaseComponent.findMatchingHook
 */

import type { Hook, IBaseProtocol, ITestCaseBuilder, MessageMatcher, PayloadMatcher } from "testurio";
import { BaseComponent } from "testurio";
import { describe, expect, it } from "vitest";

// Minimal test component
class TestComponent extends BaseComponent<IBaseProtocol> {
	protected async doStart(): Promise<void> {}
	protected async doStop(): Promise<void> {}
	createStepBuilder(_builder: ITestCaseBuilder): unknown {
		return {};
	}
}

function createHook(messageType: string | MessageMatcher, payloadMatcher?: PayloadMatcher): Hook {
	return {
		id: "test-hook",
		componentName: "test",
		phase: "test",
		messageType,
		payloadMatcher,
		handlers: [],
		persistent: false,
	};
}

describe("Hook Matching", () => {
	describe("message type matching", () => {
		it("should match exact message type", () => {
			const component = new TestComponent("test", {} as IBaseProtocol);
			component.registerHook(createHook("Order"));

			expect(component.findMatchingHook({ type: "Order", payload: {} })).not.toBeNull();
			expect(component.findMatchingHook({ type: "Trade", payload: {} })).toBeNull();
		});

		it("should match with function matcher", () => {
			const component = new TestComponent("test", {} as IBaseProtocol);
			const matcher: MessageMatcher = (messageType: string) => messageType.startsWith("Order");
			component.registerHook(createHook(matcher));

			expect(component.findMatchingHook({ type: "OrderCreate", payload: {} })).not.toBeNull();
			expect(component.findMatchingHook({ type: "OrderUpdate", payload: {} })).not.toBeNull();
			expect(component.findMatchingHook({ type: "TradeCreate", payload: {} })).toBeNull();
		});
	});

	describe("payload matching", () => {
		it("should match by traceId", () => {
			const component = new TestComponent("test", {} as IBaseProtocol);
			component.registerHook(createHook("Order", { type: "traceId", value: "trace-123" }));

			expect(component.findMatchingHook({ type: "Order", payload: {}, traceId: "trace-123" })).not.toBeNull();
			expect(component.findMatchingHook({ type: "Order", payload: {}, traceId: "trace-456" })).toBeNull();
		});

		it("should match by function", () => {
			const component = new TestComponent("test", {} as IBaseProtocol);
			component.registerHook(
				createHook("Order", {
					type: "function",
					fn: (payload) => (payload as { amount: number }).amount > 100,
				})
			);

			expect(component.findMatchingHook({ type: "Order", payload: { amount: 200 } })).not.toBeNull();
			expect(component.findMatchingHook({ type: "Order", payload: { amount: 50 } })).toBeNull();
		});

		it("should handle function matcher errors as no match", () => {
			const component = new TestComponent("test", {} as IBaseProtocol);
			component.registerHook(
				createHook("Order", {
					type: "function",
					fn: () => {
						throw new Error("Test error");
					},
				})
			);

			expect(component.findMatchingHook({ type: "Order", payload: {} })).toBeNull();
		});
	});

	describe("combined matching", () => {
		it("should require both type and payload to match", () => {
			const component = new TestComponent("test", {} as IBaseProtocol);
			component.registerHook(createHook("Order", { type: "traceId", value: "trace-123" }));

			// Both match
			expect(component.findMatchingHook({ type: "Order", payload: {}, traceId: "trace-123" })).not.toBeNull();
			// Type matches, payload doesn't
			expect(component.findMatchingHook({ type: "Order", payload: {}, traceId: "trace-456" })).toBeNull();
			// Type doesn't match
			expect(component.findMatchingHook({ type: "Trade", payload: {}, traceId: "trace-123" })).toBeNull();
		});
	});
});
