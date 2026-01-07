/**
 * Async Client Hook Builder
 *
 * Implements fluent hook builder for async client protocols.
 * Receives an already-registered hook and adds handlers to it.
 * Contains common methods used by both client and server.
 */

import type { Message } from "../../protocols/base";
import type { Hook, HookHandler } from "../base/base.types";
import { DropMessageError } from "../base/base.types";

/**
 * Async Client Hook Builder Implementation
 *
 * Base hook builder for async protocols with common methods.
 * Server hook builder extends this to add mockEvent capability.
 *
 * @template TPayload - Incoming message payload type
 * @template M - Full message definition for type inference (optional)
 */
export class AsyncClientHookBuilder<TPayload, _M = unknown> {
	/**
	 * Create a new async client hook builder.
	 *
	 * @param hook - Already registered hook to add handlers to
	 */
	constructor(protected hook: Hook) {}

	/**
	 * Get the hook ID
	 */
	get hookId(): string {
		return this.hook.id;
	}

	/**
	 * Add assertion handler
	 *
	 * @param descriptionOrHandler - Description string or handler function
	 * @param handler - Handler function (if first param is description)
	 */
	assert(
		descriptionOrHandler: string | ((payload: TPayload) => boolean | Promise<boolean>),
		handler?: (payload: TPayload) => boolean | Promise<boolean>
	): this {
		const description = typeof descriptionOrHandler === "string" ? descriptionOrHandler : undefined;
		const predicate = typeof descriptionOrHandler === "function" ? descriptionOrHandler : handler!;

		this.addHandler({
			type: "assert",
			metadata: description ? { description } : undefined,
			execute: async (msg: Message<TPayload>) => {
				const result = await Promise.resolve(predicate(msg.payload));
				if (!result) {
					const errorMsg = description
						? `Assertion failed: ${description}`
						: `Assertion failed for message type: ${msg.type}`;
					throw new Error(errorMsg);
				}
				return msg;
			},
		});
		return this;
	}

	/**
	 * Add proxy handler (forward message, optionally transform)
	 *
	 * @param descriptionOrHandler - Description string or handler function
	 * @param handler - Handler function (if first param is description)
	 */
	proxy(
		descriptionOrHandler?: string | ((payload: TPayload) => TPayload | Promise<TPayload>),
		handler?: (payload: TPayload) => TPayload | Promise<TPayload>
	): this {
		const description = typeof descriptionOrHandler === "string" ? descriptionOrHandler : undefined;
		const transformer = typeof descriptionOrHandler === "function" ? descriptionOrHandler : handler;

		this.addHandler({
			type: "proxy",
			metadata: description ? { description } : undefined,
			execute: async (msg: Message<TPayload>) => {
				if (transformer) {
					const transformedPayload = await Promise.resolve(transformer(msg.payload));
					return {
						...msg,
						payload: transformedPayload,
					};
				}
				// No handler - pass through unchanged
				return msg;
			},
		});
		return this;
	}

	/**
	 * Add delay handler
	 *
	 * @param descriptionOrMs - Description string or delay in ms
	 * @param ms - Delay in ms (if first param is description)
	 */
	delay(descriptionOrMs: string | number | (() => number), ms?: number | (() => number)): this {
		const description = typeof descriptionOrMs === "string" ? descriptionOrMs : undefined;
		const delayValue = typeof descriptionOrMs === "string" ? ms! : descriptionOrMs;

		this.addHandler({
			type: "delay",
			metadata: description ? { description } : undefined,
			execute: async (msg: Message<TPayload>) => {
				const delayMs = typeof delayValue === "function" ? delayValue() : delayValue;
				await new Promise((resolve) => setTimeout(resolve, delayMs));
				return msg;
			},
		});
		return this;
	}

	/**
	 * Drop the message (stop propagation)
	 */
	drop(): this {
		this.addHandler({
			type: "drop",
			execute: async () => {
				throw new DropMessageError();
			},
		});
		return this;
	}

	/**
	 * Add a handler to the hook.
	 * Handlers can return messages with different payload types (e.g., mockEvent returns response type).
	 */
	protected addHandler(handler: HookHandler<TPayload, unknown>): void {
		this.hook.handlers.push(handler as HookHandler<unknown>);
	}
}
