/**
 * Sync Client Hook Builder
 *
 * Builder for handling sync client responses in a declarative way.
 * Extends BaseHookBuilder with client-specific handler methods.
 *
 * Per design:
 * - Contains NO logic, only handler registration
 * - All execution logic is in the Component
 */

import type { SchemaLike } from "../../validation";
import { BaseHookBuilder } from "../base/hook-builder";

/**
 * Sync Client Hook Builder
 *
 * Builder for handling responses in a declarative way.
 * Adds handlers to the step that will be executed by the component.
 *
 * @template TResponse - Response type from the protocol
 */
export class SyncClientHookBuilder<TResponse = unknown> extends BaseHookBuilder {
	/**
	 * Add assertion handler to validate the response.
	 *
	 * @param descriptionOrPredicate - Description string or predicate function
	 * @param predicate - Predicate function (if first param is description)
	 * @returns this for chaining
	 */
	assert(
		descriptionOrPredicate: string | ((response: TResponse) => boolean | Promise<boolean>),
		predicate?: (response: TResponse) => boolean | Promise<boolean>
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
	 * Add transform handler to modify the response.
	 *
	 * @param descriptionOrHandler - Description string or transform function
	 * @param handler - Transform function (if first param is description)
	 * @returns this for chaining
	 */
	transform<TResult = TResponse>(
		descriptionOrHandler: string | ((response: TResponse) => TResult | Promise<TResult>),
		handler?: (response: TResponse) => TResult | Promise<TResult>
	): SyncClientHookBuilder<TResult> {
		const [description, fn] =
			typeof descriptionOrHandler === "string" ? [descriptionOrHandler, handler] : [undefined, descriptionOrHandler];

		// Return with new type
		return this.addHandler<SyncClientHookBuilder<TResult>>({
			type: "transform",
			description,
			params: { handler: fn },
		});
	}

	/**
	 * Validate the response payload against a schema.
	 *
	 * No-args: looks up schema from protocol/component registry at runtime.
	 * With schema: uses explicit schema and narrows the type.
	 *
	 * @param schema - Optional explicit schema (overrides registry lookup)
	 * @returns hook builder with validated type
	 */
	validate(): this;
	validate<TOutput>(schema: SchemaLike<TOutput>): SyncClientHookBuilder<TOutput>;
	validate<TOutput = TResponse>(schema?: SchemaLike<TOutput>): SyncClientHookBuilder<TOutput> {
		const stepParams = this.step.params as Record<string, unknown>;
		return this.addHandler<SyncClientHookBuilder<TOutput>>({
			type: "validate",
			params: {
				schema: schema ?? undefined,
				lookupKey: stepParams.messageType,
				lookupDirection: "response",
			},
		});
	}

	/**
	 * Set timeout for waiting for the response.
	 * If the response is not received within the timeout, the request fails.
	 * Updates step.params.timeout (not a handler).
	 *
	 * @param ms - Timeout in milliseconds
	 * @returns this for chaining
	 */
	timeout(ms: number): this {
		return this.setParam("timeout", ms);
	}
}
