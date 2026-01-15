/**
 * Async Server Hook Builder
 *
 * Builder for handling async server messages/events in a declarative way.
 * Extends BaseHookBuilder with server-specific handler methods.
 *
 * Per design:
 * - Contains NO logic, only handler registration
 * - All execution logic is in the Component
 */

import { BaseHookBuilder } from "../base/hook-builder";

/**
 * Async Server Hook Builder
 *
 * Builder for handling messages/events in a declarative way.
 * Adds handlers to the step that will be executed by the component.
 *
 * @template TPayload - Message/event payload type (what comes in)
 */
export class AsyncServerHookBuilder<TPayload = unknown> extends BaseHookBuilder {
	/**
	 * Add assertion handler to validate the message/event.
	 *
	 * @param descriptionOrPredicate - Description string or predicate function
	 * @param predicate - Predicate function (if first param is description)
	 * @returns this for chaining
	 */
	assert(
		descriptionOrPredicate: string | ((payload: TPayload) => boolean | Promise<boolean>),
		predicate?: (payload: TPayload) => boolean | Promise<boolean>
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
	 * Add transform handler to modify the payload.
	 *
	 * @param descriptionOrHandler - Description string or transform function
	 * @param handler - Transform function (if first param is description)
	 * @returns new hook builder with transformed type
	 */
	transform<TResult = TPayload>(
		descriptionOrHandler: string | ((payload: TPayload) => TResult | Promise<TResult>),
		handler?: (payload: TPayload) => TResult | Promise<TResult>
	): AsyncServerHookBuilder<TResult> {
		const [description, fn] =
			typeof descriptionOrHandler === "string"
				? [descriptionOrHandler, handler]
				: [undefined, descriptionOrHandler];

		return this.addHandler<AsyncServerHookBuilder<TResult>>({
			type: "transform",
			description,
			params: { handler: fn },
		});
	}

	/**
	 * Send event to the client connection that triggered this handler (mock mode).
	 * NOT a broadcast - only sends to the specific connection.
	 *
	 * @param eventType - Event type to send
	 * @param descriptionOrHandler - Description string or handler function
	 * @param handler - Handler function (if first param is description)
	 * @returns this for chaining
	 */
	mockEvent<TEvent = unknown>(
		eventType: string,
		descriptionOrHandler: string | ((payload: TPayload) => TEvent | Promise<TEvent>),
		handler?: (payload: TPayload) => TEvent | Promise<TEvent>
	): this {
		const [description, fn] =
			typeof descriptionOrHandler === "string"
				? [descriptionOrHandler, handler]
				: [undefined, descriptionOrHandler];

		return this.addHandler({
			type: "mockEvent",
			description,
			params: { eventType, handler: fn },
		});
	}

	/**
	 * Add proxy handler (forward message to backend, optionally transform).
	 * In proxy mode, the transformed payload is sent to the backend server.
	 *
	 * @param descriptionOrHandler - Description string or transform function
	 * @param handler - Transform function (if first param is description)
	 * @returns this for chaining
	 */
	proxy(
		descriptionOrHandler?: string | ((payload: TPayload) => TPayload | Promise<TPayload>),
		handler?: (payload: TPayload) => TPayload | Promise<TPayload>
	): this {
		const [description, fn] =
			typeof descriptionOrHandler === "string"
				? [descriptionOrHandler, handler]
				: typeof descriptionOrHandler === "function"
					? [undefined, descriptionOrHandler]
					: [undefined, undefined];

		return this.addHandler({
			type: "proxy",
			description,
			params: { handler: fn },
		});
	}

	/**
	 * Add delay handler.
	 *
	 * @param descriptionOrMs - Description string or delay in ms
	 * @param ms - Delay in ms or function returning ms (if first param is description)
	 * @returns this for chaining
	 */
	delay(descriptionOrMs: string | number | (() => number), ms?: number | (() => number)): this {
		const [description, delayValue] =
			typeof descriptionOrMs === "string" ? [descriptionOrMs, ms] : [undefined, descriptionOrMs];

		return this.addHandler({
			type: "delay",
			description,
			params: { ms: delayValue },
		});
	}

	/**
	 * Drop the message (stop processing, don't forward in proxy mode).
	 */
	drop(): this {
		return this.addHandler({
			type: "drop",
			params: {},
		});
	}

	/**
	 * Set timeout for this hook.
	 *
	 * @param ms - Timeout in milliseconds
	 * @returns this for chaining
	 */
	timeout(ms: number): this {
		return this.setParam("timeout", ms);
	}

	/**
	 * Link the connection to a string identifier when this hook fires.
	 * The linkId can then be used to filter messages, send events, or disconnect.
	 *
	 * @param linkId - The string identifier to link this connection to
	 * @returns this for chaining
	 *
	 * @example
	 * ```typescript
	 * // Link on connection (order-based)
	 * srv.onConnection().link("client1");
	 *
	 * // Link on auth message (identity-based)
	 * srv.onMessage("Login", { matcher: (p) => p.username === "alice" })
	 *   .link("alice")
	 *   .mockEvent("LoginSuccess", () => ({ status: "ok" }));
	 *
	 * // Use linkId for filtering
	 * srv.onMessage("Data", { linkId: "alice" })
	 *   .mockEvent("Response", (p) => p);
	 * ```
	 */
	link(linkId: string): this {
		return this.addHandler({
			type: "link",
			description: `Link connection to ${linkId}`,
			params: { linkId },
		});
	}
}
