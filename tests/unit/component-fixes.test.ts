/**
 * Tests for component fixes from implementation-analysis-v3.md
 *
 * Covers:
 * - 4.1: Promise-based proxy connection setup
 * - 4.2: Message queue removal from AsyncClient
 * - 4.4: Unhandled error tracking
 * - 5.2: Connection timeout configuration
 * - 5.3: Hook execution order (deterministic)
 * - 8.3: Parallel broadcast sends
 */

import type { Hook, ITestCaseBuilder, Message } from "testurio";
import { BaseComponent } from "testurio";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Minimal test component that extends BaseComponent for testing hooks
 */
class TestComponent extends BaseComponent {
	protected async doStart(): Promise<void> {}
	protected async doStop(): Promise<void> {}
	createStepBuilder(_builder: ITestCaseBuilder): unknown {
		return {};
	}
}

describe("Component Fixes", () => {
	describe("5.3 First Match Hook Execution", () => {
		let component: TestComponent;

		beforeEach(() => {
			component = new TestComponent("test");
		});

		it("should execute only the first matching hook", async () => {
			const executionOrder: string[] = [];

			const hooks: Hook<Message>[] = [
				{
					id: "hook-first",
					componentName: "test",
					phase: "test",
					isMatch: (msg: Message) => msg.type === "TestMessage",
					handlers: [
						{
							type: "proxy",
							execute: async (msg) => {
								executionOrder.push("first");
								return msg;
							},
						},
					],
					persistent: false,
				},
				{
					id: "hook-second",
					componentName: "test",
					phase: "test",
					isMatch: (msg: Message) => msg.type === "TestMessage",
					handlers: [
						{
							type: "proxy",
							execute: async (msg) => {
								executionOrder.push("second");
								return msg;
							},
						},
					],
					persistent: false,
				},
			];

			hooks.forEach((hook) => {
				component.registerHook(hook);
			});

			const message: Message = {
				type: "TestMessage",
				payload: {},
			};

			await component.executeMatchingHook(message);

			// Only first matching hook should execute
			expect(executionOrder).toEqual(["first"]);
		});

		it("should skip non-matching hooks and execute first match", async () => {
			const executionOrder: string[] = [];

			component.registerHook({
				id: "hook-other",
				componentName: "test",
				phase: "test",
				isMatch: (msg: Message) => msg.type === "OtherMessage",
				handlers: [
					{
						type: "proxy",
						execute: async (msg) => {
							executionOrder.push("other");
							return msg;
						},
					},
				],
				persistent: false,
			});

			component.registerHook({
				id: "hook-target",
				componentName: "test",
				phase: "test",
				isMatch: (msg: Message) => msg.type === "TestMessage",
				handlers: [
					{
						type: "proxy",
						execute: async (msg) => {
							executionOrder.push("target");
							return msg;
						},
					},
				],
				persistent: false,
			});

			const message: Message = {
				type: "TestMessage",
				payload: {},
			};

			await component.executeMatchingHook(message);

			// Should skip non-matching and execute first match
			expect(executionOrder).toEqual(["target"]);
		});
	});

	describe("4.4 Unhandled Error Tracking", () => {
		it("should throw and track error when hook handler fails", async () => {
			const component = new TestComponent("test-error");

			component.registerHook({
				id: "hook-error",
				componentName: "test",
				phase: "test",
				isMatch: (msg: Message) => msg.type === "TestMessage",
				handlers: [
					{
						type: "proxy",
						execute: async () => {
							throw new Error("Hook execution failed");
						},
					},
				],
				persistent: false,
			});

			const message: Message = {
				type: "TestMessage",
				payload: {},
			};

			// Hook handler errors are thrown and tracked (not silently dropped)
			await expect(component.executeMatchingHook(message)).rejects.toThrow("Hook execution failed");
			// Error should be tracked for detection by test scenario
			expect(component.getUnhandledErrors()).toHaveLength(1);
			expect(component.getUnhandledErrors()[0].message).toBe("Hook execution failed");
		});

		it("should return null when hook drops message", async () => {
			const component = new TestComponent("test-drop");

			component.registerHook({
				id: "hook-drop",
				componentName: "test",
				phase: "test",
				isMatch: (msg: Message) => msg.type === "TestMessage",
				handlers: [
					{
						type: "drop",
						execute: async () => {
							// Simulate drop by throwing DropMessageError
							const { DropMessageError } = await import("testurio");
							throw new DropMessageError();
						},
					},
				],
				persistent: false,
			});

			const message: Message = {
				type: "TestMessage",
				payload: {},
			};

			// Drop should return null
			const result = await component.executeMatchingHook(message);
			expect(result).toBeNull();
		});
	});
});
