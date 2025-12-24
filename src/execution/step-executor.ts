/**
 * Step Executor
 *
 * Executes individual test steps with timeout and error handling.
 */

import type {
	StepExecutionContext,
	StepExecutionResult,
	TestStep,
} from "../types";

/**
 * Default step timeout (30 seconds)
 */
const DEFAULT_STEP_TIMEOUT = 30000;

/**
 * Execute a single test step
 */
export async function executeStep(
	step: TestStep,
	context: StepExecutionContext,
): Promise<StepExecutionResult> {
	const startTime = Date.now();
	const timeout = step.timeout ?? DEFAULT_STEP_TIMEOUT;

	try {
		// Create timeout promise
		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(() => {
				reject(
					new Error(
						`Step timeout after ${timeout}ms: ${step.description || step.type}`,
					),
				);
			}, timeout);
		});

		// Create abort check if signal provided
		const signal = context.abortSignal;
		const abortPromise = signal
			? new Promise<never>((_, reject) => {
					signal.addEventListener("abort", () => {
						reject(new Error("Step aborted"));
					});
				})
			: null;

		// Execute step with timeout
		const stepPromise = Promise.resolve(step.action());

		const racers: Promise<unknown>[] = [stepPromise, timeoutPromise];
		if (abortPromise) {
			racers.push(abortPromise);
		}

		await Promise.race(racers);

		const endTime = Date.now();

		return {
			step,
			passed: true,
			duration: endTime - startTime,
			startTime,
			endTime,
		};
	} catch (error) {
		const endTime = Date.now();

		return {
			step,
			passed: false,
			duration: endTime - startTime,
			startTime,
			endTime,
			error: error instanceof Error ? error : new Error(String(error)),
		};
	}
}

/**
 * Execute multiple steps sequentially
 */
export async function executeSteps(
	steps: TestStep[],
	testContext: Record<string, unknown>,
	options?: {
		failFast?: boolean;
		abortSignal?: AbortSignal;
		onStepComplete?: (result: StepExecutionResult, index: number) => void;
	},
): Promise<StepExecutionResult[]> {
	const results: StepExecutionResult[] = [];
	const failFast = options?.failFast ?? true;

	for (let i = 0; i < steps.length; i++) {
		const step = steps[i];

		// Check abort signal
		if (options?.abortSignal?.aborted) {
			results.push({
				step,
				passed: false,
				duration: 0,
				startTime: Date.now(),
				endTime: Date.now(),
				error: new Error("Execution aborted"),
			});
			break;
		}

		const context: StepExecutionContext = {
			currentStep: step,
			totalSteps: steps.length,
			stepIndex: i,
			testContext,
			abortSignal: options?.abortSignal,
		};

		const result = await executeStep(step, context);
		results.push(result);

		// Notify callback
		if (options?.onStepComplete) {
			options.onStepComplete(result, i);
		}

		// Stop on failure if failFast is enabled
		if (!result.passed && failFast) {
			break;
		}
	}

	return results;
}

/**
 * Filter steps by phase
 */
export function filterStepsByPhase(
	steps: TestStep[],
	phase: TestStep["phase"],
): TestStep[] {
	return steps.filter((step) => step.phase === phase);
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
