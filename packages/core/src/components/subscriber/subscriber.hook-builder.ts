/**
 * Subscriber Hook Builder
 *
 * Fluent builder for subscriber hooks (assert, transform, drop).
 */

import type { QueueMessage } from "../mq.base";
import type { SubscriberHook, SubscriberHookHandler } from "./subscriber.hook-types";
import { DropMQMessageError } from "./subscriber.hook-types";

/**
 * Hook builder interface for subscriber.
 *
 * @template TPayload - Message payload type
 */
export interface ISubscriberHookBuilder<TPayload> {
	readonly hookId: string;
	assert(fn: (message: QueueMessage<TPayload>) => boolean | Promise<boolean>): this;
	assert(description: string, fn: (message: QueueMessage<TPayload>) => boolean | Promise<boolean>): this;
	transform(fn: (message: QueueMessage<TPayload>) => QueueMessage<TPayload> | Promise<QueueMessage<TPayload>>): this;
	transform(
		description: string,
		fn: (message: QueueMessage<TPayload>) => QueueMessage<TPayload> | Promise<QueueMessage<TPayload>>
	): this;
	drop(): this;
}

/**
 * Subscriber hook builder implementation.
 *
 * @template TPayload - Message payload type
 */
export class SubscriberHookBuilder<TPayload> implements ISubscriberHookBuilder<TPayload> {
	constructor(private readonly hook: SubscriberHook<TPayload>) {}

	get hookId(): string {
		return this.hook.id;
	}

	/**
	 * Add assertion handler.
	 * If assertion fails, an error is thrown.
	 *
	 * @example
	 * ```typescript
	 * sub.onMessage("orders")
	 *   .assert((msg) => msg.payload.orderId !== undefined)
	 *   .assert("should have valid status", (msg) => ["pending", "shipped"].includes(msg.payload.status));
	 * ```
	 */
	assert(
		descriptionOrFn: string | ((message: QueueMessage<TPayload>) => boolean | Promise<boolean>),
		fn?: (message: QueueMessage<TPayload>) => boolean | Promise<boolean>
	): this {
		const description = typeof descriptionOrFn === "string" ? descriptionOrFn : undefined;
		const predicate = typeof descriptionOrFn === "function" ? descriptionOrFn : fn;

		if (!predicate) {
			throw new Error("assert() requires a handler function");
		}

		const handler: SubscriberHookHandler<TPayload> = {
			type: "assert",
			metadata: description ? { description } : undefined,
			execute: async (msg) => {
				const result = await Promise.resolve(predicate(msg));
				if (!result) {
					const errorMsg = description
						? `Assertion failed: ${description}`
						: `Assertion failed for message on topic: ${msg.topic}`;
					throw new Error(errorMsg);
				}
				return msg;
			},
		};

		// biome-ignore lint/suspicious/noExplicitAny: Type assertion needed for generic handler storage
		this.hook.handlers.push(handler as any);
		return this;
	}

	/**
	 * Add transform handler.
	 * Transforms the message before further processing.
	 *
	 * @example
	 * ```typescript
	 * sub.onMessage("orders")
	 *   .transform((msg) => ({
	 *     ...msg,
	 *     payload: { ...msg.payload, processed: true },
	 *   }));
	 * ```
	 */
	transform(
		descriptionOrFn:
			| string
			| ((message: QueueMessage<TPayload>) => QueueMessage<TPayload> | Promise<QueueMessage<TPayload>>),
		fn?: (message: QueueMessage<TPayload>) => QueueMessage<TPayload> | Promise<QueueMessage<TPayload>>
	): this {
		const description = typeof descriptionOrFn === "string" ? descriptionOrFn : undefined;
		const transformer = typeof descriptionOrFn === "function" ? descriptionOrFn : fn;

		if (!transformer) {
			throw new Error("transform() requires a handler function");
		}

		const handler: SubscriberHookHandler<TPayload> = {
			type: "transform",
			metadata: description ? { description } : undefined,
			execute: async (msg) => {
				return Promise.resolve(transformer(msg));
			},
		};

		// biome-ignore lint/suspicious/noExplicitAny: Type assertion needed for generic handler storage
		this.hook.handlers.push(handler as any);
		return this;
	}

	/**
	 * Drop the message (stop processing).
	 *
	 * @example
	 * ```typescript
	 * sub.onMessage("orders")
	 *   .assert((msg) => msg.payload.status === "cancelled")
	 *   .drop(); // Don't process cancelled orders
	 * ```
	 */
	drop(): this {
		const handler: SubscriberHookHandler<TPayload> = {
			type: "drop",
			execute: async () => {
				throw new DropMQMessageError();
			},
		};

		// biome-ignore lint/suspicious/noExplicitAny: Type assertion needed for generic handler storage
		this.hook.handlers.push(handler as any);
		return this;
	}
}
