/**
 * Message Queue Adapter Interfaces
 *
 * Adapters implement these interfaces to provide broker-specific functionality.
 * Topic is delivered separately from message to allow hook matching at component level.
 */

import type { Codec } from "../../codecs";

/**
 * Main MQ adapter factory.
 * Creates publisher and subscriber adapters.
 *
 * @template TMessage - Adapter-specific message type (e.g., KafkaMessage, RabbitMessage)
 * @template TOptions - Adapter-specific publish options
 * @template TBatchMessage - Adapter-specific batch message type
 * @template P - Adapter-specific subscribe-time params (e.g., KafkaSubscribeParams).
 *               Slot 4 (v5.6) — appended after TBatchMessage so that existing
 *               Publisher declarations of the form `IMQAdapter<unknown, TOptions, TBatchMessage>`
 *               remain valid (P defaults to `unknown`).
 */
export interface IMQAdapter<TMessage = unknown, TOptions = unknown, TBatchMessage = unknown, P = unknown> {
	/**
	 * Adapter type identifier (e.g., "kafka", "rabbitmq", "nats")
	 */
	readonly type: string;

	/**
	 * Create a publisher adapter.
	 *
	 * @param codec - Codec for message serialization
	 */
	createPublisher(codec: Codec): Promise<IMQPublisherAdapter<TOptions, TBatchMessage>>;

	/**
	 * Create a subscriber adapter.
	 *
	 * v5.8: signature unchanged from master — `codec` is the only argument.
	 * Adapter-wide subscribe-time defaults live on the concrete adapter's own
	 * config (e.g. `KafkaAdapterConfig.defaultSubscribeParams`) and are read by
	 * the adapter at materialization time. The component never constructs `P`.
	 * Per-call subscribe-level overrides flow through
	 * `IMQSubscriberAdapter.subscribe(topics, params?)`.
	 *
	 * @param codec - Codec for message deserialization (optional; adapter may default)
	 */
	createSubscriber(codec?: Codec): Promise<IMQSubscriberAdapter<TMessage, P>>;

	/**
	 * Dispose of adapter resources.
	 */
	dispose(): Promise<void>;
}

/**
 * Publisher adapter.
 * Topic is always string, adapter translates to native field.
 * Options and batch messages are adapter-specific.
 *
 * @template TOptions - Adapter-specific publish options
 * @template TBatchMessage - Adapter-specific batch message type
 */
export interface IMQPublisherAdapter<TOptions = unknown, TBatchMessage = unknown> {
	/**
	 * Whether the publisher is connected to the broker.
	 */
	readonly isConnected: boolean;

	/**
	 * Publish a single message.
	 * Adapter wraps payload in its native format.
	 *
	 * @param topic - Topic name (adapter translates to native field)
	 * @param payload - Message payload
	 * @param options - Adapter-specific options (key, headers, etc.)
	 */
	publish(topic: string, payload: unknown, options?: TOptions): Promise<void>;

	/**
	 * Publish multiple messages in a batch.
	 * Messages are fully adapter-specific.
	 *
	 * @param topic - Topic name
	 * @param messages - Adapter-specific batch messages
	 */
	publishBatch(topic: string, messages: TBatchMessage[]): Promise<void>;

	/**
	 * Close the publisher and release resources.
	 */
	close(): Promise<void>;
}

/**
 * Subscriber adapter.
 * Topic delivered separately from adapter-specific message.
 *
 * @template TMessage - Adapter-specific message type
 * @template P - Adapter-specific subscribe-time params (e.g. KafkaSubscribeParams).
 *               Defaults to `unknown` so legacy adapters (Rabbit, Redis pubsub)
 *               can declare `IMQSubscriberAdapter<TMessage>` without change.
 */
export interface IMQSubscriberAdapter<TMessage = unknown, P = unknown> {
	/**
	 * Unique identifier for this subscriber instance.
	 */
	readonly id: string;

	/**
	 * Whether the subscriber is connected to the broker.
	 */
	readonly isConnected: boolean;

	/**
	 * Subscribe to a topic OR a batch of topics, AND start delivery if not
	 * already started. This single method covers what was previously
	 * `subscribe` + `startConsuming` (v5.0 — startConsuming removed from
	 * the interface; folded into the first `subscribe` call's path).
	 *
	 * **Contract:**
	 * - Accepts a single topic string or an array. Adapters MAY batch broker
	 *   calls (Kafka: one `consumer.subscribe({ topics })` + one `consumer.run()`
	 *   for the whole batch when delivery hasn't started yet).
	 * - Idempotent per topic — already-subscribed topics in the input array
	 *   are no-ops. Params from the first EXPLICIT subscribe of a topic are
	 *   honored; later calls' params on the same topic produce a warning when
	 *   they differ (Kafka adapter — see v5.7 design).
	 * - The first call activates the adapter's delivery loop. Subsequent calls
	 *   do not need to re-activate.
	 * - MUST NOT return until newly-published messages on the subscribed
	 *   topics will be delivered (Kafka: await `GROUP_JOIN` event).
	 *
	 * **`params` semantics (v5.7 + v5.8)**: `Partial<P>` because subscribe-level
	 * params are per-call overrides. Adapter-wide defaults are stored at
	 * construction time from the adapter's own config. Passing `undefined`
	 * means "use stored defaults, no per-topic opinion" (auto-subscribe path);
	 * passing an object means "explicit per-call, record per-topic".
	 *
	 * @param topic - Single topic or array of topics
	 * @param params - Optional per-call subscribe-level overrides
	 */
	subscribe(topic: string | string[], params?: Partial<P>): Promise<void>;

	/**
	 * Unsubscribe from a topic OR a batch.
	 *
	 * **Contract:** Idempotent; soft delete allowed (filter on receive).
	 *
	 * @param topic - Single topic or array of topics
	 */
	unsubscribe(topic: string | string[]): Promise<void>;

	/**
	 * Get currently subscribed topics.
	 */
	getSubscribedTopics(): string[];

	/**
	 * Register handler for incoming messages.
	 * Topic is passed separately from message to allow hook matching.
	 * Adapter extracts topic from its native format.
	 *
	 * **Parameter order**: `(topic, message)` — preserved from the master
	 * contract. Kafka/Rabbit/Redis subscriber adapters all call back in this
	 * order; do not flip it.
	 *
	 * @param handler - Function receiving (topic, message)
	 */
	onMessage(handler: (topic: string, message: TMessage) => void): void;

	/**
	 * Register handler for adapter-level errors.
	 *
	 * v5.5: under per-TC isolation the `Subscriber` component binds a per-TC
	 * closure here at materialization time so the captured `testCaseId`
	 * attributes the error to the originating TC.
	 */
	onError(handler: (error: Error) => void): void;

	/**
	 * Register handler for broker disconnection.
	 *
	 * v5.5: under per-TC isolation the `Subscriber` component binds a per-TC
	 * closure here at materialization time so disconnect rejects only that
	 * TC's pending hooks (other TCs run on independent adapters and are
	 * unaffected).
	 */
	onDisconnect(handler: () => void): void;

	/**
	 * Close the subscriber AND release every resource it owns (broker
	 * connection, dedicated client, queues, etc.).
	 *
	 * **v5.5 strengthened contract**: under per-TC materialization, `close()`
	 * runs once per TC, so resources cannot be "managed externally" — the
	 * adapter owns teardown end-to-end. Adapters that leave a per-instance
	 * broker connection open (legacy Redis pubsub) must be fixed.
	 */
	close(): Promise<void>;
}
