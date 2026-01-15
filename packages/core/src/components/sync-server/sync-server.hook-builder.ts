/**
 * Sync Server Hook Builder
 *
 * Builder for handling sync server requests in a declarative way.
 * Extends BaseHookBuilder with server-specific handler methods.
 *
 * Per new design:
 * - Contains NO logic, only data registration
 * - All logic is in the Component
 */

import { BaseHookBuilder } from "../base/hook-builder";
/**
 * Sync Server Hook Builder
 *
 * Builder for handling requests in a declarative way.
 * Adds handlers to the step that will be executed by the component.
 *
 * @template TPayload - Request payload type (what comes in)
 * @template TResponse - Response type (what mockResponse should return)
 */
export class SyncServerHookBuilder<TPayload = unknown, TResponse = unknown> extends BaseHookBuilder {
	/**
	 * Add assertion handler to validate the request.
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
	 * Add transform handler to modify the request before processing.
	 *
	 * @param descriptionOrHandler - Description string or transform function
	 * @param handler - Transform function (if first param is description)
	 * @returns this for chaining
	 */
	transform<TResult = TPayload>(
		descriptionOrHandler: string | ((payload: TPayload) => TResult | Promise<TResult>),
		handler?: (payload: TPayload) => TResult | Promise<TResult>
	): SyncServerHookBuilder<TResult, TResponse> {
		const [description, fn] =
			typeof descriptionOrHandler === "string"
				? [descriptionOrHandler, handler]
				: [undefined, descriptionOrHandler];

		return this.addHandler<SyncServerHookBuilder<TResult, TResponse>>({
			type: "transform",
			description,
			params: { handler: fn },
		});
	}

	/**
	 * Add proxy handler (forward message, optionally transform).
	 * In proxy mode, the transformed payload is sent to the target server.
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
	 * Add mock response handler (return custom response).
	 * Use this to mock a backend response for sync protocols (HTTP, gRPC Unary).
	 * The response type is inferred from the service definition.
	 *
	 * @param descriptionOrHandler - Description string or handler function
	 * @param handler - Handler function (if first param is description)
	 * @returns this for chaining
	 */
	mockResponse(
		descriptionOrHandler: string | ((payload: TPayload) => TResponse | Promise<TResponse>),
		handler?: (payload: TPayload) => TResponse | Promise<TResponse>
	): this {
		const [description, fn] =
			typeof descriptionOrHandler === "string"
				? [descriptionOrHandler, handler]
				: [undefined, descriptionOrHandler];

		return this.addHandler({
			type: "mockResponse",
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
	 * Drop the message (stop propagation).
	 * In mock mode: returns null to protocol (404/no response)
	 * In proxy mode: doesn't forward to target
	 */
	drop(): this {
		return this.addHandler({
			type: "drop",
			params: {},
		});
	}
}
