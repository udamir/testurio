/**
 * Async Server Step Builder
 *
 * Builder for async server operations (WebSocket, TCP, gRPC streams).
 * Implements the declarative sequential pattern for message/event handling.
 *
 * Message handling methods:
 * - onMessage(): Non-strict - works regardless of timing
 * - waitMessage(): Strict - must be waiting when message arrives
 *
 * Event sending methods:
 * - sendEvent(): Send to specific connection
 * - broadcast(): Send to all connections
 *
 * Proxy mode:
 * - onEvent(): Handle events from backend before forwarding to client
 *
 * Per design:
 * - Contains NO logic, only step registration
 * - All execution logic is in the Component
 */

import type { IAsyncProtocol, AsyncClientMessageType, AsyncServerMessageType } from "../../protocols/base";
import { BaseStepBuilder } from "../base/step-builder";
import { AsyncServerHookBuilder } from "./async-server.hook-builder";
import type { ExtractMessagePayload, ExtractEventPayload } from "./async-server.types";
import type { AsyncServer } from "./async-server.component";

/**
 * Async Server Step Builder
 *
 * Provides declarative API for async message/event flows.
 * All methods register steps - no execution logic here.
 *
 * @template P - Protocol type (IAsyncProtocol) - contains message definitions
 */
export class AsyncServerStepBuilder<P extends IAsyncProtocol = IAsyncProtocol> extends BaseStepBuilder {
	/**
	 * Link a connection when it connects.
	 *
	 * @param linkId - The string identifier to link this connection to
	 * @param options.matcher - Optional filter by protocol context (metadata, headers, etc.)
	 *
	 * @example
	 * ```typescript
	 * // Link first connection (order-based)
	 * srv.onConnection("client1");
	 *
	 * // Link with matcher (protocol-specific context)
	 * srv.onConnection("local", { matcher: (ctx) => ctx.remoteAddress?.includes("127.0.0.1") });
	 * ```
	 */
	onConnection(linkId: string, options?: {
		matcher?: (protocolContext: unknown) => boolean;
	}): void {
		this.registerStep({
			type: "onConnection",
			description: `Link connection to ${linkId}`,
			params: {
				linkId,
				matcher: options?.matcher,
			},
			handlers: [],
			mode: "hook",
		});
	}

	/**
	 * Wait for a client to connect (STRICT).
	 *
	 * Must be waiting when connection arrives - error if connection arrives before step starts.
	 * Links the connection to the specified linkId when it arrives.
	 *
	 * @param linkId - The string identifier to link this connection to
	 * @param options.matcher - Optional filter by protocol context (metadata, headers, etc.)
	 *
	 * @example
	 * ```typescript
	 * // Wait for first connection (strict ordering)
	 * srv.waitConnection("client1").timeout(2000);
	 *
	 * // Wait with matcher
	 * srv.waitConnection("admin", { matcher: (ctx) => ctx.path === "/admin" }).timeout(2000);
	 * ```
	 */
	waitConnection(linkId: string, options?: {
		matcher?: (protocolContext: unknown) => boolean;
	}): AsyncServerHookBuilder<unknown> {
		return this.registerStep(
			{
				type: "waitConnection",
				description: `Wait for connection ${linkId}`,
				params: {
					linkId,
					matcher: options?.matcher,
				},
				handlers: [],
				mode: "wait",
			},
			AsyncServerHookBuilder<unknown>
		);
	}

	/**
	 * Register a handler that fires when a linked connection disconnects.
	 *
	 * @param linkId - The link ID to monitor for disconnect
	 * @param handler - Callback when the linked connection closes
	 *
	 * @example
	 * ```typescript
	 * srv.onConnection().link("client1");
	 * srv.onDisconnect("client1", () => {
	 *   console.log("client1 disconnected");
	 * });
	 * ```
	 */
	onDisconnect(linkId: string, handler: () => void): void {
		// Register the disconnect handler with the component
		const component = this.component as AsyncServer<P>;
		component.registerDisconnectHandler(linkId, handler);
	}

	/**
	 * Wait for a linked connection to disconnect (STRICT).
	 *
	 * Must be waiting when disconnect happens - error if disconnect happens before step starts.
	 *
	 * @param linkId - The link ID to wait for disconnect
	 *
	 * @example
	 * ```typescript
	 * srv.onConnection("client");
	 * // ... client connects and does work ...
	 * srv.disconnect("client");
	 * srv.waitDisconnect("client").timeout(1000);
	 * ```
	 */
	waitDisconnect(linkId: string): AsyncServerHookBuilder<void> {
		return this.registerStep(
			{
				type: "waitDisconnect",
				description: `Wait for disconnect ${linkId}`,
				params: {
					linkId,
				},
				handlers: [],
				mode: "wait",
			},
			AsyncServerHookBuilder<void>
		);
	}

	/**
	 * Handle incoming message from client (NON-STRICT).
	 *
	 * Flexible timing - works regardless of whether message arrives before or after step starts.
	 * Use this when step order might vary, or testing scenarios where timing is unpredictable.
	 *
	 * @param messageType - Message type to match
	 * @param options.linkId - Filter to only handle messages from this linked connection
	 * @param options.matcher - Filter by payload content
	 */
	onMessage<K extends AsyncClientMessageType<P>, TPayload = ExtractMessagePayload<P, K>>(
		messageType: K,
		options?: { linkId?: string; matcher?: (payload: TPayload) => boolean }
	): AsyncServerHookBuilder<TPayload> {
		return this.registerStep(
			{
				type: "onMessage",
				description: `Handle message ${messageType}`,
				params: {
					messageType,
					linkId: options?.linkId,
					matcher: options?.matcher,
				},
				handlers: [],
				mode: "hook",
			},
			AsyncServerHookBuilder<TPayload>
		);
	}

	/**
	 * Wait for incoming message from client (STRICT).
	 *
	 * Must be waiting when message arrives - error if message arrives before step starts.
	 * Use this when you want strict ordering enforced, fail-fast if test logic is wrong.
	 *
	 * @param messageType - Message type to match
	 * @param options.linkId - Filter to only match messages from this linked connection
	 * @param options.matcher - Filter by payload content
	 */
	waitMessage<K extends AsyncClientMessageType<P>, TPayload = ExtractMessagePayload<P, K>>(
		messageType: K,
		options?: { linkId?: string; matcher?: (payload: TPayload) => boolean }
	): AsyncServerHookBuilder<TPayload> {
		return this.registerStep(
			{
				type: "waitMessage",
				description: `Wait for message ${messageType}`,
				params: {
					messageType,
					linkId: options?.linkId,
					matcher: options?.matcher,
				},
				handlers: [],
				mode: "wait",
			},
			AsyncServerHookBuilder<TPayload>
		);
	}

	/**
	 * Send event to a specific linked connection.
	 *
	 * @param linkId - The link ID to send to (required)
	 * @param eventType - Event type to send
	 * @param payload - Event payload
	 */
	sendEvent<K extends AsyncServerMessageType<P>>(
		linkId: string,
		eventType: K,
		payload: ExtractEventPayload<P, K>
	): void {
		this.registerStep({
			type: "sendEvent",
			description: `Send event ${eventType} to ${linkId}`,
			params: {
				linkId,
				eventType,
				payload,
			},
			handlers: [],
			mode: "action",
		});
	}

	/**
	 * Broadcast event to all client connections (action step).
	 *
	 * @param eventType - Event type to send
	 * @param payload - Event payload
	 */
	broadcast<K extends AsyncServerMessageType<P>>(eventType: K, payload: ExtractEventPayload<P, K>): void {
		this.registerStep({
			type: "broadcast",
			description: `Broadcast event ${eventType}`,
			params: {
				eventType,
				payload,
			},
			handlers: [],
			mode: "action",
		});
	}

	/**
	 * Disconnect a specific linked connection.
	 *
	 * @param linkId - The link ID to disconnect
	 */
	disconnect(linkId: string): void {
		this.registerStep({
			type: "disconnect",
			description: `Disconnect ${linkId}`,
			params: {
				linkId,
			},
			handlers: [],
			mode: "action",
		});
	}

	/**
	 * Handle event from backend (PROXY MODE, non-strict).
	 *
	 * Used to intercept/transform events from backend before forwarding to client.
	 * Only applicable when server is in proxy mode (has targetAddress).
	 *
	 * @param eventType - Event type to match
	 */
	onEvent<K extends AsyncServerMessageType<P>, TPayload = ExtractEventPayload<P, K>>(
		eventType: K
	): AsyncServerHookBuilder<TPayload> {
		return this.registerStep(
			{
				type: "onEvent",
				description: `Handle backend event ${eventType}`,
				params: {
					eventType,
				},
				handlers: [],
				mode: "hook",
			},
			AsyncServerHookBuilder<TPayload>
		);
	}
}
