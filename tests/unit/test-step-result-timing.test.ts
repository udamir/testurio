/**
 * TestStepResult timing propagation
 *
 * Verifies `toTestStepResult` carries the per-step `startTime`/`endTime`
 * stamped by `executeSteps` so the Allure reporter can render a per-step
 * duration badge.
 */

import type { StepExecutionResult } from "testurio";
import { toTestStepResult } from "testurio";
import { describe, expect, it } from "vitest";

function makeExecutionResult(overrides: Partial<StepExecutionResult> = {}): StepExecutionResult {
	return {
		step: {
			type: "request",
			componentName: "api",
			description: "send",
			messageType: "getUsers",
		},
		passed: true,
		duration: 42,
		startTime: 1_700_000_000_000,
		endTime: 1_700_000_000_042,
		...overrides,
	};
}

describe("toTestStepResult — timing propagation", () => {
	it("propagates startTime, endTime, and duration verbatim", () => {
		const result = toTestStepResult(makeExecutionResult(), 0);

		expect(result.startTime).toBe(1_700_000_000_000);
		expect(result.endTime).toBe(1_700_000_000_042);
		expect(result.duration).toBe(42);
		expect(result.endTime - result.startTime).toBe(result.duration);
	});

	it("propagates timing on failure as well as success", () => {
		const result = toTestStepResult(
			makeExecutionResult({
				passed: false,
				error: new Error("boom"),
				startTime: 1_700_000_000_100,
				endTime: 1_700_000_000_110,
				duration: 10,
			}),
			0
		);

		expect(result.passed).toBe(false);
		expect(result.startTime).toBe(1_700_000_000_100);
		expect(result.endTime).toBe(1_700_000_000_110);
		expect(result.duration).toBe(10);
	});

	it("uses stepNumber = index + 1", () => {
		const result = toTestStepResult(makeExecutionResult(), 5);
		expect(result.stepNumber).toBe(6);
	});
});
