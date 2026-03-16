/**
 * Subscriber Hook Builder
 *
 * Builder for subscriber hook handlers.
 * Pure data builder - contains NO execution logic.
 */

import type { SchemaLike } from "../../validation";
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
	 * Validate the message payload against a schema.
	 *
	 * No-args: looks up schema from component registry at runtime.
	 * With schema: uses explicit schema and narrows the type.
	 *
	 * @param schema - Optional explicit schema (overrides registry lookup)
	 * @returns hook builder with validated type
	 */
	validate(): this;
	validate<TOutput>(schema: SchemaLike<TOutput>): SubscriberHookBuilder<TOutput>;
	validate<TOutput = TMessage>(schema?: SchemaLike<TOutput>): SubscriberHookBuilder<TOutput> {
		const stepParams = this.step.params as Record<string, unknown>;
		const topics = stepParams.topics as string[] | undefined;
		return this.addHandler<SubscriberHookBuilder<TOutput>>({
			type: "validate",
			params: {
				schema: schema ?? undefined,
				lookupKey: topics?.[0],
				lookupDirection: "message",
			},
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
