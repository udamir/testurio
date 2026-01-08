/**
 * Hook Registry Tests
 *
 * Tests for hook functionality in BaseComponent
 */

import type { Hook, IBaseProtocol, ITestCaseBuilder, Message } from "testurio";
import { BaseComponent } from "testurio";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Minimal test component that extends BaseComponent for testing hooks
 */
class TestComponent extends BaseComponent<IBaseProtocol> {
	protected async doStart(): Promise<void> {}
	protected async doStop(): Promise<void> {}
	createStepBuilder(_builder: ITestCaseBuilder): unknown {
		return {};
	}
}

// Minimal protocol mock
const mockProtocol = {} as IBaseProtocol;

describe("BaseComponent Hook Functionality", () => {
	let component: TestComponent;

	beforeEach(() => {
		component = new TestComponent("test", mockProtocol);
	});

	describe("registerHook", () => {
		it("should register a single hook", () => {
			const hook: Hook = {
				id: "hook-1",
				componentName: "client",
				phase: "test",
				messageType: "Order",
				handlers: [],
				persistent: false,
			};

			component.registerHook(hook);

			expect(component.getAllHooks()).toHaveLength(1);
			expect(component.getHookById("hook-1")).toBe(hook);
		});

		it("should register multiple hooks", () => {
			const hooks: Hook[] = [
				{
					id: "hook-1",
					componentName: "client",
					phase: "test",
					messageType: "Order",
					handlers: [],
					persistent: false,
				},
				{
					id: "hook-2",
					componentName: "proxy",
					phase: "test",
					messageType: "Payment",
					handlers: [],
					persistent: false,
				},
			];

			hooks.forEach((hook) => {
				component.registerHook(hook);
			});

			expect(component.getAllHooks()).toHaveLength(2);
		});

		it("should store hooks in component", () => {
			const hook: Hook = {
				id: "hook-1",
				componentName: "client",
				phase: "test",
				messageType: "Order",
				handlers: [],
				persistent: false,
			};

			component.registerHook(hook);

			// Each component owns its own hooks
			expect(component.getAllHooks()).toHaveLength(1);
		});
	});

	describe("executeMatchingHook", () => {
		it("should execute matching hooks", async () => {
			let executed = false;

			const hook: Hook = {
				id: "hook-1",
				componentName: "client",
				phase: "test",
				messageType: "Order",
				handlers: [
					{
						type: "proxy",
						execute: async (msg) => {
							executed = true;
							return msg;
						},
					},
				],
				persistent: false,
			};

			component.registerHook(hook);

			const message: Message = { type: "Order", payload: {} };
			await component.executeMatchingHook(message);

			expect(executed).toBe(true);
		});

		it("should transform message through hooks", async () => {
			const hook: Hook = {
				id: "hook-1",
				componentName: "client",
				phase: "test",
				messageType: "Order",
				handlers: [
					{
						type: "proxy",
						execute: async (msg) => ({
							...msg,
							payload: { transformed: true },
						}),
					},
				],
				persistent: false,
			};

			component.registerHook(hook);

			const message: Message = { type: "Order", payload: {} };
			const result = await component.executeMatchingHook(message);

			expect(result).not.toBeNull();
			expect((result?.payload as { transformed: boolean }).transformed).toBe(true);
		});

		it("should return original message if no hooks match", async () => {
			const message: Message = { type: "Order", payload: {} };
			const result = await component.executeMatchingHook(message);

			expect(result).toBe(message);
		});
	});

	describe("clearTestCaseHooks", () => {
		it("should remove non-persistent hooks", () => {
			const hooks: Hook[] = [
				{
					id: "hook-1",
					componentName: "client",
					phase: "init",
					messageType: "Order",
					handlers: [],
					persistent: true, // Init hook
				},
				{
					id: "hook-2",
					componentName: "client",
					phase: "test",
					messageType: "Payment",
					handlers: [],
					persistent: false, // Test hook
				},
			];

			hooks.forEach((hook) => {
				component.registerHook(hook);
			});
			expect(component.getAllHooks()).toHaveLength(2);

			component.clearTestCaseHooks();

			expect(component.getAllHooks()).toHaveLength(1);
			expect(component.getHookById("hook-1")).toBeDefined();
			expect(component.getHookById("hook-2")).toBeUndefined();
		});
	});

	describe("clearHooks", () => {
		it("should remove all hooks", () => {
			const hook: Hook = {
				id: "hook-1",
				componentName: "client",
				phase: "test",
				messageType: "Order",
				handlers: [],
				persistent: true,
			};

			component.registerHook(hook);
			expect(component.getAllHooks()).toHaveLength(1);

			component.clearHooks();

			expect(component.getAllHooks()).toHaveLength(0);
		});
	});
});
