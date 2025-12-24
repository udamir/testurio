/**
 * Async Mock Step Builder
 *
 * Builder for async mock server operations (register message handlers).
 */

import type { MockComponent } from "../components";
import { AsyncHookBuilderImpl } from "../hooks";
import { generateHookId } from "../hooks";
import type { Hook, Message } from "../types";
import type { TestCaseBuilder } from "./test-case-builder";

/**
 * Async Mock Step Builder
 *
 * For async protocols: TCP, WebSocket, gRPC streaming
 */
export class AsyncMockStepBuilder<
	M extends Record<string, unknown> = Record<string, unknown>,
	TContext extends Record<string, unknown> = Record<string, unknown>,
> {
	constructor(
		private mock: MockComponent,
		private testBuilder: TestCaseBuilder<TContext>,
	) {}

	/**
	 * Component name
	 */
	get name(): string {
		return this.mock.name;
	}

	/**
	 * Listen address
	 */
	get listenAddress() {
		return this.mock.listenAddress;
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
			componentName: this.mock.name,
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
		// This hook only captures the message - user handlers are executed in the step
		const captureHook: Hook = {
			id: generateHookId(),
			componentName: this.mock.name,
			phase: "test",
			messageTypes,
			matcher: payloadMatcher,
			handlers: [{
				type: "proxy",
				execute: async (msg) => {
					resolveMessage(msg);
					return msg;
				},
			}],
			persistent: false,
			timeout,
		};

		// Register capture hook
		const hookRegistry = this.mock.getHookRegistry();
		hookRegistry.registerHook(captureHook);

		// Create a step that waits for the message
		this.testBuilder.registerStep({
			type: "waitForMessage",
			componentName: this.mock.name,
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
					setTimeout(() => reject(new Error(`Timeout waiting for message: ${messageTypes}`)), timeout);
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
			componentName: this.mock.name,
			phase: "test",
			messageTypes,
			matcher: payloadMatcher,
			handlers: [],
			persistent: false,
		};

		// Register hook first, then pass to builder
		const hookRegistry = this.mock.getHookRegistry();
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
