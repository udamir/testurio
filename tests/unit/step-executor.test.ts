/**
 * Step Executor Tests
 *
 * Tests for the three-phase step execution model.
 */

import type { Step } from "testurio";
import { executeSteps, summarizeStepResults } from "testurio";
import { describe, expect, it, vi } from "vitest";

/**
 * Mock component for testing
 */
function createMockComponent(name: string, executeStepFn?: (step: Step) => Promise<void> | void) {
	const hooks: Step[] = [];
	return {
		name,
		hooks,
		registerHook: vi.fn((step: Step) => {
			hooks.push(step);
		}),
		executeStep: vi.fn(async (step: Step) => {
			if (executeStepFn) {
				await executeStepFn(step);
			}
		}),
		clearHooks: vi.fn((_testCaseId: string) => {
			hooks.length = 0;
		}),
	};
}

describe("Step Executor", () => {
	describe("executeSteps", () => {
		it("should execute action steps", async () => {
			const executionOrder: string[] = [];
			const component = createMockComponent("test", (step) => {
				executionOrder.push(step.description ?? step.type);
			});

			const steps: Step[] = [
				{
					id: "step_1",
					type: "request",
					component: component as unknown as Step["component"],
					description: "Step 1",
					params: {},
					handlers: [],
					mode: "action",
				},
				{
					id: "step_2",
					type: "request",
					component: component as unknown as Step["component"],
					description: "Step 2",
					params: {},
					handlers: [],
					mode: "action",
				},
			];

			const results = await executeSteps(steps, "tc_1");

			expect(results).toHaveLength(2);
			expect(results.every((r) => r.passed)).toBe(true);
			expect(executionOrder).toEqual(["Step 1", "Step 2"]);
			expect(component.executeStep).toHaveBeenCalledTimes(2);
		});

		it("should register hooks before execution (Phase 1)", async () => {
			const component = createMockComponent("test");
			const callOrder: string[] = [];

			component.registerHook = vi.fn((step: Step) => {
				callOrder.push(`register:${step.description ?? ""}`);
			});
			component.executeStep = vi.fn(async (step: Step) => {
				callOrder.push(`execute:${step.description ?? ""}`);
			});

			const steps: Step[] = [
				{
					id: "step_1",
					type: "request",
					component: component as unknown as Step["component"],
					description: "Action",
					params: {},
					handlers: [],
					mode: "action",
				},
				{
					id: "step_2",
					type: "onResponse",
					component: component as unknown as Step["component"],
					description: "Hook",
					params: {},
					handlers: [],
					mode: "hook",
				},
			];

			await executeSteps(steps, "tc_1");

			// Hook registration (Phase 1) should happen BEFORE any step execution (Phase 2)
			// Expected order: register Hook, then execute Action, then execute Hook
			expect(callOrder).toEqual(["register:Hook", "execute:Action", "execute:Hook"]);
		});

		it("should clear hooks after execution (Phase 3)", async () => {
			const component = createMockComponent("test");

			const steps: Step[] = [
				{
					id: "step_1",
					type: "onResponse",
					component: component as unknown as Step["component"],
					description: "Hook step",
					params: {},
					handlers: [],
					mode: "hook",
				},
			];

			await executeSteps(steps, "tc_1");

			expect(component.clearHooks).toHaveBeenCalledWith("tc_1");
		});

		it("should clear hooks even on error", async () => {
			const component = createMockComponent("test", () => {
				throw new Error("Step failed");
			});

			const steps: Step[] = [
				{
					id: "step_1",
					type: "request",
					component: component as unknown as Step["component"],
					description: "Failing step",
					params: {},
					handlers: [],
					mode: "action",
				},
			];

			const results = await executeSteps(steps, "tc_1");

			expect(results[0].passed).toBe(false);
			expect(component.clearHooks).toHaveBeenCalledWith("tc_1");
		});

		it("should stop on failure with failFast (default)", async () => {
			const component = createMockComponent("test", (step) => {
				if (step.description === "Failing step") {
					throw new Error("Failed");
				}
			});

			const steps: Step[] = [
				{
					id: "step_1",
					type: "request",
					component: component as unknown as Step["component"],
					description: "Step 1",
					params: {},
					handlers: [],
					mode: "action",
				},
				{
					id: "step_2",
					type: "request",
					component: component as unknown as Step["component"],
					description: "Failing step",
					params: {},
					handlers: [],
					mode: "action",
				},
				{
					id: "step_3",
					type: "request",
					component: component as unknown as Step["component"],
					description: "Step 3",
					params: {},
					handlers: [],
					mode: "action",
				},
			];

			const results = await executeSteps(steps, "tc_1", { failFast: true });

			expect(results).toHaveLength(2);
			expect(results[0].passed).toBe(true);
			expect(results[1].passed).toBe(false);
		});

		it("should continue on failure without failFast", async () => {
			const component = createMockComponent("test", (step) => {
				if (step.description === "Failing step") {
					throw new Error("Failed");
				}
			});

			const steps: Step[] = [
				{
					id: "step_1",
					type: "request",
					component: component as unknown as Step["component"],
					description: "Step 1",
					params: {},
					handlers: [],
					mode: "action",
				},
				{
					id: "step_2",
					type: "request",
					component: component as unknown as Step["component"],
					description: "Failing step",
					params: {},
					handlers: [],
					mode: "action",
				},
				{
					id: "step_3",
					type: "request",
					component: component as unknown as Step["component"],
					description: "Step 3",
					params: {},
					handlers: [],
					mode: "action",
				},
			];

			const results = await executeSteps(steps, "tc_1", { failFast: false });

			expect(results).toHaveLength(3);
			expect(results[0].passed).toBe(true);
			expect(results[1].passed).toBe(false);
			expect(results[2].passed).toBe(true);
		});

		it("should call onStepComplete callback", async () => {
			const callback = vi.fn();
			const component = createMockComponent("test");

			const steps: Step[] = [
				{
					id: "step_1",
					type: "request",
					component: component as unknown as Step["component"],
					description: "Step 1",
					params: {},
					handlers: [],
					mode: "action",
				},
				{
					id: "step_2",
					type: "request",
					component: component as unknown as Step["component"],
					description: "Step 2",
					params: {},
					handlers: [],
					mode: "action",
				},
			];

			await executeSteps(steps, "tc_1", { onStepComplete: callback });

			expect(callback).toHaveBeenCalledTimes(2);
		});

		it("should handle abort signal", async () => {
			const controller = new AbortController();
			const component = createMockComponent("test");

			// Abort immediately
			controller.abort();

			const steps: Step[] = [
				{
					id: "step_1",
					type: "request",
					component: component as unknown as Step["component"],
					description: "Step 1",
					params: {},
					handlers: [],
					mode: "action",
				},
			];

			const results = await executeSteps(steps, "tc_1", {
				abortSignal: controller.signal,
			});

			expect(results[0].passed).toBe(false);
			expect(results[0].error?.message).toContain("aborted");
		});

		it("should record duration for each step", async () => {
			const component = createMockComponent("test", async () => {
				await new Promise((resolve) => setTimeout(resolve, 50));
			});

			const steps: Step[] = [
				{
					id: "step_1",
					type: "request",
					component: component as unknown as Step["component"],
					description: "Step 1",
					params: {},
					handlers: [],
					mode: "action",
				},
			];

			const results = await executeSteps(steps, "tc_1");

			expect(results[0].duration).toBeGreaterThanOrEqual(40);
			expect(results[0].startTime).toBeLessThan(results[0].endTime);
		});
	});

	describe("summarizeStepResults", () => {
		it("should summarize step results", () => {
			const mockStep = {
				type: "request",
				componentName: "test",
				description: "Test",
				phase: "test" as const,
				action: async () => {},
			};

			const results = [
				{
					step: mockStep,
					passed: true,
					duration: 100,
					startTime: 0,
					endTime: 100,
				},
				{
					step: mockStep,
					passed: true,
					duration: 50,
					startTime: 100,
					endTime: 150,
				},
				{
					step: mockStep,
					passed: false,
					duration: 25,
					startTime: 150,
					endTime: 175,
					error: new Error("Failed"),
				},
			];

			const summary = summarizeStepResults(results);

			expect(summary.passed).toBe(2);
			expect(summary.failed).toBe(1);
			expect(summary.total).toBe(3);
			expect(summary.duration).toBe(175);
			expect(summary.allPassed).toBe(false);
		});

		it("should report allPassed when all pass", () => {
			const mockStep = {
				type: "request",
				componentName: "test",
				description: "Test",
				phase: "test" as const,
				action: async () => {},
			};

			const results = [
				{
					step: mockStep,
					passed: true,
					duration: 100,
					startTime: 0,
					endTime: 100,
				},
				{
					step: mockStep,
					passed: true,
					duration: 50,
					startTime: 100,
					endTime: 150,
				},
			];

			const summary = summarizeStepResults(results);

			expect(summary.allPassed).toBe(true);
		});
	});
});
