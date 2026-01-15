/**
 * Subscriber Hook Builder
 *
 * Builder for subscriber hook handlers.
 * Pure data builder - contains NO execution logic.
 */

import { BaseHookBuilder } from "../base/hook-builder";

/**
 * Subscriber Hook Builder
 *
 * Provides fluent API for adding handlers to subscriber hooks.
 * All methods register handlers - no execution logic here.
 *
 * @template TMessage - Adapter-specific message type
 */
export class SubscriberHookBuilder<TMessage> extends BaseHookBuilder {
	/**
	 * Add assertion handler to validate the message.
	 *
	 * @param descriptionOrPredicate - Description string or predicate function
	 * @param predicate - Predicate function if description provided
	 */
	assert(
		descriptionOrPredicate: string | ((message: TMessage) => boolean | Promise<boolean>),
		predicate?: (message: TMessage) => boolean | Promise<boolean>
	): this {
		const description = typeof descriptionOrPredicate === "string" ? descriptionOrPredicate : undefined;
		const fn = typeof descriptionOrPredicate === "function" ? descriptionOrPredicate : predicate;

		return this.addHandler({
			type: "assert",
			description,
			params: { predicate: fn },
		});
	}

	/**
	 * Add transform handler to modify the message.
	 *
	 * @param descriptionOrHandler - Description string or transform function
	 * @param handler - Transform function if description provided
	 */
	transform<TResult>(
		descriptionOrHandler: string | ((message: TMessage) => TResult | Promise<TResult>),
		handler?: (message: TMessage) => TResult | Promise<TResult>
	): SubscriberHookBuilder<TResult> {
		const description = typeof descriptionOrHandler === "string" ? descriptionOrHandler : undefined;
		const fn = typeof descriptionOrHandler === "function" ? descriptionOrHandler : handler;

		return this.addHandler<SubscriberHookBuilder<TResult>>({
			type: "transform",
			description,
			params: { handler: fn },
		});
	}

	/**
	 * Drop the message (stop processing).
	 */
	drop(): this {
		return this.addHandler({
			type: "drop",
			params: {},
		});
	}

	/**
	 * Set timeout for waiting for the message.
	 *
	 * @param ms - Timeout in milliseconds
	 */
	timeout(ms: number): this {
		return this.setParam("timeout", ms);
	}
}
