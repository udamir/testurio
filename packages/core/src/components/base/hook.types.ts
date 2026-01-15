/**
 * Hook Types
 *
 * Runtime hook types - created from Steps during Phase 1.
 * Hooks are pure data - component manages all execution state.
 */

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
 * @template TMessage - The message type this hook handles
 */
export interface Hook<TMessage = unknown> {
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
	 */
	isMatch: (message: TMessage) => boolean;

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
}
