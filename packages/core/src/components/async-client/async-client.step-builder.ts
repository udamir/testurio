/**
 * Async Client Step Builder
 *
 * Builder for async client operations (send, wait for messages).
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
import type { Hook } from "../base/base.types";
import type { AsyncClient } from "./async-client.component";
import { AsyncClientHookBuilder } from "./async-client.hook-builder";

/**
 * Async Client Step Builder
 *
 * For async protocols: TCP, WebSocket, gRPC streaming
 *
 * @template P - Protocol type (messages are extracted via ProtocolMessages<P>)
 */
export class AsyncClientStepBuilder<P extends IAsyncProtocol = IAsyncProtocol> {
	constructor(
		private client: AsyncClient<P>,
		private testBuilder: ITestCaseBuilder
	) {}

	/**
	 * Component name
	 */
	get name(): string {
		return this.client.name;
	}

	/**
	 * Target address
	 */
	get targetAddress() {
		return this.client.targetAddress;
	}

	/**
	 * Check if client is connected
	 */
	isConnected(): boolean {
		return this.client.isStarted();
	}

	/**
	 * Connect to server (registers a connect step)
	 */
	connect(): void {
		this.testBuilder.registerStep({
			type: "connect",
			componentName: this.client.name,
			description: `Connect ${this.client.name}`,
			action: async () => {
				if (!this.client.isStarted()) {
					await this.client.start();
				}
			},
		});
	}

	/**
	 * Disconnect from server (registers a disconnect step)
	 */
	disconnect(): void {
		this.testBuilder.registerStep({
			type: "disconnect",
			componentName: this.client.name,
			description: `Disconnect ${this.client.name}`,
			action: async () => {
				if (this.client.isStarted()) {
					await this.client.stop();
				}
			},
		});
	}

	/**
	 * Send a message to server (from clientMessages)
	 *
	 * In loose mode (no type parameter on protocol):
	 * - messageType accepts any string
	 * - payload typed as `unknown`
	 *
	 * In strict mode (with type parameter):
	 * - messageType constrained to defined client message types
	 * - payload typed according to message definition
	 */
	sendMessage<K extends AsyncClientMessageType<P>>(
		messageType: K,
		payload: ExtractClientPayload<P, K> | (() => ExtractClientPayload<P, K> | Promise<ExtractClientPayload<P, K>>),
		traceId?: string
	): void {
		this.testBuilder.registerStep({
			type: "sendMessage",
			componentName: this.client.name,
			messageType: messageType as string,
			description: `Send ${String(messageType)} message`,
			action: async () => {
				const payloadValue =
					typeof payload === "function"
						? await Promise.resolve((payload as () => ExtractClientPayload<P, K>)())
						: payload;
				const message: Message = {
					type: messageType as string,
					payload: payloadValue,
					traceId,
				};
				await this.client.send(message);
			},
		});
	}

	/**
	 * Wait for a message and execute handler when received
	 *
	 * @param type - Message type to wait for
	 * @param handler - Handler to execute when message is received
	 * @param options - Optional timeout and filter
	 */
	waitFor(
		type: string,
		handler: (response: Message) => void | Promise<void>,
		options?: { timeout?: number; filter?: (msg: Message) => boolean }
	): void {
		this.testBuilder.registerStep({
			type: "waitForMessage",
			componentName: this.client.name,
			messageType: type,
			timeout: options?.timeout,
			description: `Wait for ${type} message`,
			action: async () => {
				// Create matcher function if filter provided
				const filterFn = options?.filter;
				const matcher = filterFn
					? (payload: unknown) => {
							const msg: Message = { type, payload };
							return filterFn(msg);
						}
					: undefined;

				const response = await this.client.waitForMessage(type, matcher, options?.timeout);
				await Promise.resolve(handler(response));
			},
		});
	}

	/**
	 * Wait for an event with timeout (blocking step)
	 *
	 * Unlike onEvent which just registers a hook, waitEvent creates a step
	 * that blocks until the event is received or timeout expires.
	 *
	 * In loose mode (no type parameter on protocol):
	 * - messageType accepts any string
	 * - payload typed as `unknown`
	 *
	 * In strict mode (with type parameter):
	 * - messageType constrained to defined server message types
	 * - payload typed according to message definition
	 *
	 * @param messageType - Message type to wait for (from serverMessages)
	 * @param options - Optional timeout and matcher
	 */
	waitEvent<K extends AsyncServerMessageType<P>>(
		messageType: K,
		options?: {
			timeout?: number;
			matcher?: string | ((payload: ExtractServerPayload<P, K>) => boolean);
		}
	): AsyncClientHookBuilder<ExtractServerPayload<P, K>, ProtocolMessages<P>> {
		const timeout = options?.timeout ?? 5000;
		const messageTypes = messageType as string;

		// Build payload matcher if provided
		const payloadMatcher = this.buildPayloadMatcher(options?.matcher);

		// Hook for user handlers (executed manually in step action)
		const hook: Hook = {
			id: generateId("hook_"),
			componentName: this.client.name,
			phase: "test",
			messageType: messageTypes,
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
		// This hook is registered immediately during BUILD phase to capture early messages
		const captureHook: Hook = {
			id: generateId("hook_"),
			componentName: this.client.name,
			phase: "test",
			messageType: messageTypes,
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

		// Register capture hook immediately to catch messages before step executes
		this.client.registerHook(captureHook);

		// Create a step that waits for the event
		this.testBuilder.registerStep({
			type: "waitForMessage",
			componentName: this.client.name,
			messageType: messageTypes,
			timeout,
			description: `Wait for ${String(messageType)} event`,
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
					setTimeout(() => reject(new Error(`Timeout waiting for event: ${messageTypes}`)), timeout);
				});
				const msg = await Promise.race([messagePromise, timeoutPromise]);

				// Execute user handlers with the received message
				for (const handler of hook.handlers) {
					await handler.execute(msg as Message);
				}
			},
		});

		return new AsyncClientHookBuilder<ExtractServerPayload<P, K>, ProtocolMessages<P>>(hook);
	}

	/**
	 * Register event handler (hook) for server messages
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
	 * @param timeout - Optional timeout in milliseconds
	 */
	onEvent<K extends AsyncServerMessageType<P>>(
		messageType: K,
		matcher?: string | ((payload: ExtractServerPayload<P, K>) => boolean),
		timeout?: number
	): AsyncClientHookBuilder<ExtractServerPayload<P, K>, ProtocolMessages<P>> {
		// Build payload matcher if provided
		const payloadMatcher = this.buildPayloadMatcher(matcher);

		const hook: Hook = {
			id: generateId("hook_"),
			componentName: this.client.name,
			phase: "test",
			messageType: messageType as string,
			payloadMatcher,
			handlers: [],
			persistent: false,
			timeout,
		};

		// Register hook first, then pass to builder
		this.client.registerHook(hook);

		return new AsyncClientHookBuilder<ExtractServerPayload<P, K>, ProtocolMessages<P>>(hook);
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
