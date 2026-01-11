/**
 * Subscriber Component
 *
 * Subscribes to message queues/topics dynamically via hooks.
 * Extends BaseComponent for hook management.
 * Topics are subscribed dynamically via onMessage()/waitForMessage(), not constructor.
 *
 * @example Loose mode
 * ```typescript
 * const subscriber = new Subscriber("sub", { adapter });
 * subscriber.onMessage("orders")
 *   .assert((msg) => msg.payload.orderId !== undefined);
 * ```
 *
 * @example Strict mode with hooks
 * ```typescript
 * interface MyTopics {
 *   orders: { orderId: string; status: string };
 * }
 * const subscriber = new Subscriber<MyTopics>("sub", { adapter });
 * subscriber.onMessage("orders")
 *   .assert((msg) => msg.payload.status !== "invalid");
 * ```
 */

import type { Codec } from "../../codecs";
import { defaultJsonCodec } from "../../codecs";
import type { ITestCaseBuilder } from "../../execution";
import { BaseComponent, type Hook } from "../base";
import type { DefaultTopics, IMQAdapter, IMQSubscriberAdapter, Payload, QueueMessage, Topic, Topics } from "../mq.base";
import { DropMessageError } from "../base";
import { SubscriberHookBuilder } from "./subscriber.hook-builder";
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
 * Extends BaseComponent for unified hook management.
 *
 * @template T - Topic definitions for type-safe message handling (defaults to loose mode)
 */
export class Subscriber<T extends Topics = DefaultTopics> extends BaseComponent<SubscriberStepBuilder<T>> {
	private readonly adapter: IMQAdapter;
	private readonly codec: Codec;
	private subscriberAdapter: IMQSubscriberAdapter | null = null;
	private subscribedTopics: Set<string> = new Set();
	private waiters: MessageWaiter[] = [];
	private receivedMessages: QueueMessage[] = [];

	constructor(name: string, options: SubscriberOptions) {
		super(name);
		this.adapter = options.adapter;
		this.codec = options.codec ?? defaultJsonCodec;
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	protected async doStart(): Promise<void> {
		this.subscriberAdapter = await this.adapter.createSubscriber(this.codec);

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

		this.subscribedTopics.clear();
	}

	// =========================================================================
	// Dynamic Topic Subscription
	// =========================================================================

	/**
	 * Ensure a topic is subscribed.
	 * Called automatically when hooks are registered.
	 *
	 * @param topic - Topic to subscribe to
	 */
	async ensureSubscribed(topic: string): Promise<void> {
		if (this.subscribedTopics.has(topic)) {
			return;
		}

		if (!this.subscriberAdapter) {
			// Not started yet, topic will be subscribed when first hook triggers
			return;
		}

		await this.subscriberAdapter.subscribe(topic);
		this.subscribedTopics.add(topic);
	}

	// =========================================================================
	// Message Handling
	// =========================================================================

	private async handleMessage(message: QueueMessage): Promise<void> {
		try {
			// Execute matching hooks using BaseComponent's method
			const processedMessage = await this.executeMatchingHook(message);
			if (!processedMessage) {
				// Message was dropped
				return;
			}

			// Store received message
			this.receivedMessages.push(processedMessage as QueueMessage);

			// Resolve matching waiters
			this.resolveWaiters(processedMessage as QueueMessage);
		} catch (error) {
			if (error instanceof DropMessageError) {
				// Message was dropped - this is expected
				return;
			}
			// Hook execution errors are already tracked in executeHook()
			// Don't re-track here to avoid duplicates
		}
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
	async waitForMessage<K extends Topic<T>>(
		topic: K | K[],
		matcher?: (message: QueueMessage<Payload<T, K>>) => boolean,
		timeout = 5000
	): Promise<QueueMessage<Payload<T, K>>> {
		// Check state before starting
		if (this.state !== "started") {
			throw new Error(`Subscriber ${this.name} is not started`);
		}

		const topics = Array.isArray(topic) ? topic.map(String) : [String(topic)];

		// Ensure topics are subscribed
		for (const t of topics) {
			await this.ensureSubscribed(t);
		}

		// Check state again after async operation (stop() may have been called)
		if (this.state !== "started" || !this.subscriberAdapter) {
			throw new Error(`Subscriber ${this.name} was stopped during subscription`);
		}

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
			return msg as QueueMessage<Payload<T, K>>;
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
	 * Topic is subscribed automatically when registered.
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
		const topicStr = String(topic);

		// Create hook with isMatch function
		const hook: Hook<QueueMessage<Payload<T, K>>> = {
			id: `${this.name}-${topicStr}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
			componentName: this.name,
			phase: "test",
			isMatch: (msg: QueueMessage<Payload<T, K>>) => {
				if (msg.topic !== topicStr) {
					return false;
				}
				if (payloadMatcher && !payloadMatcher(msg.payload)) {
					return false;
				}
				return true;
			},
			handlers: [],
			persistent: false,
		};

		// Register hook using BaseComponent method
		this.registerHook(hook);

		// Subscribe to topic (fire and forget - will be awaited on start or when needed)
		void this.ensureSubscribed(topicStr);

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
	// Step Builder
	// =========================================================================

	createStepBuilder(builder: ITestCaseBuilder): SubscriberStepBuilder<T> {
		return new SubscriberStepBuilder<T>(this, builder);
	}
}
