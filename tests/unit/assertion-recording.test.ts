/**
 * recordAssertion Tests
 *
 * Verifies the shared write site that components use from `case "assert":`
 * to surface assertion results onto the owning step. The reporter projection
 * later lifts these entries off `metadata.assertions` into the typed
 * `TestStepResult.assertions` slot.
 */

import type { AssertionResult, Step } from "testurio";
import { recordAssertion } from "testurio";
import { describe, expect, it } from "vitest";

function makeStep(metadata?: Record<string, unknown>): Step {
	return {
		id: "step_test",
		type: "assert",
		component: { name: "noop" } as unknown as Step["component"],
		params: {},
		handlers: [],
		mode: "action",
		metadata,
	};
}

describe("recordAssertion", () => {
	it("initializes metadata.assertions when no metadata exists", () => {
		const step = makeStep();
		const result: AssertionResult = { passed: true, description: "first" };

		recordAssertion(step, result);

		expect(step.metadata).toBeDefined();
		expect(step.metadata?.assertions).toEqual([result]);
	});

	it("appends to an existing assertions array", () => {
		const step = makeStep();
		const a: AssertionResult = { passed: true, description: "first" };
		const b: AssertionResult = { passed: false, description: "second", error: "boom" };

		recordAssertion(step, a);
		recordAssertion(step, b);

		expect(step.metadata?.assertions).toEqual([a, b]);
	});

	it("preserves pre-existing metadata keys", () => {
		const step = makeStep({ request: { method: "GET" }, traceId: "abc" });
		const result: AssertionResult = { passed: true, description: "ok" };

		recordAssertion(step, result);

		expect(step.metadata?.request).toEqual({ method: "GET" });
		expect(step.metadata?.traceId).toBe("abc");
		expect(step.metadata?.assertions).toEqual([result]);
	});
});
