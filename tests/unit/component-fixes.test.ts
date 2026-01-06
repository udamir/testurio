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

import type { Hook, Message } from "testurio";
import { HookRegistry } from "testurio";
import { beforeEach, describe, expect, it } from "vitest";

describe("Component Fixes", () => {
	describe("5.3 Hook Execution Order", () => {
		let registry: HookRegistry;

		beforeEach(() => {
			registry = new HookRegistry();
		});

		it("should execute hooks in registration order", async () => {
			const executionOrder: string[] = [];

			const hooks: Hook[] = [
				{
					id: "hook-first",
					componentName: "test",
					phase: "test",
					messageTypes: "TestMessage",
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
					messageTypes: "TestMessage",
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
				{
					id: "hook-third",
					componentName: "test",
					phase: "test",
					messageTypes: "TestMessage",
					handlers: [
						{
							type: "proxy",
							execute: async (msg) => {
								executionOrder.push("third");
								return msg;
							},
						},
					],
					persistent: false,
				},
			];

			registry.registerHooks(hooks);

			const message: Message = {
				type: "TestMessage",
				payload: {},
			};

			await registry.executeHooks(message);

			// Hooks should execute in registration order
			expect(executionOrder).toEqual(["first", "second", "third"]);
		});

		it("should maintain order regardless of hook specificity", async () => {
			const executionOrder: string[] = [];

			// Register less specific hook first
			registry.registerHook({
				id: "hook-generic",
				componentName: "test",
				phase: "test",
				messageTypes: ["TestMessage", "OtherMessage"], // Array = less specific
				handlers: [
					{
						type: "proxy",
						execute: async (msg) => {
							executionOrder.push("generic");
							return msg;
						},
					},
				],
				persistent: false,
			});

			// Register more specific hook second
			registry.registerHook({
				id: "hook-specific",
				componentName: "test",
				phase: "test",
				messageTypes: "TestMessage", // String = more specific
				matcher: { type: "traceId", value: "trace-123" }, // Even more specific
				handlers: [
					{
						type: "proxy",
						execute: async (msg) => {
							executionOrder.push("specific");
							return msg;
						},
					},
				],
				persistent: false,
			});

			const message: Message = {
				type: "TestMessage",
				payload: {},
				traceId: "trace-123",
			};

			await registry.executeHooks(message);

			// Should execute in registration order, not by specificity
			expect(executionOrder).toEqual(["generic", "specific"]);
		});
	});

	describe("4.4 Unhandled Error Tracking", () => {
		it("should return null when hook handler fails (message dropped)", async () => {
			const registry = new HookRegistry();

			registry.registerHook({
				id: "hook-error",
				componentName: "test",
				phase: "test",
				messageTypes: "TestMessage",
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

			// Hook handler errors result in message being dropped (null)
			const result = await registry.executeHooks(message);
			expect(result).toBeNull();
		});

		it("should return null when hook drops message", async () => {
			const registry = new HookRegistry();

			registry.registerHook({
				id: "hook-drop",
				componentName: "test",
				phase: "test",
				messageTypes: "TestMessage",
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
			const result = await registry.executeHooks(message);
			expect(result).toBeNull();
		});
	});
});
