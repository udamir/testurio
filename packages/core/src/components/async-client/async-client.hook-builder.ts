/**
 * Async Client Hook Builder
 *
 * Builder for handling async client events in a declarative way.
 * Extends BaseHookBuilder with client-specific handler methods.
 *
 * Per design:
 * - Contains NO logic, only handler registration
 * - All execution logic is in the Component
 */

import { BaseHookBuilder } from "../base/hook-builder";

/**
 * Async Client Hook Builder
 *
 * Builder for handling events in a declarative way.
 * Adds handlers to the step that will be executed by the component.
 *
 * @template TPayload - Event payload type from the protocol
 */
export class AsyncClientHookBuilder<TPayload = unknown> extends BaseHookBuilder {
	/**
	 * Add assertion handler to validate the event.
	 *
	 * @param descriptionOrPredicate - Description string or predicate function
	 * @param predicate - Predicate function (if first param is description)
	 * @returns this for chaining
	 */
	assert(
		descriptionOrPredicate: string | ((payload: TPayload) => boolean | Promise<boolean>),
		predicate?: (payload: TPayload) => boolean | Promise<boolean>
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
	 * Add transform handler to modify the event payload.
	 *
	 * @param descriptionOrHandler - Description string or transform function
	 * @param handler - Transform function (if first param is description)
	 * @returns new hook builder with transformed type
	 */
	transform<TResult = TPayload>(
		descriptionOrHandler: string | ((payload: TPayload) => TResult | Promise<TResult>),
		handler?: (payload: TPayload) => TResult | Promise<TResult>
	): AsyncClientHookBuilder<TResult> {
		const [description, fn] =
			typeof descriptionOrHandler === "string"
				? [descriptionOrHandler, handler]
				: [undefined, descriptionOrHandler];

		return this.addHandler<AsyncClientHookBuilder<TResult>>({
			type: "transform",
			description,
			params: { handler: fn },
		});
	}

	/**
	 * Set timeout for waiting for the event.
	 * If the event is not received within the timeout, the step fails.
	 * Updates step.params.timeout (not a handler).
	 *
	 * @param ms - Timeout in milliseconds
	 * @returns this for chaining
	 */
	timeout(ms: number): this {
		return this.setParam("timeout", ms);
	}
}
