/**
 * Hook Types
 *
 * Runtime hook types - created from Steps during Phase 1.
 * Hooks are pure data - component manages all execution state.
 */

import type { Deferred } from "../../utils";
import type { Step } from "./step.types";

// =============================================================================
// Runtime Hook
// =============================================================================

/**
 * Hook - runtime representation created from Step
 *
 * Created by component from Step during Phase 1 (Hook Registration).
 * Hook is pure data - component manages all execution state.
 *
 * Note: Hook is intentionally non-generic to avoid contravariance issues.
 * All message/payload types are `unknown` at the hook level.
 * Type safety is enforced at the component API level (step builders, handlers).
 */
export interface Hook {
	/** Unique identifier for cleanup/lookup */
	id: string;

	/** Step ID that created this hook */
	stepId: string;

	/**
	 * Test case ID that owns this hook.
	 * Used for hook isolation - only clear hooks for this test case.
	 * Hooks without testCaseId (init phase) are preserved across all test cases.
	 */
	testCaseId?: string;

	/**
	 * Predicate to match incoming messages.
	 * Created by component from Step params.
	 * Accepts `unknown` - the matcher implementation handles type narrowing.
	 */
	isMatch: (message: unknown) => boolean;

	/**
	 * Reference to Step (contains handlers, params, mode).
	 * Component executes handlers by switching on handler.type.
	 */
	step: Step;

	/**
	 * Survive test case cleanup.
	 * True for init hooks (testCaseId === undefined).
	 */
	persistent: boolean;

	/**
	 * Pending deferred for wait steps.
	 * Created during registerHook for steps that need to wait for a value.
	 * Resolved when matching message/response arrives.
	 * Uses `unknown` to avoid contravariance issues - callers cast as needed.
	 */
	pending?: Deferred<unknown>;

	/**
	 * Whether the hook's pending has been resolved.
	 * Used to skip already-resolved hooks in message matching.
	 */
	resolved?: boolean;
}
