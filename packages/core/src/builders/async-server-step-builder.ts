/**
 * Async Server Step Builder
 *
 * Builder for async server operations (register message handlers).
 * Works for both mock mode and proxy mode.
 * For async protocols: TCP, WebSocket, gRPC streaming
 */

import type { AsyncServer } from "../components";
import { AsyncHookBuilderImpl } from "../hooks";
import { generateHookId } from "../hooks";
import type { Hook, Message } from "../types";
import type { TestCaseBuilder } from "./test-case-builder";

/**
 * Async Server Step Builder
 *
 * Provides declarative API for async message handling.
 * Works for both mock mode and proxy mode.
 */
export class AsyncServerStepBuilder<
	M extends Record<string, unknown> = Record<string, unknown>,
	TContext extends Record<string, unknown> = Record<string, unknown>,
> {
	constructor(
		private server: AsyncServer,
		private testBuilder: TestCaseBuilder<TContext>,
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
	 * @param messageType - Message type to wait for
	 * @param options - Optional timeout and matcher
	 */
	waitMessage<K extends keyof M = keyof M>(
		messageType: K,
		options?: {
			timeout?: number;
			matcher?: string | ((payload: M[K]) => boolean);
		},
	): AsyncHookBuilderImpl<M[K]> {
		const timeout = options?.timeout ?? 5000;
		const messageTypes = messageType as string;

		// Build payload matcher if provided
		const payloadMatcher = this.buildPayloadMatcher(options?.matcher);

		const hook: Hook = {
			id: generateHookId(),
			componentName: this.server.name,
			phase: "test",
			messageTypes,
			matcher: payloadMatcher,
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
			id: generateHookId(),
			componentName: this.server.name,
			phase: "test",
			messageTypes,
			matcher: payloadMatcher,
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
		const hookRegistry = this.server.getHookRegistry();
		hookRegistry.registerHook(captureHook);

		// Create a step that waits for the message
		this.testBuilder.registerStep({
			type: "waitForMessage",
			componentName: this.server.name,
			messageType: messageTypes,
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
					setTimeout(
						() =>
							reject(new Error(`Timeout waiting for message: ${messageTypes}`)),
						timeout,
					);
				});
				const msg = await Promise.race([messagePromise, timeoutPromise]);

				// Execute user handlers with the received message
				for (const handler of hook.handlers) {
					await handler.execute(msg as Message);
				}
			},
		});

		return new AsyncHookBuilderImpl<M[K]>(hook);
	}

	/**
	 * Register message handler (hook)
	 *
	 * In mock mode: Handle incoming messages from clients
	 * In proxy mode: Handle messages from client (downstream direction)
	 *
	 * @param messageType - Message type(s) to match (adapter-level)
	 * @param matcher - Optional payload matcher (traceId string or filter function)
	 */
	onMessage<K extends keyof M = keyof M>(
		messageType: K | K[],
		matcher?: string | ((payload: M[K]) => boolean),
	): AsyncHookBuilderImpl<M[K]> {
		// Convert message types to string or string[]
		const messageTypes = Array.isArray(messageType)
			? (messageType as string[])
			: (messageType as string);

		// Build payload matcher if provided
		const payloadMatcher = this.buildPayloadMatcher(matcher);

		const hook: Hook = {
			id: generateHookId(),
			componentName: this.server.name,
			phase: "test",
			messageTypes,
			matcher: payloadMatcher,
			handlers: [],
			persistent: false,
			metadata: this.server.isProxy ? { direction: "downstream" } : undefined,
		};

		// Register hook first, then pass to builder
		const hookRegistry = this.server.getHookRegistry();
		hookRegistry.registerHook(hook);

		return new AsyncHookBuilderImpl<M[K]>(hook);
	}

	/**
	 * Register event handler for events from target server (proxy mode only)
	 * Handles messages in upstream direction: target → proxy → client
	 *
	 * @param messageType - Message type(s) to match (adapter-level)
	 * @param matcher - Optional payload matcher (traceId string or filter function)
	 */
	onEvent<K extends keyof M = keyof M>(
		messageType: K | K[],
		matcher?: string | ((payload: M[K]) => boolean),
	): AsyncHookBuilderImpl<M[K]> {
		if (!this.server.isProxy) {
			throw new Error(
				`onEvent() is only available in proxy mode. Server "${this.server.name}" is in mock mode.`,
			);
		}

		const messageTypes = Array.isArray(messageType)
			? (messageType as string[])
			: (messageType as string);

		const payloadMatcher = this.buildPayloadMatcher(matcher);

		const hook: Hook = {
			id: generateHookId(),
			componentName: this.server.name,
			phase: "test",
			messageTypes,
			matcher: payloadMatcher,
			handlers: [],
			persistent: false,
			metadata: {
				direction: "upstream",
			},
		};

		// Register hook first, then pass to builder
		const hookRegistry = this.server.getHookRegistry();
		hookRegistry.registerHook(hook);

		return new AsyncHookBuilderImpl<M[K]>(hook);
	}

	/**
	 * Build payload matcher from string (traceId) or function
	 */
	private buildPayloadMatcher<T>(
		matcher?: string | ((payload: T) => boolean),
	): Hook["matcher"] {
		if (!matcher) return undefined;

		if (typeof matcher === "string") {
			return { type: "traceId", value: matcher };
		}

		return { type: "function", fn: matcher as (payload: unknown) => boolean };
	}
}
