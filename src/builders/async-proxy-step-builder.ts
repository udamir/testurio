/**
 * Async Proxy Step Builder
 *
 * Builder for async proxy operations (register inbound/outbound handlers).
 */

import type { ProxyComponent } from "../components";
import { AsyncHookBuilderImpl } from "../hooks";
import { generateHookId } from "../hooks";
import type { Hook } from "../types";
import type { TestCaseBuilder } from "./test-case-builder";

/**
 * Async Proxy Step Builder
 *
 * For async protocols: TCP, WebSocket, gRPC streaming
 */
export class AsyncProxyStepBuilder<
	M extends Record<string, unknown> = Record<string, unknown>,
	TContext extends Record<string, unknown> = Record<string, unknown>,
> {
	constructor(
		private proxy: ProxyComponent,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		private testBuilder: TestCaseBuilder<TContext>,
	) {}

	/**
	 * Component name
	 */
	get name(): string {
		return this.proxy.name;
	}

	/**
	 * Listen address
	 */
	get listenAddress() {
		return this.proxy.listenAddress;
	}

	/**
	 * Target address
	 */
	get targetAddress() {
		return this.proxy.targetAddress;
	}

	/**
	 * Register message handler for messages from client (downstream: client → proxy → target)
	 * Proxy acts as server receiving messages from client
	 *
	 * @param messageType - Message type(s) to match (adapter-level)
	 * @param matcher - Optional payload matcher (traceId string or filter function)
	 */
	onMessage<K extends keyof M = keyof M>(
		messageType: K | K[],
		matcher?: string | ((payload: M[K]) => boolean),
	): AsyncHookBuilderImpl<M[K]> {
		const messageTypes = Array.isArray(messageType)
			? (messageType as string[])
			: (messageType as string);

		const payloadMatcher = this.buildPayloadMatcher(matcher);

		const hook: Hook = {
			id: generateHookId(),
			componentName: this.proxy.name,
			phase: "test",
			messageTypes,
			matcher: payloadMatcher,
			handlers: [],
			persistent: false,
			metadata: {
				direction: "downstream",
			},
		};

		// Register hook first, then pass to builder
		const hookRegistry = this.proxy.getHookRegistry();
		hookRegistry.registerHook(hook);

		return new AsyncHookBuilderImpl<M[K]>(hook);
	}

	/**
	 * Register event handler for events from target server (upstream: target → proxy → client)
	 * Proxy acts as client receiving events from server
	 *
	 * @param messageType - Message type(s) to match (adapter-level)
	 * @param matcher - Optional payload matcher (traceId string or filter function)
	 */
	onEvent<K extends keyof M = keyof M>(
		messageType: K | K[],
		matcher?: string | ((payload: M[K]) => boolean),
	): AsyncHookBuilderImpl<M[K]> {
		const messageTypes = Array.isArray(messageType)
			? (messageType as string[])
			: (messageType as string);

		const payloadMatcher = this.buildPayloadMatcher(matcher);

		const hook: Hook = {
			id: generateHookId(),
			componentName: this.proxy.name,
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
		const hookRegistry = this.proxy.getHookRegistry();
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
