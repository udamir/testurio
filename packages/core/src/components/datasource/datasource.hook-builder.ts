/**
 * DataSource Hook Builder
 *
 * Builder for handling DataSource exec results in a declarative way.
 * Extends BaseHookBuilder with DataSource-specific handler methods.
 *
 * Per design:
 * - Contains NO logic, only handler registration
 * - All execution logic is in the Component
 */

import { BaseHookBuilder } from "../base/hook-builder";

/**
 * DataSource Hook Builder
 *
 * Builder for handling exec results in a declarative way.
 * Adds handlers to the step that will be executed by the component.
 *
 * @template T - Result type from the exec callback
 */
export class DataSourceHookBuilder<T = unknown> extends BaseHookBuilder {
	/**
	 * Add assertion handler to validate the exec result.
	 *
	 * @param descriptionOrPredicate - Description string or predicate function
	 * @param predicate - Predicate function (if first param is description)
	 * @returns this for chaining
	 *
	 * @example
	 * // Without description
	 * .assert((val) => val !== null)
	 *
	 * @example
	 * // With description (for better reports)
	 * .assert("user should exist in cache", (val) => val !== null)
	 */
	assert(
		descriptionOrPredicate: string | ((result: T) => boolean | Promise<boolean>),
		predicate?: (result: T) => boolean | Promise<boolean>
	): this {
		const [description, fn] =
			typeof descriptionOrPredicate === "string"
				? [descriptionOrPredicate, predicate]
				: [undefined, descriptionOrPredicate];

		return this.addHandler({
			type: "assert",
			description,
			params: { predicate: fn },
		});
	}

	/**
	 * Set timeout for the exec operation.
	 * If the operation does not complete within the timeout, it fails.
	 * Updates step.params.timeout (not a handler).
	 *
	 * @param ms - Timeout in milliseconds
	 * @returns this for chaining
	 */
	timeout(ms: number): this {
		return this.setParam("timeout", ms);
	}
}
