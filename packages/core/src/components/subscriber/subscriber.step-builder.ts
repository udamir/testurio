/**
 * Subscriber Step Builder
 *
 * Provides test DSL integration for Subscriber component.
 * Registers steps for waitForMessage and hook operations.
 */

import type { ITestCaseBuilder } from "../../execution";
import type { DefaultTopics, Payload, QueueMessage, Topic, Topics } from "../mq.base";
import type { Subscriber } from "./subscriber.component";
import type { SubscriberHookBuilder } from "./subscriber.hook-builder";

/**
 * Step builder for Subscriber component.
 *
 * @template T - Topic definitions type
 */
export class SubscriberStepBuilder<T extends Topics = DefaultTopics> {
	private readonly subscriber: Subscriber<T>;
	private readonly builder: ITestCaseBuilder;

	constructor(subscriber: Subscriber<T>, builder: ITestCaseBuilder) {
		this.subscriber = subscriber;
		this.builder = builder;
	}

	/**
	 * Register a step to wait for a message.
	 * The message is stored in the test context under the specified key.
	 *
	 * @param topic - Topic name or array of topic names
	 * @param storeAs - Key to store the received message in test context
	 * @param options - Optional matcher and timeout
	 * @returns this for chaining
	 *
	 * @example
	 * ```typescript
	 * sub.waitForMessage("orders", "receivedOrder");
	 * sub.waitForMessage("orders", "receivedOrder", {
	 *   matcher: (msg) => msg.payload.orderId === "123",
	 *   timeout: 10000,
	 * });
	 * ```
	 */
	waitForMessage<K extends Topic<T>>(
		topic: K | K[],
		storeAs: string,
		options?: {
			matcher?: (message: QueueMessage<Payload<T, K>>) => boolean;
			timeout?: number;
		}
	): this {
		const subscriberName = this.subscriber.name;
		const topics = Array.isArray(topic) ? topic.map(String) : [String(topic)];

		this.builder.registerStep({
			type: "waitForMessage",
			componentName: subscriberName,
			messageType: topics.join(", "),
			description: `Wait for message on "${topics.join(", ")}"`,
			timeout: options?.timeout,
			action: async () => {
				await this.subscriber.waitForMessage(topic, options?.matcher, options?.timeout);
			},
			metadata: {
				operation: "waitForMessage",
				topics,
				storeAs,
				hasCustomMatcher: !!options?.matcher,
			},
		});

		return this;
	}

	/**
	 * Register a hook for messages on the specified topic.
	 * This is equivalent to calling subscriber.onMessage() but registered as a step.
	 *
	 * @param topic - Topic name
	 * @param payloadMatcher - Optional function to match specific messages
	 * @returns Hook builder for chaining
	 *
	 * @example
	 * ```typescript
	 * sub.onMessage("orders")
	 *   .assert((msg) => msg.payload.orderId !== undefined);
	 * ```
	 */
	onMessage<K extends Topic<T>>(
		topic: K,
		payloadMatcher?: (payload: Payload<T, K>) => boolean
	): SubscriberHookBuilder<Payload<T, K>> {
		// Register the hook directly on the subscriber
		// The hook builder is returned for chaining
		return this.subscriber.onMessage(topic, payloadMatcher);
	}
}
