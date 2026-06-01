/**
 * Sync Client Step Builder
 *
 * Builder for sync client operations (HTTP/gRPC unary requests).
 * Implements the declarative sequential pattern:
 *   request() -> onResponse()/waitResponse()
 *
 * Response handling methods:
 * - onResponse(): Non-strict - works regardless of timing (response can arrive before step starts)
 * - waitResponse(): Strict - must be waiting when response arrives (error if response arrives early)
 *
 * Per design:
 * - Contains NO logic, only step registration
 * - All execution logic is in the Component
 *
 * The request step's hook-style builder (`SyncClientRequestBuilder`) lives in
 * this file alongside `SyncClientStepBuilder` so that `.onResponse()` can
 * delegate straight back to the step builder without crossing a file boundary.
 * The response hook-style builder lives in `sync-client.response-hook-builder.ts`.
 */

import type { ISyncProtocol, SyncOperationId } from "../../protocols/base";
import { BaseHookBuilder } from "../base/hook-builder";
import { normalizeRetryPolicy } from "../base/retry";
import type { RetryOptions, RetryPredicate } from "../base/retry.types";
import type { Step, ValueOrFactory } from "../base/step.types";
import { BaseStepBuilder } from "../base/step-builder";
import { SyncClientHookBuilder } from "./sync-client.hook-builder";
import type { ExtractClientResponse, ExtractRequestData } from "./sync-client.types";

/**
 * Sync Client Request Hook Builder
 *
 * Returned by `Client.request(...)`. Owns the `request` step directly so
 * chained modifiers like `.retry(...)` can mutate `step.params` via the
 * standard `setParam` mechanism (symmetric with `DataSourceHookBuilder`).
 *
 * Lives in the same file as `SyncClientStepBuilder` so `.onResponse()` can
 * delegate straight back to the step builder without an extra import.
 *
 * @template P - Protocol type
 * @template K - Operation key
 */
export class SyncClientRequestBuilder<P extends ISyncProtocol, K extends SyncOperationId<P>> extends BaseHookBuilder {
	private readonly stepBuilder: SyncClientStepBuilder<P>;
	private readonly messageType: K;
	private readonly traceId?: string;

	constructor(step: Step, stepBuilder: SyncClientStepBuilder<P>, messageType: K, traceId?: string) {
		super(step);
		this.stepBuilder = stepBuilder;
		this.messageType = messageType;
		this.traceId = traceId;
	}

	/**
	 * Chain a response handler for this request — registers a separate
	 * `onResponse` step bound to the same `messageType` (and `traceId` if set).
	 *
	 * Returns the response hook builder for `.assert()` / `.transform()` /
	 * `.timeout()` / `.validate()` chaining.
	 */
	onResponse(): SyncClientHookBuilder<ExtractClientResponse<P, K>> {
		return this.stepBuilder.onResponse(this.messageType, this.traceId);
	}

	/**
	 * Poll this request: keep firing it until the predicate returns false,
	 * or the overall timeout elapses.
	 *
	 * Retry-WHILE semantics: predicate returns `true` → retry, `false` → stop
	 * and deliver the terminal response to any matching `onResponse` / `waitResponse` hook.
	 *
	 * Defaults: `timeout = 5000` ms, `interval = 1000` ms, `retryOnError = true`.
	 *
	 * Mutates `step.params.retry` directly via `setParam` — identical mechanism
	 * to `DataSourceHookBuilder.retry()`.
	 *
	 * @example
	 *   // Use all defaults (5s timeout, 1s interval).
	 *   api.request("getStatus", { method: "GET", path: "/status" })
	 *      .retry((res) => res.code !== 200);
	 *
	 * @example
	 *   // Override timeout only.
	 *   api.request("getStatus", { method: "GET", path: "/status" })
	 *      .retry((res) => res.code !== 200, 3000);
	 *
	 * @example
	 *   // Override both timeout and interval.
	 *   api.request("getStatus", { method: "GET", path: "/status" })
	 *      .retry((res) => res.code !== 200, { timeout: 3000, interval: 250 });
	 */
	retry(predicate: RetryPredicate<ExtractClientResponse<P, K>>): this;
	retry(predicate: RetryPredicate<ExtractClientResponse<P, K>>, timeoutMs: number): this;
	retry(predicate: RetryPredicate<ExtractClientResponse<P, K>>, options: RetryOptions): this;
	retry(predicate: RetryPredicate<ExtractClientResponse<P, K>>, timeoutOrOptions?: number | RetryOptions): this {
		const policy = normalizeRetryPolicy(predicate, timeoutOrOptions);
		return this.setParam("retry", policy);
	}
}

/**
 * Sync Client Step Builder
 *
 * Provides declarative API for sync request/response flows.
 * All methods register steps - no execution logic here.
 *
 * @template P - Protocol type (ISyncProtocol) - contains service definition via __types.service
 */
export class SyncClientStepBuilder<P extends ISyncProtocol = ISyncProtocol> extends BaseStepBuilder {
	/**
	 * Send a request (generic API for all sync protocols)
	 *
	 * After receiving response, triggers matching onResponse hooks.
	 * Returns a step-owning request builder for fluent chaining of `.onResponse()` and `.retry(...)`.
	 *
	 * @param messageType - Message type identifier (operationId for HTTP, method name for gRPC)
	 * @param data - Request data (type comes directly from service definition)
	 * @param traceId - Optional traceId for explicit correlation with onResponse()
	 * @returns SyncClientRequestBuilder for chaining `.onResponse()` / `.retry(...)`
	 *
	 * @example
	 * ```typescript
	 * // Without chaining (existing pattern)
	 * api.request("getUsers", { method: "GET", path: "/users" });
	 * api.onResponse("getUsers").assert((res) => res.status === 200);
	 *
	 * // With chaining (new pattern)
	 * api.request("getUsers", { method: "GET", path: "/users" })
	 *    .onResponse()
	 *    .assert((res) => res.status === 200);
	 *
	 * // With retry
	 * api.request("getStatus", { method: "GET", path: "/status" })
	 *    .retry((res) => res.code !== 200, 3000);
	 * ```
	 */
	request<K extends SyncOperationId<P>>(
		messageType: K,
		data: ValueOrFactory<ExtractRequestData<P, K>>,
		traceId?: string
	): SyncClientRequestBuilder<P, K> {
		return this.registerStep(
			{
				type: "request",
				description: `Request ${messageType}${traceId ? ` (${traceId})` : ""}`,
				params: {
					messageType,
					data,
					traceId,
				},
				handlers: [],
				mode: "action",
			},
			SyncClientRequestBuilder<P, K>,
			this,
			messageType,
			traceId
		);
	}

	/**
	 * Register a hook to handle response (NON-STRICT)
	 *
	 * Flexible timing - works regardless of whether response arrives before or after step starts.
	 * Use this when step order might vary, or testing scenarios where timing is unpredictable.
	 *
	 * @param messageType - Message type to match
	 * @param traceId - Optional traceId for explicit correlation
	 */
	onResponse<K extends SyncOperationId<P>, TResponse = ExtractClientResponse<P, K>>(
		messageType: K,
		traceId?: string
	): SyncClientHookBuilder<TResponse> {
		return this.registerStep(
			{
				type: "onResponse",
				description: `Handle response for ${messageType}${traceId ? ` (${traceId})` : ""}`,
				params: {
					messageType,
					traceId,
				},
				handlers: [],
				mode: "hook",
			},
			SyncClientHookBuilder<TResponse>
		);
	}

	/**
	 * Wait for response (STRICT)
	 *
	 * Must be waiting when response arrives - error if response arrives before step starts.
	 * Use this when you want strict ordering enforced, fail-fast if test logic is wrong.
	 *
	 * @param messageType - Message type to match
	 * @param traceId - Optional traceId for explicit correlation
	 */
	waitResponse<K extends SyncOperationId<P>, TResponse = ExtractClientResponse<P, K>>(
		messageType: K,
		traceId?: string
	): SyncClientHookBuilder<TResponse> {
		return this.registerStep(
			{
				type: "waitResponse",
				description: `Wait for response ${messageType}${traceId ? ` (${traceId})` : ""}`,
				params: {
					messageType,
					traceId,
				},
				handlers: [],
				mode: "wait",
			},
			SyncClientHookBuilder<TResponse>
		);
	}
}
