/**
 * Async Client Step Builder
 *
 * Builder for async client operations (send, wait for messages).
 */

import type { ITestCaseBuilder } from "../../execution/execution.types";
import { generateHookId } from "../base";
import { AsyncClientHookBuilder } from "./async-client.hook-builder";
import type { Message } from "../../protocols/base";
import type { Hook } from "../base/base.types";
import type { ExtractMessagePayload } from "../../protocols/base";
import type { AsyncClient } from "./async-client.component";

/**
 * Async Client Step Builder
 *
 * For async protocols: TCP, WebSocket, gRPC streaming
 */
export class AsyncClientStepBuilder<
	M extends Record<string, unknown> = Record<string, unknown>,
	TContext extends Record<string, unknown> = Record<string, unknown>,
> {
	constructor(
		private client: AsyncClient,
		private testBuilder: ITestCaseBuilder<TContext>,
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
	 * Send a message to server
	 */
	sendMessage<K extends keyof M = keyof M>(
		messageType: K,
		payload:
			| ExtractMessagePayload<M, K>
			| (() => ExtractMessagePayload<M, K> | Promise<ExtractMessagePayload<M, K>>),
		traceId?: string,
	): void {
		this.testBuilder.registerStep({
			type: "sendMessage",
			componentName: this.client.name,
			messageType: messageType as string,
			description: `Send ${String(messageType)} message`,
			action: async () => {
				const payloadValue =
					typeof payload === "function"
						? await Promise.resolve(
								(payload as () => ExtractMessagePayload<M, K>)(),
							)
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
		options?: { timeout?: number; filter?: (msg: Message) => boolean },
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

				const response = await this.client.waitForMessage(
					type,
					matcher,
					options?.timeout,
				);
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
	 * @param messageType - Message type to wait for
	 * @param options - Optional timeout and matcher
	 */
	waitEvent<K extends keyof M = keyof M>(
		messageType: K,
		options?: {
			timeout?: number;
			matcher?: string | ((payload: ExtractMessagePayload<M, K>) => boolean);
		},
	): AsyncClientHookBuilder<ExtractMessagePayload<M, K>, M> {
		const timeout = options?.timeout ?? 5000;
		const messageTypes = messageType as string;

		// Build payload matcher if provided
		const payloadMatcher = this.buildPayloadMatcher(options?.matcher);

		const hook: Hook = {
			id: generateHookId(),
			componentName: this.client.name,
			phase: "test",
			messageTypes,
			matcher: payloadMatcher,
			handlers: [],
			persistent: false,
			timeout,
		};

		// NOTE: Don't register hook with hookRegistry - we execute handlers manually in the step
		// This avoids double execution (once by protocol, once by step)

		// Create a step that waits for the event using client.waitForMessage
		this.testBuilder.registerStep({
			type: "waitForMessage",
			componentName: this.client.name,
			messageType: messageTypes,
			timeout,
			description: `Wait for ${String(messageType)} event`,
			action: async () => {
				// Build matcher function if needed
				const matcherFn =
					payloadMatcher?.type === "function"
						? (payload: unknown) =>
								(payloadMatcher.fn as (p: unknown) => boolean)(payload)
						: payloadMatcher?.type === "traceId"
							? (_payload: unknown, msg?: Message) =>
									msg?.traceId === payloadMatcher.value
							: undefined;

				// Wait for the message
				const receivedMessage = await this.client.waitForMessage(
					messageTypes,
					matcherFn,
					timeout,
				);

				// Execute hook handlers manually with the received message
				for (const handler of hook.handlers) {
					await handler.execute(receivedMessage);
				}
			},
		});

		return new AsyncClientHookBuilder<ExtractMessagePayload<M, K>, M>(hook);
	}

	/**
	 * Register event handler (hook)
	 *
	 * @param messageType - Message type(s) to match (protocol-level)
	 * @param matcher - Optional payload matcher (traceId string or filter function)
	 * @param timeout - Optional timeout in milliseconds
	 */
	onEvent<K extends keyof M = keyof M>(
		messageType: K | K[],
		matcher?: string | ((payload: ExtractMessagePayload<M, K>) => boolean),
		timeout?: number,
	): AsyncClientHookBuilder<ExtractMessagePayload<M, K>, M> {
		// Convert message types to string or string[]
		const messageTypes = Array.isArray(messageType)
			? (messageType as string[])
			: (messageType as string);

		// Build payload matcher if provided
		const payloadMatcher = this.buildPayloadMatcher(matcher);

		const hook: Hook = {
			id: generateHookId(),
			componentName: this.client.name,
			phase: "test",
			messageTypes,
			matcher: payloadMatcher,
			handlers: [],
			persistent: false,
			timeout,
		};

		// Register hook first, then pass to builder
		this.client.registerHook(hook);

		return new AsyncClientHookBuilder<ExtractMessagePayload<M, K>, M>(hook);
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
