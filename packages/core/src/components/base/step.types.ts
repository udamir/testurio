/**
 * Step Types
 *
 * Core types for test steps - pure data structures.
 * Steps contain NO execution logic.
 */

import type { Component } from "./base.types";

// =============================================================================
// Step Mode
// =============================================================================

/**
 * Step execution mode
 *
 * | Mode | Behavior | Examples |
 * |------|----------|----------|
 * | `action` | Execute immediately | `sendMessage`, `request`, `publish` |
 * | `hook` | Register, don't block | `onMessage`, `onRequest`, `onEvent` |
 * | `wait` | Register, block until match | `waitMessage`, `waitEvent` |
 */
export type StepMode = "action" | "hook" | "wait";

// =============================================================================
// Value or Factory
// =============================================================================

/**
 * A value that can be static or a factory function resolved at execution time.
 * Factory functions are called with no arguments — use closure variables for dynamic data.
 *
 * @example
 * ```typescript
 * let userId: string;
 * api.request("getUser", () => ({ method: "GET", path: `/users/${userId}` }));
 * ```
 */
export type ValueOrFactory<T> = T | (() => T);

/**
 * Resolve a ValueOrFactory to its concrete value.
 * If the value is a function, call it. Otherwise return as-is.
 */
export function resolveValue<T>(valueOrFactory: ValueOrFactory<T>): T {
	return typeof valueOrFactory === "function" ? (valueOrFactory as () => T)() : valueOrFactory;
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handler - pure data describing a handler operation
 *
 * Contains NO execute function - Component switches on `type`.
 */
export interface Handler<TType extends string = string, TParams = unknown> {
	type: TType;
	description?: string;
	params: TParams;
}

// =============================================================================
// Step
// =============================================================================

/**
 * Step - pure data describing a test step
 *
 * Contains NO action function - Component executes based on `type` and `params`.
 */
export interface Step<TType extends string = string, TParams = unknown> {
	id: string;
	type: TType;
	component: Component;
	description?: string;
	params: TParams;
	handlers: Handler[];
	mode: StepMode;

	/**
	 * Test case ID for hook isolation.
	 * Set by StepBuilder from context.testCaseId.
	 * Used when creating Hook from Step.
	 */
	testCaseId?: string;

	/**
	 * Reporter-facing payload metadata.
	 *
	 * Components stamp request/response/message payload data here during
	 * `executeStep` (or in hook handlers like `handleIncomingRequest`). The
	 * runtime propagates the stamped object through `StepInfo` →
	 * `StepExecutionResult` → `TestStepResult` so reporters (e.g.
	 * `@testurio/reporter-allure` with `includePayloads`) can render per-step
	 * request / response payloads.
	 *
	 * Recognized keys (read by `AllureReporter.convertStep` via `extractPayload`):
	 * `request`, `response`, `message`, `payload`, `data`, `body`.
	 *
	 * Use the {@link stampMetadata} helper to merge writes safely.
	 */
	metadata?: Record<string, unknown>;
}
