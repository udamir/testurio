/**
 * Sync Client Hook Builder
 *
 * Builder for handling sync client responses via hooks.
 * Assertions are added as handlers to the hook, triggered when request() receives a response.
 */

import type { Message } from "../../protocols/base";
import type { Hook, HookHandler } from "../base";

type Predicate<T> = (res: T) => boolean;

/**
 * Sync Client Hook Builder
 *
 * Builder for handling responses via hooks.
 * Assertions are added as handlers that run when the hook is triggered.
 */
export class SyncClientHookBuilder<TResponse = unknown> {
	constructor(private hook: Hook<Message<TResponse>>) {}

	/**
	 * Get the hook ID for debugging/testing
	 */
	get hookId(): string {
		return this.hook.id;
	}

	/**
	 * Assert on response
	 * Return true/false for assertion result.
	 *
	 * @param descriptionOrPredicate - Description string or predicate function
	 * @param predicate - Predicate function (if first param is description)
	 */
	assert<T extends string | Predicate<TResponse>>(
		descriptionOrPredicate: T,
		predicate?: T extends string ? Predicate<TResponse> : never
	): this {
		const [description, fn] =
			typeof descriptionOrPredicate === "string"
				? [descriptionOrPredicate, predicate as Predicate<TResponse>]
				: ["", descriptionOrPredicate];

		// Create assert handler
		const handler: HookHandler<Message<TResponse>, Message<TResponse>> = {
			type: "assert",
			execute: async (message: Message<TResponse>) => {
				const result = fn(message.payload);
				if (result === false) {
					const errorMsg = description
						? `Assertion failed: ${description}`
						: `Response assertion failed for ${message.type}`;
					throw new Error(errorMsg);
				}
				return message;
			},
			metadata: description ? { description } : undefined,
		};

		this.hook.handlers.push(handler);
		return this;
	}
}
