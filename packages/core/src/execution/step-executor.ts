/**
 * Step Executor
 *
 * Implements three-phase execution model for test steps:
 * - Phase 1: Register hooks (for steps with mode="hook" or mode="wait")
 * - Phase 2: Execute steps (call component.executeStep for each step)
 * - Phase 3: Cleanup (call component.clearHooks for each component)
 */

import type { Step } from "../components/base/step.types";
import type { Component } from "../components/base/base.types";
import type { StepExecutionResult, StepInfo, TestStepResult } from "./execution.types";

// =============================================================================
// Types
// =============================================================================

/**
 * Step execution options
 */
export interface StepExecutionOptions {
	/** Stop execution on first failure */
	failFast?: boolean;
	/** Default timeout for steps (ms) */
	timeout?: number;
	/** Abort signal for cancellation */
	abortSignal?: AbortSignal;
	/** Callback after each step completes */
	onStepComplete?: (result: StepExecutionResult, index: number) => void;
}

// =============================================================================
// Three-Phase Executor
// =============================================================================

/**
 * Execute steps using three-phase model.
 *
 * Phase 1: Register all hooks BEFORE any step execution
 *   - For each step with mode="hook" or mode="wait", call component.registerHook()
 *   - This ensures hooks are ready to catch messages before actions run
 *
 * Phase 2: Execute steps in order
 *   - For each step, call component.executeStep()
 *   - Component handles mode-specific behavior internally
 *
 * Phase 3: Cleanup (always runs, even on error)
 *   - For each component, call component.clearHooks(testCaseId)
 *
 * @param steps - Array of Step objects (pure data, no action functions)
 * @param testCaseId - Test case ID for hook isolation
 * @param options - Execution options
 * @returns Array of step results
 */
export async function executeSteps(
	steps: Step[],
	testCaseId: string,
	options?: StepExecutionOptions
): Promise<StepExecutionResult[]> {
	const results: StepExecutionResult[] = [];
	const components = new Set<Component>(steps.map((s) => s.component));
	const failFast = options?.failFast !== false; // Default true

	try {
		// =========================================================================
		// PHASE 1: Register all hooks BEFORE any step execution
		// =========================================================================
		for (const step of steps) {
			if (step.mode === "hook" || step.mode === "wait") {
				step.component.registerHook(step);
			}
		}

		// =========================================================================
		// PHASE 2: Execute steps in order
		// =========================================================================
		for (let i = 0; i < steps.length; i++) {
			const step = steps[i];
			const startTime = Date.now();

			// Check abort signal
			if (options?.abortSignal?.aborted) {
				results.push({
					step: toStepInfo(step),
					passed: false,
					duration: 0,
					startTime,
					endTime: Date.now(),
					error: new Error("Execution aborted"),
				});
				break;
			}

			try {
				await step.component.executeStep(step);

				const result: StepExecutionResult = {
					step: toStepInfo(step),
					passed: true,
					duration: Date.now() - startTime,
					startTime,
					endTime: Date.now(),
				};
				results.push(result);
				options?.onStepComplete?.(result, i);
			} catch (error) {
				const result: StepExecutionResult = {
					step: toStepInfo(step),
					passed: false,
					duration: Date.now() - startTime,
					startTime,
					endTime: Date.now(),
					error: error instanceof Error ? error : new Error(String(error)),
				};
				results.push(result);
				options?.onStepComplete?.(result, i);

				if (failFast) {
					break;
				}
			}
		}
	} finally {
		// =========================================================================
		// PHASE 3: Cleanup hooks (always runs, even on error)
		// =========================================================================
		for (const component of components) {
			try {
				component.clearHooks(testCaseId);
			} catch {
				// Ignore cleanup errors
			}
		}
	}

	return results;
}

/**
 * Extract step info for execution results.
 * Pure data - no action function.
 */
function toStepInfo(step: Step): StepInfo {
	const params = step.params as Record<string, unknown>;
	return {
		type: step.type,
		componentName: step.component.name,
		description: step.description,
		messageType: params?.messageType as string | undefined,
	};
}

/**
 * Convert StepExecutionResult to TestStepResult for reporting
 */
export function toTestStepResult(result: StepExecutionResult, index: number): TestStepResult {
	return {
		stepNumber: index + 1,
		type: result.step.type,
		description: result.step.description ?? result.step.type,
		componentName: result.step.componentName,
		passed: result.passed,
		duration: result.duration,
		error: result.error?.message,
		stackTrace: result.error?.stack,
	};
}

/**
 * Create step execution result summary
 */
export function summarizeStepResults(results: StepExecutionResult[]): {
	passed: number;
	failed: number;
	total: number;
	duration: number;
	allPassed: boolean;
} {
	const passed = results.filter((r) => r.passed).length;
	const failed = results.filter((r) => !r.passed).length;
	const duration = results.reduce((sum, r) => sum + r.duration, 0);

	return {
		passed,
		failed,
		total: results.length,
		duration,
		allPassed: failed === 0,
	};
}
