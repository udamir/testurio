/**
 * Subscriber Step Builder
 *
 * Builder for subscriber operations.
 * Pure data builder - contains NO execution logic.
 */

import { BaseStepBuilder } from "../base/step-builder";
import type { Topics, Topic, DefaultTopics } from "../mq.base";
import { SubscriberHookBuilder } from "./subscriber.hook-builder";
import type { Subscriber } from "./subscriber.component";

/**
 * Subscriber Step Builder
 *
 * Provides declarative API for subscribing to messages.
 * All methods register steps - no execution logic here.
 *
 * Uses self-referential constraint `T extends Topics<T>` which:
 * - Does NOT require T to have an index signature
 * - Allows strict typing with specific topic keys
 *
 * @template T - Topics type for topic validation
 * @template TMessage - Adapter-specific message type
 */
export class SubscriberStepBuilder<
	T extends Topics<T> = DefaultTopics,
	TMessage = unknown,
> extends BaseStepBuilder {
	/**
	 * Handle incoming message (non-strict hook).
	 *
	 * Works regardless of timing - message can arrive before or after step starts.
	 *
	 * @param topic - Topic name to match
	 * @param options - Optional matcher function to filter messages
	 */
	onMessage<K extends Topic<T>>(
		topic: K,
		options?: { matcher?: (message: TMessage) => boolean }
	): SubscriberHookBuilder<TMessage> {
		// Ensure subscription
		const subscriber = this.component as Subscriber<T, TMessage>;
		subscriber.ensureSubscribed(topic);

		return this.registerStep(
			{
				type: "onMessage",
				description: `Handle message from ${topic}`,
				params: {
					topic,
					topics: [topic],
					matcher: options?.matcher,
				},
				handlers: [],
				mode: "hook",
			},
			SubscriberHookBuilder<TMessage>
		);
	}

	/**
	 * Wait for incoming message (strict wait).
	 *
	 * Error if message arrives before this step starts executing.
	 *
	 * @param topic - Topic name to match
	 * @param options - Optional matcher function and timeout
	 */
	waitMessage<K extends Topic<T>>(
		topic: K,
		options?: {
			matcher?: (message: TMessage) => boolean;
			timeout?: number;
		}
	): SubscriberHookBuilder<TMessage> {
		// Ensure subscription
		const subscriber = this.component as Subscriber<T, TMessage>;
		subscriber.ensureSubscribed(topic);

		return this.registerStep(
			{
				type: "waitMessage",
				description: `Wait for message from ${topic}`,
				params: {
					topic,
					topics: [topic],
					matcher: options?.matcher,
					timeout: options?.timeout,
				},
				handlers: [],
				mode: "wait",
			},
			SubscriberHookBuilder<TMessage>
		);
	}

	/**
	 * Wait for message from multiple topics (strict wait).
	 *
	 * @param topics - Array of topic names
	 * @param options - Optional matcher function and timeout
	 */
	waitMessageFrom<K extends Topic<T>>(
		topics: K[],
		options?: {
			matcher?: (message: TMessage) => boolean;
			timeout?: number;
		}
	): SubscriberHookBuilder<TMessage> {
		// Ensure subscription to all topics
		const subscriber = this.component as Subscriber<T, TMessage>;
		for (const topic of topics) {
			subscriber.ensureSubscribed(topic);
		}

		return this.registerStep(
			{
				type: "waitMessage",
				description: `Wait for message from [${topics.join(", ")}]`,
				params: {
					topics,
					matcher: options?.matcher,
					timeout: options?.timeout,
				},
				handlers: [],
				mode: "wait",
			},
			SubscriberHookBuilder<TMessage>
		);
	}
}
