/**
 * Async Client Step Builder
 *
 * Builder for async client operations (WebSocket, TCP, gRPC streams).
 * Implements the declarative sequential pattern:
 *   send() -> onEvent()/waitEvent()
 *
 * Event handling methods:
 * - onEvent(): Non-strict - works regardless of timing (event can arrive before step starts)
 * - waitEvent(): Strict - must be waiting when event arrives (error if event arrives early)
 *
 * Per design:
 * - Contains NO logic, only step registration
 * - All execution logic is in the Component
 */

import type { IAsyncProtocol, AsyncClientMessageType, AsyncServerMessageType } from "../../protocols/base";
import { BaseStepBuilder } from "../base/step-builder";
import { AsyncClientHookBuilder } from "./async-client.hook-builder";
import type { ExtractMessagePayload, ExtractEventPayload } from "./async-client.types";

/**
 * Async Client Step Builder
 *
 * Provides declarative API for async message/event flows.
 * All methods register steps - no execution logic here.
 *
 * @template P - Protocol type (IAsyncProtocol) - contains message definitions
 */
export class AsyncClientStepBuilder<P extends IAsyncProtocol = IAsyncProtocol> extends BaseStepBuilder {
	/**
	 * Send a message to server (action step)
	 *
	 * @param messageType - Message type identifier
	 * @param payload - Message payload
	 */
	sendMessage<K extends AsyncClientMessageType<P>>(messageType: K, payload: ExtractMessagePayload<P, K>): void {
		this.registerStep({
			type: "sendMessage",
			description: `Send ${messageType}`,
			params: {
				messageType,
				payload,
			},
			handlers: [],
			mode: "action",
		});
	}

	/**
	 * Disconnect from server (action step)
	 */
	disconnect(): void {
		this.registerStep({
			type: "disconnect",
			description: `Disconnect`,
			params: {},
			handlers: [],
			mode: "action",
		});
	}

	/**
	 * Wait for disconnection from server (STRICT).
	 *
	 * Must be waiting when disconnect happens - error if disconnect happens before step starts.
	 * Use this when you expect the server to close the connection.
	 *
	 * @example
	 * ```typescript
	 * client.sendMessage("Logout", {});
	 * client.waitDisconnect().timeout(1000);
	 * ```
	 */
	waitDisconnect(): AsyncClientHookBuilder<void> {
		return this.registerStep(
			{
				type: "waitDisconnect",
				description: `Wait for disconnection`,
				params: {},
				handlers: [],
				mode: "wait",
			},
			AsyncClientHookBuilder<void>
		);
	}

	/**
	 * Handle event from server (NON-STRICT)
	 *
	 * Flexible timing - works regardless of whether event arrives before or after step starts.
	 * Use this when step order might vary, or testing scenarios where timing is unpredictable.
	 *
	 * @param eventType - Event type to match
	 * @param options - Optional settings: matcher to filter by payload
	 */
	onEvent<K extends AsyncServerMessageType<P>, TPayload = ExtractEventPayload<P, K>>(
		eventType: K,
		options?: { matcher?: (payload: TPayload) => boolean }
	): AsyncClientHookBuilder<TPayload> {
		return this.registerStep(
			{
				type: "onEvent",
				description: `Handle event ${eventType}`,
				params: {
					eventType,
					matcher: options?.matcher,
				},
				handlers: [],
				mode: "hook",
			},
			AsyncClientHookBuilder<TPayload>
		);
	}

	/**
	 * Wait for event from server (STRICT)
	 *
	 * Must be waiting when event arrives - error if event arrives before step starts.
	 * Use this when you want strict ordering enforced, fail-fast if test logic is wrong.
	 *
	 * @param eventType - Event type to match
	 * @param options - Optional settings: matcher to filter by payload
	 */
	waitEvent<K extends AsyncServerMessageType<P>, TPayload = ExtractEventPayload<P, K>>(
		eventType: K,
		options?: { matcher?: (payload: TPayload) => boolean }
	): AsyncClientHookBuilder<TPayload> {
		return this.registerStep(
			{
				type: "waitEvent",
				description: `Wait for event ${eventType}`,
				params: {
					eventType,
					matcher: options?.matcher,
				},
				handlers: [],
				mode: "wait",
			},
			AsyncClientHookBuilder<TPayload>
		);
	}
}
