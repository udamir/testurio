/**
 * Async Server Step Builder
 *
 * Builder for async server operations (register message handlers).
 * Works for both mock mode and proxy mode.
 * For async protocols: TCP, WebSocket, gRPC streaming
 */

import type { ITestCaseBuilder } from "../../execution/execution.types";
import type {
	AsyncClientMessageType,
	AsyncServerMessageType,
	ExtractClientPayload,
	ExtractServerPayload,
	IAsyncProtocol,
	Message,
	ProtocolMessages,
} from "../../protocols/base";
import { generateId } from "../../utils";
import type { Hook } from "../base";
import type { AsyncServer } from "./async-server.component";
import { AsyncServerHookBuilder } from "./async-server.hook-builder";

/**
 * Async Server Step Builder
 *
 * Provides declarative API for async message handling.
 * Works for both mock mode and proxy mode.
 *
 * @template P - Protocol type (messages are extracted via ProtocolMessages<P>)
 */
export class AsyncServerStepBuilder<P extends IAsyncProtocol = IAsyncProtocol> {
	constructor(
		private server: AsyncServer<P>,
		private testBuilder: ITestCaseBuilder
	) {}

	/**
	 * Component name
	 */
	get name(): string {
		return this.server.name;
	}

	/**
	 * Listen address
	 */
	get listenAddress() {
		return this.server.listenAddress;
	}

	/**
	 * Target address (proxy mode only)
	 */
	get targetAddress() {
		return this.server.targetAddress;
	}

	/**
	 * Whether server is in proxy mode
	 */
	get isProxy(): boolean {
		return this.server.isProxy;
	}

	/**
	 * Wait for a message with timeout (blocking step)
	 *
	 * Unlike onMessage which just registers a hook, waitMessage creates a step
	 * that blocks until the message is received or timeout expires.
	 *
	 * In loose mode (no type parameter on protocol):
	 * - messageType accepts any string
	 * - payload typed as `unknown`
	 *
	 * In strict mode (with type parameter):
	 * - messageType constrained to defined client message types
	 * - payload typed according to message definition
	 *
	 * @param messageType - Message type to wait for
	 * @param options - Optional timeout and matcher
	 */
	waitMessage<K extends AsyncClientMessageType<P>>(
		messageType: K,
		options?: {
			timeout?: number;
			matcher?: string | ((payload: ExtractClientPayload<P, K>) => boolean);
		}
	): AsyncServerHookBuilder<ExtractClientPayload<P, K>, ProtocolMessages<P>> {
		const timeout = options?.timeout ?? 5000;

		// Build payload matcher if provided
		const payloadMatcher = this.buildPayloadMatcher(options?.matcher);

		const hook: Hook = {
			id: generateId("hook_"),
			componentName: this.server.name,
			phase: "test",
			messageType,
			payloadMatcher,
			handlers: [],
			persistent: false,
			timeout,
		};

		// Create a promise that resolves when message is received
		let resolveMessage: (msg: unknown) => void;
		let capturedMessage: unknown = null;
		const messagePromise = new Promise<unknown>((resolve) => {
			resolveMessage = (msg: unknown) => {
				capturedMessage = msg;
				resolve(msg);
			};
		});

		// Create a capture hook that signals when message arrives
		const captureHook: Hook = {
			id: generateId(),
			componentName: this.server.name,
			phase: "test",
			messageType,
			payloadMatcher,
			handlers: [
				{
					type: "proxy",
					execute: async (msg) => {
						resolveMessage(msg);
						return msg;
					},
				},
			],
			persistent: false,
			timeout,
		};

		// Register capture hook
		this.server.registerHook(captureHook);

		// Create a step that waits for the message
		this.testBuilder.registerStep({
			type: "waitForMessage",
			componentName: this.server.name,
			messageType,
			timeout,
			description: `Wait for ${String(messageType)} message`,
			action: async () => {
				// If message already captured, execute user handlers immediately
				if (capturedMessage) {
					for (const handler of hook.handlers) {
						await handler.execute(capturedMessage as Message);
					}
					return;
				}

				// Wait for message with timeout
				const timeoutPromise = new Promise<never>((_, reject) => {
					setTimeout(() => reject(new Error(`Timeout waiting for message: ${messageType}`)), timeout);
				});
				const msg = await Promise.race([messagePromise, timeoutPromise]);

				// Execute user handlers with the received message
				for (const handler of hook.handlers) {
					await handler.execute(msg as Message);
				}
			},
		});

		return new AsyncServerHookBuilder<ExtractClientPayload<P, K>, ProtocolMessages<P>>(hook);
	}

	/**
	 * Register message handler (hook) for client messages
	 *
	 * In mock mode: Handle incoming messages from clients
	 * In proxy mode: Handle messages from client (downstream direction)
	 *
	 * In loose mode (no type parameter on protocol):
	 * - messageType accepts any string
	 * - payload typed as `unknown`
	 *
	 * In strict mode (with type parameter):
	 * - messageType constrained to defined client message types
	 * - payload typed according to message definition
	 *
	 * @param messageType - Message type to match (from clientMessages)
	 * @param matcher - Optional payload matcher (traceId string or filter function)
	 */
	onMessage<K extends AsyncClientMessageType<P>>(
		messageType: K,
		matcher?: string | ((payload: ExtractClientPayload<P, K>) => boolean)
	): AsyncServerHookBuilder<ExtractClientPayload<P, K>, ProtocolMessages<P>> {
		// Build payload matcher if provided
		const payloadMatcher = this.buildPayloadMatcher(matcher);

		const hook: Hook = {
			id: generateId(),
			componentName: this.server.name,
			phase: "test",
			messageType: messageType as string,
			payloadMatcher,
			handlers: [],
			persistent: false,
			metadata: this.server.isProxy ? { direction: "downstream" } : undefined,
		};

		// Register hook first, then pass to builder
		this.server.registerHook(hook);

		return new AsyncServerHookBuilder<ExtractClientPayload<P, K>, ProtocolMessages<P>>(hook);
	}

	/**
	 * Register event handler for events from target server (proxy mode only)
	 * Handles messages in upstream direction: target → proxy → client
	 *
	 * In loose mode (no type parameter on protocol):
	 * - messageType accepts any string
	 * - payload typed as `unknown`
	 *
	 * In strict mode (with type parameter):
	 * - messageType constrained to defined server message types
	 * - payload typed according to message definition
	 *
	 * @param messageType - Message type to match (from serverMessages)
	 * @param matcher - Optional payload matcher (traceId string or filter function)
	 */
	onEvent<K extends AsyncServerMessageType<P>>(
		messageType: K,
		matcher?: string | ((payload: ExtractServerPayload<P, K>) => boolean)
	): AsyncServerHookBuilder<ExtractServerPayload<P, K>, ProtocolMessages<P>> {
		if (!this.server.isProxy) {
			throw new Error(`onEvent() is only available in proxy mode. Server "${this.server.name}" is in mock mode.`);
		}

		const payloadMatcher = this.buildPayloadMatcher(matcher);

		const hook: Hook = {
			id: generateId(),
			componentName: this.server.name,
			phase: "test",
			messageType: messageType as string,
			payloadMatcher,
			handlers: [],
			persistent: false,
			metadata: {
				direction: "upstream",
			},
		};

		// Register hook first, then pass to builder
		this.server.registerHook(hook);

		return new AsyncServerHookBuilder<ExtractServerPayload<P, K>, ProtocolMessages<P>>(hook);
	}

	/**
	 * Build payload matcher from string (traceId) or function
	 */
	private buildPayloadMatcher<T>(matcher?: string | ((payload: T) => boolean)): Hook["payloadMatcher"] {
		if (!matcher) return undefined;

		if (typeof matcher === "string") {
			return { type: "traceId", value: matcher };
		}

		return { type: "function", fn: matcher as (payload: unknown) => boolean };
	}
}
