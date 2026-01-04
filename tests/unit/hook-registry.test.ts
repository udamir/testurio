/**
 * Hook Registry Tests
 */

import { beforeEach, describe, expect, it } from "vitest";
import { HookRegistry } from "testurio";
import type { Hook, Message } from "testurio";

describe("HookRegistry", () => {
	let registry: HookRegistry;

	beforeEach(() => {
		registry = new HookRegistry();
	});

	describe("registerHook", () => {
		it("should register a single hook", () => {
			const hook: Hook = {
				id: "hook-1",
				componentName: "client",
				phase: "test",
				messageTypes: "Order",
				handlers: [],
				persistent: false,
			};

			registry.registerHook(hook);

			expect(registry.getAllHooks()).toHaveLength(1);
			expect(registry.getHookById("hook-1")).toBe(hook);
		});

		it("should register multiple hooks", () => {
			const hooks: Hook[] = [
				{
					id: "hook-1",
					componentName: "client",
					phase: "test",
					messageTypes: "Order",
					handlers: [],
					persistent: false,
				},
				{
					id: "hook-2",
					componentName: "proxy",
					phase: "test",
					messageTypes: "Payment",
					handlers: [],
					persistent: false,
				},
			];

			registry.registerHooks(hooks);

			expect(registry.getAllHooks()).toHaveLength(2);
		});

		it("should store hooks in registry", () => {
			const hook: Hook = {
				id: "hook-1",
				componentName: "client",
				phase: "test",
				messageTypes: "Order",
				handlers: [],
				persistent: false,
			};

			registry.registerHook(hook);

			// Each component owns its own registry, so all hooks belong to it
			expect(registry.getAllHooks()).toHaveLength(1);
		});
	});

	describe("executeHooks", () => {
		it("should execute matching hooks", async () => {
			let executed = false;

			const hook: Hook = {
				id: "hook-1",
				componentName: "client",
				phase: "test",
				messageTypes: "Order",
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

			registry.registerHook(hook);

			const message: Message = { type: "Order", payload: {} };
			await registry.executeHooks(message);

			expect(executed).toBe(true);
		});

		it("should transform message through hooks", async () => {
			const hook: Hook = {
				id: "hook-1",
				componentName: "client",
				phase: "test",
				messageTypes: "Order",
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

			registry.registerHook(hook);

			const message: Message = { type: "Order", payload: {} };
			const result = await registry.executeHooks(message);

			expect(result).not.toBeNull();
			expect((result?.payload as { transformed: boolean }).transformed).toBe(
				true,
			);
		});

		it("should return original message if no hooks match", async () => {
			const message: Message = { type: "Order", payload: {} };
			const result = await registry.executeHooks(message);

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
					messageTypes: "Order",
					handlers: [],
					persistent: true, // Init hook
				},
				{
					id: "hook-2",
					componentName: "client",
					phase: "test",
					messageTypes: "Payment",
					handlers: [],
					persistent: false, // Test hook
				},
			];

			registry.registerHooks(hooks);
			expect(registry.getAllHooks()).toHaveLength(2);

			registry.clearTestCaseHooks();

			expect(registry.getAllHooks()).toHaveLength(1);
			expect(registry.getHookById("hook-1")).toBeDefined();
			expect(registry.getHookById("hook-2")).toBeUndefined();
		});
	});

	describe("clear", () => {
		it("should remove all hooks", () => {
			const hook: Hook = {
				id: "hook-1",
				componentName: "client",
				phase: "test",
				messageTypes: "Order",
				handlers: [],
				persistent: true,
			};

			registry.registerHook(hook);
			expect(registry.getAllHooks()).toHaveLength(1);

			registry.clear();

			expect(registry.getAllHooks()).toHaveLength(0);
		});
	});
});
