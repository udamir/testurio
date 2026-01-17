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
 */

import type { ISyncProtocol, SyncOperationId } from "../../protocols/base";
import { BaseStepBuilder } from "../base/step-builder";
import { SyncClientHookBuilder } from "./sync-client.hook-builder";
import type { ExtractClientResponse, ExtractRequestData } from "./sync-client.types";

/**
 * Request Builder - returned by request() for fluent chaining
 *
 * Allows chaining onResponse() directly to request() for concise syntax:
 *   api.request("getUsers", {...}).onResponse().assert(...)
 *
 * Creates separate steps in the report - onResponse() delegates to the step builder.
 *
 * @template P - Protocol type
 * @template K - Operation key
 */
export class SyncClientRequestBuilder<P extends ISyncProtocol, K extends SyncOperationId<P>> {
	private readonly stepBuilder: SyncClientStepBuilder<P>;
	private readonly messageType: K;
	private readonly traceId?: string;

	constructor(stepBuilder: SyncClientStepBuilder<P>, messageType: K, traceId?: string) {
		this.stepBuilder = stepBuilder;
		this.messageType = messageType;
		this.traceId = traceId;
	}

	/**
	 * Chain onResponse directly to request
	 *
	 * Creates a separate onResponse step (visible in reports).
	 * Returns SyncClientHookBuilder for assert/transform/timeout chaining.
	 *
	 * @param timeout - Optional timeout in ms (default: 5000)
	 */
	onResponse(timeout?: number): SyncClientHookBuilder<ExtractClientResponse<P, K>> {
		return this.stepBuilder.onResponse(this.messageType, this.traceId, timeout);
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
	 * Returns a builder for fluent chaining of onResponse().
	 *
	 * @param messageType - Message type identifier (operationId for HTTP, method name for gRPC)
	 * @param data - Request data (type comes directly from service definition)
	 * @param traceId - Optional traceId for explicit correlation with onResponse()
	 * @returns SyncClientRequestBuilder for chaining onResponse()
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
	 * ```
	 */
	request<K extends SyncOperationId<P>>(
		messageType: K,
		data: ExtractRequestData<P, K>,
		traceId?: string
	): SyncClientRequestBuilder<P, K> {
		this.registerStep({
			type: "request",
			description: `Request ${messageType}${traceId ? ` (${traceId})` : ""}`,
			params: {
				messageType,
				data,
				traceId,
			},
			handlers: [],
			mode: "action",
		});

		return new SyncClientRequestBuilder(this, messageType, traceId);
	}

	/**
	 * Register a hook to handle response (NON-STRICT)
	 *
	 * Flexible timing - works regardless of whether response arrives before or after step starts.
	 * Use this when step order might vary, or testing scenarios where timing is unpredictable.
	 *
	 * @param messageType - Message type to match
	 * @param traceId - Optional traceId for explicit correlation
	 * @param timeout - Optional timeout in ms (default: 5000)
	 */
	onResponse<K extends SyncOperationId<P>, TResponse = ExtractClientResponse<P, K>>(
		messageType: K,
		traceId?: string,
		timeout?: number
	): SyncClientHookBuilder<TResponse> {
		return this.registerStep(
			{
				type: "onResponse",
				description: `Handle response for ${messageType}${traceId ? ` (${traceId})` : ""}`,
				params: {
					messageType,
					traceId,
					timeout,
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
	 * @param timeout - Optional timeout in ms (default: 5000)
	 */
	waitResponse<K extends SyncOperationId<P>, TResponse = ExtractClientResponse<P, K>>(
		messageType: K,
		traceId?: string,
		timeout?: number
	): SyncClientHookBuilder<TResponse> {
		return this.registerStep(
			{
				type: "waitResponse",
				description: `Wait for response ${messageType}${traceId ? ` (${traceId})` : ""}`,
				params: {
					messageType,
					traceId,
					timeout,
				},
				handlers: [],
				mode: "wait",
			},
			SyncClientHookBuilder<TResponse>
		);
	}
}
