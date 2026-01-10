/**
 * Subscriber Component
 *
 * Subscribes to message queues/topics.
 * Supports hooks for assertions, transformations, and message dropping.
 *
 * @example Loose mode
 * ```typescript
 * const subscriber = new Subscriber("sub", {
 *   adapter,
 *   topics: ["orders"],
 * });
 * const msg = await subscriber.waitForMessage("orders");
 * ```
 *
 * @example Strict mode with hooks
 * ```typescript
 * interface MyTopics {
 *   orders: { orderId: string; status: string };
 * }
 * const subscriber = new Subscriber<MyTopics>("sub", {
 *   adapter,
 *   topics: ["orders"],
 * });
 * subscriber.onMessage("orders")
 *   .assert((msg) => msg.payload.status !== "invalid");
 * ```
 */

import type { Codec } from "../../codecs";
import { defaultJsonCodec } from "../../codecs";
import type { ITestCaseBuilder } from "../../execution";
import { BaseMQComponent } from "../mq.base/mq.base.component";
import type { DefaultTopics, IMQAdapter, IMQSubscriberAdapter, Payload, QueueMessage, Topic, Topics } from "../mq.base";
import { SubscriberHookBuilder } from "./subscriber.hook-builder";
import type { SubscriberHook } from "./subscriber.hook-types";
import { DropMQMessageError } from "./subscriber.hook-types";
import { SubscriberStepBuilder } from "./subscriber.step-builder";

/**
 * Subscriber component options
 */
export interface SubscriberOptions {
	/**
	 * Message queue adapter
	 */
	adapter: IMQAdapter;

	/**
	 * Topics to subscribe to
	 */
	topics: string[];

	/**
	 * Codec for payload deserialization (defaults to JSON)
	 */
	codec?: Codec;
}

/**
 * Pending message waiter
 */
interface MessageWaiter<T = unknown> {
	topics: string[];
	matcher?: (message: QueueMessage<T>) => boolean;
	resolve: (message: QueueMessage<T>) => void;
	reject: (error: Error) => void;
	timeoutId?: ReturnType<typeof setTimeout>;
}

/**
 * Subscriber component for receiving messages from message queues.
 *
 * @template T - Topic definitions for type-safe message handling (defaults to loose mode)
 */
export class Subscriber<T extends Topics = DefaultTopics> extends BaseMQComponent<SubscriberStepBuilder<T>> {
	private readonly adapter: IMQAdapter;
	private readonly topics: string[];
	private readonly codec: Codec;
	private subscriberAdapter: IMQSubscriberAdapter | null = null;
	private hooks: SubscriberHook[] = [];
	private waiters: MessageWaiter[] = [];
	private receivedMessages: QueueMessage[] = [];

	constructor(name: string, options: SubscriberOptions) {
		super(name);
		this.adapter = options.adapter;
		this.topics = options.topics;
		this.codec = options.codec ?? defaultJsonCodec;
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	protected async doStart(): Promise<void> {
		this.subscriberAdapter = await this.adapter.createSubscriber(this.topics, this.codec);

		this.subscriberAdapter.onMessage((message) => {
			this.handleMessage(message);
		});

		this.subscriberAdapter.onError((error) => {
			this.trackUnhandledError(error);
		});
	}

	protected async doStop(): Promise<void> {
		// Reject all pending waiters
		for (const waiter of this.waiters) {
			if (waiter.timeoutId) {
				clearTimeout(waiter.timeoutId);
			}
			waiter.reject(new Error(`Subscriber ${this.name} stopped while waiting for message`));
		}
		this.waiters = [];

		if (this.subscriberAdapter) {
			await this.subscriberAdapter.close();
			this.subscriberAdapter = null;
		}
	}

	// =========================================================================
	// Message Handling
	// =========================================================================

	private async handleMessage(message: QueueMessage): Promise<void> {
		try {
			// Execute matching hooks
			const processedMessage = await this.executeMatchingHook(message);
			if (!processedMessage) {
				// Message was dropped
				return;
			}

			// Store received message
			this.receivedMessages.push(processedMessage);

			// Resolve matching waiters
			this.resolveWaiters(processedMessage);
		} catch (error) {
			if (error instanceof DropMQMessageError) {
				// Message was dropped - this is expected
				return;
			}
			// Track unexpected errors
			if (error instanceof Error) {
				this.trackUnhandledError(error);
			}
		}
	}

	private async executeMatchingHook(message: QueueMessage): Promise<QueueMessage | null> {
		const hook = this.findMatchingHook(message);
		if (!hook) {
			return message;
		}

		let current = message;
		for (const handler of hook.handlers) {
			const result = await handler.execute(current);
			if (result === null) {
				return null;
			}
			current = result;
		}
		return current;
	}

	private findMatchingHook(message: QueueMessage): SubscriberHook | null {
		for (const hook of this.hooks) {
			if (hook.topic !== message.topic) {
				continue;
			}
			if (hook.payloadMatcher && !hook.payloadMatcher(message.payload)) {
				continue;
			}
			return hook;
		}
		return null;
	}

	private resolveWaiters(message: QueueMessage): void {
		const resolvedIndices: number[] = [];

		for (let i = 0; i < this.waiters.length; i++) {
			const waiter = this.waiters[i];

			// Check topic match
			if (!waiter.topics.includes(message.topic)) {
				continue;
			}

			// Check custom matcher
			if (waiter.matcher && !waiter.matcher(message)) {
				continue;
			}

			// Resolve the waiter
			if (waiter.timeoutId) {
				clearTimeout(waiter.timeoutId);
			}
			waiter.resolve(message);
			resolvedIndices.push(i);
		}

		// Remove resolved waiters (reverse order to maintain indices)
		for (let i = resolvedIndices.length - 1; i >= 0; i--) {
			this.waiters.splice(resolvedIndices[i], 1);
		}
	}

	// =========================================================================
	// Public API
	// =========================================================================

	/**
	 * Wait for a message on the specified topic(s).
	 *
	 * @param topic - Topic name or array of topic names
	 * @param matcher - Optional function to match specific messages
	 * @param timeout - Optional timeout in milliseconds (default: 5000)
	 * @returns Promise that resolves with the received message
	 *
	 * @example
	 * ```typescript
	 * const msg = await subscriber.waitForMessage("orders");
	 * const msg = await subscriber.waitForMessage("orders", (m) => m.payload.orderId === "123");
	 * const msg = await subscriber.waitForMessage(["orders", "events"], undefined, 10000);
	 * ```
	 */
	waitForMessage<K extends Topic<T>>(
		topic: K | K[],
		matcher?: (message: QueueMessage<Payload<T, K>>) => boolean,
		timeout = 5000
	): Promise<QueueMessage<Payload<T, K>>> {
		if (!this.subscriberAdapter) {
			return Promise.reject(new Error(`Subscriber ${this.name} is not started`));
		}

		const topics = Array.isArray(topic) ? topic.map(String) : [String(topic)];

		// Check already received messages first
		for (let i = 0; i < this.receivedMessages.length; i++) {
			const msg = this.receivedMessages[i];
			if (!topics.includes(msg.topic)) {
				continue;
			}
			if (matcher && !matcher(msg as QueueMessage<Payload<T, K>>)) {
				continue;
			}
			// Found a matching message, remove it and return
			this.receivedMessages.splice(i, 1);
			return Promise.resolve(msg as QueueMessage<Payload<T, K>>);
		}

		// No matching message found, create a waiter
		return new Promise((resolve, reject) => {
			const waiter: MessageWaiter<Payload<T, K>> = {
				topics,
				matcher: matcher as ((message: QueueMessage) => boolean) | undefined,
				resolve: resolve as (message: QueueMessage) => void,
				reject,
			};

			// Set timeout
			waiter.timeoutId = setTimeout(() => {
				const index = this.waiters.indexOf(waiter as MessageWaiter);
				if (index !== -1) {
					this.waiters.splice(index, 1);
				}
				reject(new Error(`Timeout waiting for message on topic(s): ${topics.join(", ")}`));
			}, timeout);

			this.waiters.push(waiter as MessageWaiter);
		});
	}

	/**
	 * Register a hook for messages on the specified topic.
	 * Returns a hook builder for adding assert, transform, and drop handlers.
	 *
	 * @param topic - Topic name
	 * @param payloadMatcher - Optional function to match specific messages by payload
	 * @returns Hook builder for chaining
	 *
	 * @example
	 * ```typescript
	 * subscriber.onMessage("orders")
	 *   .assert((msg) => msg.payload.orderId !== undefined)
	 *   .transform((msg) => ({ ...msg, payload: { ...msg.payload, processed: true } }));
	 *
	 * subscriber.onMessage("orders", (payload) => payload.status === "cancelled")
	 *   .drop();
	 * ```
	 */
	onMessage<K extends Topic<T>>(
		topic: K,
		payloadMatcher?: (payload: Payload<T, K>) => boolean
	): SubscriberHookBuilder<Payload<T, K>> {
		const hook: SubscriberHook<Payload<T, K>> = {
			id: `${this.name}-${String(topic)}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
			topic: String(topic),
			payloadMatcher: payloadMatcher as ((payload: unknown) => boolean) | undefined,
			handlers: [],
			persistent: false,
		};

		this.hooks.push(hook as SubscriberHook);
		return new SubscriberHookBuilder<Payload<T, K>>(hook);
	}

	/**
	 * Get all received messages (for debugging/testing)
	 */
	getReceivedMessages(): QueueMessage[] {
		return [...this.receivedMessages];
	}

	/**
	 * Clear received messages buffer
	 */
	clearReceivedMessages(): void {
		this.receivedMessages = [];
	}

	// =========================================================================
	// Hook Management
	// =========================================================================

	/**
	 * Clear non-persistent hooks (called between test cases)
	 */
	clearTestCaseHooks(): void {
		this.hooks = this.hooks.filter((hook) => hook.persistent);
	}

	/**
	 * Clear all hooks
	 */
	clearHooks(): void {
		this.hooks = [];
	}

	// =========================================================================
	// Step Builder
	// =========================================================================

	createStepBuilder(builder: ITestCaseBuilder): SubscriberStepBuilder<T> {
		return new SubscriberStepBuilder<T>(this, builder);
	}
}
