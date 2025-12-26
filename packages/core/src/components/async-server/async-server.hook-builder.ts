/**
 * Async Server Hook Builder
 *
 * Extends AsyncClientHookBuilder with server-specific methods (mockEvent).
 * Used for async server components (mock/proxy servers).
 */

import type { Message } from "../../base-adapter";
import type { ExtractMockEventResponse } from "../../base-adapter";
import { AsyncClientHookBuilder } from "../async-client/async-client.hook-builder";

/**
 * Async Server Hook Builder Implementation
 *
 * Extends client hook builder with mockEvent capability for mock servers.
 *
 * @template TPayload - Incoming message payload type
 * @template M - Full message definition for response type inference
 */
export class AsyncServerHookBuilder<
	TPayload,
	M extends Record<string, unknown> = Record<string, unknown>,
> extends AsyncClientHookBuilder<TPayload, M> {
	/**
	 * Add mock event handler (for mock servers in async protocols)
	 * Creates a separate response message to be sent back to the client.
	 * In async protocols (TCP, WebSocket, gRPC Stream), responses are independent
	 * messages with their own type.
	 *
	 * @template K - Response message type key (infers response payload from M[K])
	 * @param responseType - The message type for the response event
	 * @param handler - Function that generates the response payload (typed from M[K])
	 */
	mockEvent<K extends keyof M & string>(
		responseType: K,
		handler: (
			payload: TPayload,
		) => ExtractMockEventResponse<M, K> | Promise<ExtractMockEventResponse<M, K>>,
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
}
