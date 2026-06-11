/**
 * Assertion Recording
 *
 * Shared write site for per-step assertion results. Used by every component's
 * `executeHandler` `case "assert":` branch so the reporter can render one
 * nested sub-step per assertion regardless of which component owns it.
 *
 * The helper stamps onto `step.metadata.assertions` because the 030
 * metadata-stamping pipeline already propagates `metadata` through
 * `toStepInfo` → `toTestStepResult`. The projection in
 * `toTestStepResult` lifts that array into the typed
 * `TestStepResult.assertions` slot — the `metadata.assertions` shape is an
 * internal carrier and not a public stamping target.
 */

import type { AssertionResult } from "../../execution/execution.types";
import type { Step } from "./step.types";

/**
 * Append an AssertionResult to step.metadata.assertions, initializing the
 * array lazily and preserving any pre-existing metadata keys.
 */
export function recordAssertion(step: Step, result: AssertionResult): void {
	step.metadata = step.metadata ? step.metadata : {};
	const existing = step.metadata.assertions;
	if (Array.isArray(existing)) {
		(existing as AssertionResult[]).push(result);
	} else {
		step.metadata.assertions = [result];
	}
}
