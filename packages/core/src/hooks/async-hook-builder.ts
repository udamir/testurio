/**
 * Async Hook Builder
 *
 * Implements fluent hook builder for async protocols.
 * Receives an already-registered hook and adds handlers to it.
 */

import type { AsyncHookBuilder, Hook, HookHandler, Message } from "../types";
import { DropMessageError } from "../types";

/**
 * Async Hook Builder Implementation
 *
 * Receives an already-registered hook from the caller.
 * Handler methods (assert, proxy, mockEvent, delay, drop) add handlers directly to the hook.
 */
export class AsyncHookBuilderImpl<TPayload>
	implements AsyncHookBuilder<TPayload>
{
	/**
	 * Create a new async hook builder.
	 *
	 * @param hook - Already registered hook to add handlers to
	 */
	constructor(private hook: Hook) {}

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
	 * Add mock event handler (for mock servers in async protocols)
	 * Creates a separate response message to be sent back to the client.
	 * In async protocols (TCP, WebSocket, gRPC Stream), responses are independent
	 * messages with their own type.
	 *
	 * @param responseType - The message type for the response event
	 * @param handler - Function that generates the response payload
	 */
	mockEvent<TResponse = unknown>(
		responseType: string,
		handler: (payload: TPayload) => TResponse | Promise<TResponse>,
	): this {
		this.addHandler({
			type: "mock",
			execute: async (msg: Message) => {
				const responsePayload = await Promise.resolve(
					handler(msg.payload as TPayload),
				);
				// Create a new response message (separate from the original)
				// The adapter will send this back to the client
				return {
					type: responseType,
					payload: responsePayload,
					traceId: msg.traceId,
					metadata: {
						timestamp: Date.now(),
						direction: "outbound",
						originalType: msg.type,
					},
				};
			},
		});
		return this;
	}

	/**
	 * Add a handler to the hook
	 */
	private addHandler(handler: HookHandler): void {
		this.hook.handlers.push(handler);
	}
}
