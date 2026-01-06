/**
 * Step Executor Tests
 */

import type { StepExecutionContext, TestStep } from "testurio";
import { executeStep, executeSteps, filterStepsByPhase, summarizeStepResults } from "testurio";
import { describe, expect, it, vi } from "vitest";

describe("Step Executor", () => {
	describe("executeStep", () => {
		it("should execute a successful step", async () => {
			const step: TestStep = {
				type: "custom",
				phase: "test",
				description: "Test step",
				action: vi.fn().mockResolvedValue(undefined),
			};

			const context: StepExecutionContext = {
				currentStep: step,
				totalSteps: 1,
				stepIndex: 0,
				testContext: {},
			};

			const result = await executeStep(step, context);

			expect(result.passed).toBe(true);
			expect(result.error).toBeUndefined();
			expect(step.action).toHaveBeenCalled();
		});

		it("should handle step failure", async () => {
			const error = new Error("Step failed");
			const step: TestStep = {
				type: "custom",
				phase: "test",
				description: "Failing step",
				action: vi.fn().mockRejectedValue(error),
			};

			const context: StepExecutionContext = {
				currentStep: step,
				totalSteps: 1,
				stepIndex: 0,
				testContext: {},
			};

			const result = await executeStep(step, context);

			expect(result.passed).toBe(false);
			expect(result.error?.message).toBe("Step failed");
		});

		it("should timeout long-running steps", async () => {
			const step: TestStep = {
				type: "custom",
				phase: "test",
				description: "Slow step",
				timeout: 50,
				action: () => new Promise((resolve) => setTimeout(resolve, 200)),
			};

			const context: StepExecutionContext = {
				currentStep: step,
				totalSteps: 1,
				stepIndex: 0,
				testContext: {},
			};

			const result = await executeStep(step, context);

			expect(result.passed).toBe(false);
			expect(result.error?.message).toContain("timeout");
		});

		it("should record duration", async () => {
			const step: TestStep = {
				type: "wait",
				phase: "test",
				description: "Wait step",
				action: () => new Promise((resolve) => setTimeout(resolve, 50)),
			};

			const context: StepExecutionContext = {
				currentStep: step,
				totalSteps: 1,
				stepIndex: 0,
				testContext: {},
			};

			const result = await executeStep(step, context);

			expect(result.duration).toBeGreaterThanOrEqual(40);
			expect(result.startTime).toBeLessThan(result.endTime);
		});
	});

	describe("executeSteps", () => {
		it("should execute multiple steps sequentially", async () => {
			const executionOrder: number[] = [];

			const steps: TestStep[] = [
				{
					type: "custom",
					phase: "test",
					description: "Step 1",
					action: () => {
						executionOrder.push(1);
					},
				},
				{
					type: "custom",
					phase: "test",
					description: "Step 2",
					action: () => {
						executionOrder.push(2);
					},
				},
				{
					type: "custom",
					phase: "test",
					description: "Step 3",
					action: () => {
						executionOrder.push(3);
					},
				},
			];

			const results = await executeSteps(steps, {});

			expect(results).toHaveLength(3);
			expect(results.every((r) => r.passed)).toBe(true);
			expect(executionOrder).toEqual([1, 2, 3]);
		});

		it("should stop on failure with failFast", async () => {
			const steps: TestStep[] = [
				{
					type: "custom",
					phase: "test",
					description: "Step 1",
					action: vi.fn(),
				},
				{
					type: "custom",
					phase: "test",
					description: "Step 2 (fails)",
					action: () => {
						throw new Error("Failed");
					},
				},
				{
					type: "custom",
					phase: "test",
					description: "Step 3",
					action: vi.fn(),
				},
			];

			const results = await executeSteps(steps, {}, { failFast: true });

			expect(results).toHaveLength(2);
			expect(results[0].passed).toBe(true);
			expect(results[1].passed).toBe(false);
			expect(steps[2].action).not.toHaveBeenCalled();
		});

		it("should continue on failure without failFast", async () => {
			const steps: TestStep[] = [
				{
					type: "custom",
					phase: "test",
					description: "Step 1",
					action: vi.fn(),
				},
				{
					type: "custom",
					phase: "test",
					description: "Step 2 (fails)",
					action: () => {
						throw new Error("Failed");
					},
				},
				{
					type: "custom",
					phase: "test",
					description: "Step 3",
					action: vi.fn(),
				},
			];

			const results = await executeSteps(steps, {}, { failFast: false });

			expect(results).toHaveLength(3);
			expect(results[0].passed).toBe(true);
			expect(results[1].passed).toBe(false);
			expect(results[2].passed).toBe(true);
		});

		it("should call onStepComplete callback", async () => {
			const callback = vi.fn();

			const steps: TestStep[] = [
				{
					type: "custom",
					phase: "test",
					description: "Step 1",
					action: vi.fn(),
				},
				{
					type: "custom",
					phase: "test",
					description: "Step 2",
					action: vi.fn(),
				},
			];

			await executeSteps(steps, {}, { onStepComplete: callback });

			expect(callback).toHaveBeenCalledTimes(2);
		});
	});

	describe("filterStepsByPhase", () => {
		it("should filter steps by phase", () => {
			const steps: TestStep[] = [
				{ type: "custom", phase: "init", description: "Init", action: vi.fn() },
				{
					type: "custom",
					phase: "before",
					description: "Before",
					action: vi.fn(),
				},
				{
					type: "custom",
					phase: "test",
					description: "Test 1",
					action: vi.fn(),
				},
				{
					type: "custom",
					phase: "test",
					description: "Test 2",
					action: vi.fn(),
				},
				{
					type: "custom",
					phase: "after",
					description: "After",
					action: vi.fn(),
				},
			];

			const testSteps = filterStepsByPhase(steps, "test");

			expect(testSteps).toHaveLength(2);
			expect(testSteps[0].description).toBe("Test 1");
			expect(testSteps[1].description).toBe("Test 2");
		});
	});

	describe("summarizeStepResults", () => {
		it("should summarize step results", () => {
			const results = [
				{
					step: {} as TestStep,
					passed: true,
					duration: 100,
					startTime: 0,
					endTime: 100,
				},
				{
					step: {} as TestStep,
					passed: true,
					duration: 50,
					startTime: 100,
					endTime: 150,
				},
				{
					step: {} as TestStep,
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
			const results = [
				{
					step: {} as TestStep,
					passed: true,
					duration: 100,
					startTime: 0,
					endTime: 100,
				},
				{
					step: {} as TestStep,
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
