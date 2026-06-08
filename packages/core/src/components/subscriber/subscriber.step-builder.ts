/**
 * Subscriber Step Builder
 *
 * Builder for subscriber operations.
 * Pure data builder - contains NO execution logic.
 */

import { BaseStepBuilder } from "../base/step-builder";
import type { DefaultTopics, Topic, Topics } from "../mq.base";
import { SubscriberSubscribeStepBuilder } from "./subscriber.action-step-builder";
import { SubscriberHookBuilder } from "./subscriber.hook-builder";

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
 * @template P - Adapter-specific subscribe-time params (e.g. KafkaSubscribeParams)
 */
export class SubscriberStepBuilder<
	T extends Topics<T> = DefaultTopics,
	TMessage = unknown,
	P = unknown,
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
		// Subscription happens in registerHook() at runtime
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
	 * @param options - Optional matcher function
	 */
	waitMessage<K extends Topic<T>>(
		topic: K,
		options?: {
			matcher?: (message: TMessage) => boolean;
		}
	): SubscriberHookBuilder<TMessage> {
		// Subscription happens in registerHook() at runtime
		return this.registerStep(
			{
				type: "waitMessage",
				description: `Wait for message from ${topic}`,
				params: {
					topic,
					topics: [topic],
					matcher: options?.matcher,
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
	 * @param options - Optional matcher function
	 */
	waitMessageFrom<K extends Topic<T>>(
		topics: K[],
		options?: {
			matcher?: (message: TMessage) => boolean;
		}
	): SubscriberHookBuilder<TMessage> {
		// Subscription happens in registerHook() at runtime
		return this.registerStep(
			{
				type: "waitMessage",
				description: `Wait for message from [${topics.join(", ")}]`,
				params: {
					topics,
					matcher: options?.matcher,
				},
				handlers: [],
				mode: "wait",
			},
			SubscriberHookBuilder<TMessage>
		);
	}

	/**
	 * Imperatively subscribe to one or more topics for this test case.
	 *
	 * - `subscribe('topic')` — single topic.
	 * - `subscribe(['a', 'b'])` — batched: one broker call (Kafka batches into a single subscribe + run cycle).
	 * - `subscribe()` / `subscribe([])` — empty-array shortcut: subscribes to every topic this test case has
	 *   referenced via `onMessage` / `waitMessage` / `waitMessageFrom`. Useful in `autoSubscribe: false` mode
	 *   as a "bulk-activate now" trigger.
	 *
	 * **Footgun**: when callers spread a computed array that may be empty
	 * (`ev.subscribe(computedTopics)` where `computedTopics: string[]`), the
	 * empty case silently triggers the "subscribe-all" shortcut instead of
	 * "subscribe-nothing". Callers with potentially-empty dynamic arrays
	 * should guard at the call site: `if (computedTopics.length > 0) ev.subscribe(computedTopics);`.
	 *
	 * @param topic - Single topic, array of topics, or undefined (shortcut)
	 * @param params - Optional per-call subscribe-level overrides (adapter-specific)
	 */
	subscribe<K extends Topic<T>>(topic?: K | K[], params?: Partial<P>): SubscriberSubscribeStepBuilder {
		const topics = topic === undefined ? [] : Array.isArray(topic) ? topic : [topic];
		return this.registerStep(
			{
				type: "subscribe",
				description:
					topics.length === 0
						? "Subscribe to all hook-derived topics for this test case"
						: `Subscribe to [${topics.join(", ")}]`,
				params: { topics, subscribeParams: params },
				handlers: [],
				mode: "action",
			},
			SubscriberSubscribeStepBuilder
		);
	}

	/**
	 * Imperatively unsubscribe from one or more topics for this test case.
	 *
	 * - `unsubscribe('topic')` — single topic.
	 * - `unsubscribe(['a', 'b'])` — batched.
	 * - `unsubscribe()` / `unsubscribe([])` — empty-array shortcut: unsubscribes from every topic
	 *   this test case currently holds.
	 *
	 * **Footgun**: see `subscribe` — the same empty-array shortcut applies here.
	 *
	 * @param topic - Single topic, array of topics, or undefined (shortcut)
	 */
	unsubscribe<K extends Topic<T>>(topic?: K | K[]): SubscriberSubscribeStepBuilder {
		const topics = topic === undefined ? [] : Array.isArray(topic) ? topic : [topic];
		return this.registerStep(
			{
				type: "unsubscribe",
				description:
					topics.length === 0
						? "Unsubscribe from all currently-held topics for this test case"
						: `Unsubscribe from [${topics.join(", ")}]`,
				params: { topics },
				handlers: [],
				mode: "action",
			},
			SubscriberSubscribeStepBuilder
		);
	}
}
