/**
 * Sync Hook Builder
 *
 * Implements fluent hook builder for sync protocols.
 * Receives an already-registered hook and adds handlers to it.
 */

import type { Message } from "../../protocols/base";
import type { Hook, HookHandler, SyncHookBuilder } from "../base/base.types";
import { DropMessageError } from "../base/base.types";

/**
 * Sync Hook Builder Implementation
 *
 * Receives an already-registered hook from the caller.
 * Handler methods (assert, proxy, mockResponse, delay, drop) add handlers directly
 * to the hook.
 *
 * @template TPayload - Request payload type (what comes in)
 * @template TResponse - Response type (what mockResponse should return)
 */
export class SyncHookBuilderImpl<TPayload = unknown, TResponse = unknown>
	implements SyncHookBuilder<TPayload, TResponse>
{
	/**
	 * Create a new sync hook builder.
	 *
	 * @param hook - Already registered hook to add handlers to
	 */
	constructor(private hook: Hook<TPayload>) {}

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
	 * Add mock response handler (return custom response)
	 * Use this to mock a backend response for sync protocols (HTTP, gRPC Unary).
	 * The response type is inferred from the service definition.
	 *
	 * @param descriptionOrHandler - Description string or handler function
	 * @param handler - Handler function (if first param is description)
	 */
	mockResponse(
		descriptionOrHandler: string | ((payload: TPayload) => TResponse | Promise<TResponse>),
		handler?: (payload: TPayload) => TResponse | Promise<TResponse>
	): this {
		const description = typeof descriptionOrHandler === "string" ? descriptionOrHandler : undefined;
		const responseHandler = typeof descriptionOrHandler === "function" ? descriptionOrHandler : handler!;

		this.addHandler({
			type: "mock",
			metadata: description ? { description } : undefined,
			execute: async (msg: Message<TPayload>) => {
				const response = await Promise.resolve(responseHandler(msg.payload));

				// TODO: fix type
				// Replace message payload with response
				return {
					type: "response",
					payload: response,
				} as Message<TPayload>;
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
	 * Add a handler to the hook
	 */
	private addHandler(handler: HookHandler<TPayload>): void {
		this.hook.handlers.push(handler);
	}
}
