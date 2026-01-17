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
 */
export interface IMQAdapter<TMessage = unknown, TOptions = unknown, TBatchMessage = unknown> {
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
	 * @param codec - Codec for message deserialization
	 */
	createSubscriber(codec: Codec): Promise<IMQSubscriberAdapter<TMessage>>;

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
 */
export interface IMQSubscriberAdapter<TMessage = unknown> {
	/**
	 * Unique identifier for this subscriber instance.
	 */
	readonly id: string;

	/**
	 * Whether the subscriber is connected to the broker.
	 */
	readonly isConnected: boolean;

	/**
	 * Subscribe to a topic.
	 *
	 * @param topic - Topic name or pattern
	 */
	subscribe(topic: string): Promise<void>;

	/**
	 * Unsubscribe from a topic.
	 *
	 * @param topic - Topic name or pattern
	 */
	unsubscribe(topic: string): Promise<void>;

	/**
	 * Get currently subscribed topics.
	 */
	getSubscribedTopics(): string[];

	/**
	 * Register handler for incoming messages.
	 * Topic is passed separately from message to allow hook matching.
	 * Adapter extracts topic from its native format.
	 *
	 * @param handler - Function receiving (topic, message)
	 */
	onMessage(handler: (topic: string, message: TMessage) => void): void;

	/**
	 * Register handler for errors.
	 */
	onError(handler: (error: Error) => void): void;

	/**
	 * Register handler for disconnection.
	 */
	onDisconnect(handler: () => void): void;

	/**
	 * Close the subscriber and release resources.
	 */
	close(): Promise<void>;

	/**
	 * Start consuming messages after all topics have been subscribed.
	 * For adapters like Kafka that benefit from batching subscriptions
	 * before triggering consumer group coordination.
	 *
	 * If not implemented, subscribe() should start consuming automatically.
	 */
	startConsuming?(): Promise<void>;
}
