/**
 * Sync Hook Builder
 *
 * Implements fluent hook builder for sync protocols.
 * Receives an already-registered hook and adds handlers to it.
 */

import type { Message, SyncResponse } from "../../protocols/base";
import type {
	Hook,
	HookHandler,
	SyncHookBuilder,
} from "../base/base.types";
import { DropMessageError } from "../base/base.types";

/**
 * Sync Hook Builder Implementation
 *
 * Receives an already-registered hook from the caller.
 * Handler methods (assert, proxy, mockResponse, delay, drop) add handlers directly
 * to the hook.
 */
export class SyncHookBuilderImpl<TPayload = unknown>
	implements SyncHookBuilder<TPayload>
{
	/**
	 * Create a new sync hook builder.
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
	 * Add mock response handler (return custom response)
	 * Use this to mock a backend response for sync protocols (HTTP, gRPC Unary).
	 */
	mockResponse<TResponse = unknown>(
		handler: (
			payload: TPayload,
		) => SyncResponse<TResponse> | Promise<SyncResponse<TResponse>>,
	): this {
		this.addHandler({
			type: "mock",
			execute: async (msg: Message) => {
				const response = await Promise.resolve(
					handler(msg.payload as TPayload),
				);

				// Replace message payload with response
				return {
					...msg,
					type: "response",
					payload: response,
				};
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
	private addHandler(handler: HookHandler): void {
		this.hook.handlers.push(handler);
	}
}
