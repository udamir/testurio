/**
 * Sync Client Step Builder
 *
 * Builder for sync client operations (HTTP/gRPC unary requests).
 * Uses hook-based pattern: request() triggers hooks, onResponse() registers hooks.
 */

import type { ITestCaseBuilder } from "../../execution/execution.types";
import type { ISyncProtocol, Message, SyncOperationId } from "../../protocols/base";
import { generateId } from "../../utils";
import type { Hook } from "../base";
import type { Client } from "./sync-client.component";
import { SyncClientHookBuilder } from "./sync-client.hook-builder";
import type { ExtractClientResponse, ExtractRequestData } from "./sync-client.types";

/**
 * Sync Client Step Builder
 *
 * Provides declarative API for sync request/response flows.
 * Uses hook-based pattern where:
 * - request() makes the request and triggers matching hooks
 * - onResponse() registers hooks that handle responses
 *
 * @template A - Protocol type (ISyncProtocol) - contains service definition via __types.service
 */
export class SyncClientStepBuilder<A extends ISyncProtocol = ISyncProtocol> {
	constructor(
		private client: Client<A>,
		private testBuilder: ITestCaseBuilder
	) {}

	/**
	 * Send a request (generic API for all sync protocols)
	 *
	 * In loose mode (no type parameter on protocol):
	 * - messageType accepts any string
	 * - data is typed as the protocol's raw request type (e.g., HttpRequest)
	 *
	 * In strict mode (with type parameter):
	 * - messageType is constrained to defined operation IDs
	 * - data is typed according to service definition
	 *
	 * @param messageType - Message type identifier (operationId for HTTP, method name for gRPC)
	 * @param data - Request data (type comes directly from service definition)
	 * @param timeout - Optional request timeout in milliseconds
	 */
	request<K extends SyncOperationId<A>>(messageType: K, data: ExtractRequestData<A, K>, timeout?: number): void {
		const traceId = generateId("req_");

		this.testBuilder.registerStep({
			type: "request",
			componentName: this.client.name,
			messageType,
			description: `Request ${messageType}`,
			action: async () => {
				const response = await this.client.request(messageType, data, timeout);

				// Create message and trigger matching hooks
				const message: Message = {
					type: messageType,
					payload: response,
					traceId,
				};
				await this.client.executeMatchingHook(message);
			},
			metadata: {
				traceId,
			},
		});
	}

	/**
	 * Handle a response (declarative, hook-based)
	 *
	 * Registers a hook that will be triggered when request() receives a response.
	 * The hook matches by messageType and optional traceId.
	 *
	 * In loose mode (no type parameter on protocol):
	 * - Returns hook builder with protocol's raw response type (e.g., HttpResponse)
	 *
	 * In strict mode (with type parameter):
	 * - Returns hook builder with typed response from service definition
	 *
	 * @param messageType - Message type to match
	 * @param traceId - Optional traceId for explicit correlation
	 *                  If omitted, matches any request of this messageType
	 */
	onResponse<K extends SyncOperationId<A>, TResponse = ExtractClientResponse<A, K>>(
		messageType: K,
		traceId?: string
	): SyncClientHookBuilder<TResponse> {
		// Create hook with isMatch function
		const hook: Hook<Message<TResponse>> = {
			id: `${this.client.name}-response-${messageType}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
			componentName: this.client.name,
			phase: "test",
			isMatch: (msg: Message<TResponse>) => {
				if (msg.type !== messageType) {
					return false;
				}
				if (traceId && msg.traceId !== traceId) {
					return false;
				}
				return true;
			},
			handlers: [],
			persistent: false,
		};

		// Register hook on client component
		this.client.registerHook(hook);

		return new SyncClientHookBuilder<TResponse>(hook);
	}
}
