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
export class AsyncClientHookBuilder<
	TPayload,
	// @ts-expect-error M is kept for API consistency with AsyncServerHookBuilder
	M extends Record<string, unknown> = Record<string, unknown>,
> {
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
	 */
	assert(handler: (payload: TPayload) => boolean | Promise<boolean>): this {
		this.addHandler({
			type: "assert",
			execute: async (msg: Message) => {
				const result = await Promise.resolve(handler(msg.payload as TPayload));
				if (!result) {
					throw new Error(`Assertion failed for message type: ${msg.type}`);
				}
				return msg;
			},
		});
		return this;
	}

	/**
	 * Add proxy handler (forward message, optionally transform)
	 */
	proxy(handler?: (payload: TPayload) => TPayload | Promise<TPayload>): this {
		this.addHandler({
			type: "proxy",
			execute: async (msg: Message) => {
				if (handler) {
					const transformedPayload = await Promise.resolve(
						handler(msg.payload as TPayload),
					);
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
	 */
	delay(ms: number | (() => number)): this {
		this.addHandler({
			type: "delay",
			execute: async (msg: Message) => {
				const delayMs = typeof ms === "function" ? ms() : ms;
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
	 * Add a handler to the hook
	 */
	protected addHandler(handler: HookHandler): void {
		this.hook.handlers.push(handler);
	}
}
