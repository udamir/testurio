/**
 * Base Hook Builder
 *
 * Abstract base class for all hook builders.
 * Contains NO execution logic - only handler registration.
 */

import type { Handler, Step } from "./step.types";

// =============================================================================
// BaseHookBuilder
// =============================================================================

/**
 * Base Hook Builder
 *
 * Abstract base class that provides handler registration functionality.
 * Subclasses implement component-specific handler methods.
 *
 * Key responsibilities:
 * - Register handlers with the step
 * - Update step parameters via setParam
 * - Return `this` for fluent API chaining
 *
 * @example
 * ```typescript
 * class MyHookBuilder extends BaseHookBuilder {
 *   assert(predicate: (p: unknown) => boolean): this {
 *     return this.addHandler({
 *       type: "assert",
 *       params: { predicate },
 *     });
 *   }
 *
 *   transform(handler: (p: unknown) => unknown): this {
 *     return this.addHandler({
 *       type: "transform",
 *       params: { handler },
 *     });
 *   }
 *
 *   timeout(ms: number): this {
 *     return this.setParam("timeout", ms);
 *   }
 * }
 * ```
 */
export abstract class BaseHookBuilder {
	/** Reference to the step - allows direct mutation of handlers and params */
	protected readonly step: Step;

	constructor(step: Step) {
		this.step = step;
	}

	/**
	 * Add a handler to the step
	 *
	 * @param handler - Handler to add
	 * @returns this for fluent chaining
	 */
	protected addHandler<T extends BaseHookBuilder = this>(handler: Handler): T {
		this.step.handlers.push(handler);
		return this as unknown as T;
	}

	/**
	 * Set a parameter on the step
	 *
	 * @param key - Parameter key
	 * @param value - Parameter value
	 * @returns this for fluent chaining
	 */
	protected setParam(key: string, value: unknown): this {
		(this.step.params as Record<string, unknown>)[key] = value;
		return this;
	}
}
