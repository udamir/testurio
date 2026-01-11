/**
 * Message Queue Adapter Interfaces
 *
 * Defines interfaces for broker-specific adapters.
 * Adapters are implemented in separate packages (e.g., @testurio/adapter-kafka).
 */

import type { Codec } from "../../codecs";
import type { PublishOptions, QueueMessage } from "./mq.types";

/**
 * Main adapter interface for message queue brokers.
 *
 * Components use this interface to create publisher/subscriber adapters.
 * Broker-specific configuration (including serialization) belongs in adapter constructors.
 *
 * @example
 * ```typescript
 * // Kafka adapter (in @testurio/adapter-kafka)
 * class KafkaAdapter implements IMQAdapter {
 *   constructor(config: { brokers: string[]; groupId?: string }) { ... }
 *   readonly type = "kafka";
 *   // ...
 * }
 * ```
 */
export interface IMQAdapter {
	/**
	 * Adapter type identifier (e.g., "kafka", "rabbitmq", "redis")
	 */
	readonly type: string;

	/**
	 * Create a publisher adapter for sending messages.
	 *
	 * @param codec - Codec for payload serialization
	 * @returns Publisher adapter instance
	 */
	createPublisher(codec: Codec): Promise<IMQPublisherAdapter>;

	/**
	 * Create a subscriber adapter for receiving messages.
	 * Topics are subscribed dynamically via subscribe() method.
	 *
	 * @param codec - Codec for payload deserialization
	 * @returns Subscriber adapter instance
	 */
	createSubscriber(codec: Codec): Promise<IMQSubscriberAdapter>;

	/**
	 * Dispose of adapter resources (connections, etc.)
	 */
	dispose(): Promise<void>;
}

/**
 * Publisher adapter interface for sending messages to brokers.
 *
 * @example
 * ```typescript
 * const publisherAdapter = await adapter.createPublisher();
 * await publisherAdapter.publish("orders", { orderId: "123" });
 * await publisherAdapter.close();
 * ```
 */
export interface IMQPublisherAdapter {
	/**
	 * Whether the publisher is connected to the broker
	 */
	readonly isConnected: boolean;

	/**
	 * Publish a single message to a topic.
	 *
	 * @param topic - Topic/queue name
	 * @param payload - Message payload (will be serialized by adapter)
	 * @param options - Optional publish options (key, headers)
	 */
	publish<T = unknown>(topic: string, payload: T, options?: PublishOptions): Promise<void>;

	/**
	 * Publish multiple messages to a topic in a batch.
	 *
	 * @param topic - Topic/queue name
	 * @param messages - Array of messages to publish
	 */
	publishBatch<T = unknown>(
		topic: string,
		messages: Array<{ payload: T; key?: string; headers?: Record<string, string> }>
	): Promise<void>;

	/**
	 * Close the publisher and release resources
	 */
	close(): Promise<void>;
}

/**
 * Subscriber adapter interface for receiving messages from brokers.
 * Supports dynamic topic subscription via subscribe()/unsubscribe().
 *
 * @example
 * ```typescript
 * const subscriberAdapter = await adapter.createSubscriber(codec);
 * subscriberAdapter.onMessage((message) => {
 *   console.log("Received:", message.payload);
 * });
 * await subscriberAdapter.subscribe("orders");
 * await subscriberAdapter.subscribe("events");
 * ```
 */
export interface IMQSubscriberAdapter {
	/**
	 * Unique identifier for this subscriber instance
	 */
	readonly id: string;

	/**
	 * Whether the subscriber is connected to the broker
	 */
	readonly isConnected: boolean;

	/**
	 * Subscribe to a topic dynamically.
	 * Can be called multiple times for different topics.
	 *
	 * @param topic - Topic name or pattern (broker-specific)
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
	 * Register a handler for incoming messages.
	 * Messages from ALL subscribed topics are routed through this handler.
	 *
	 * @param handler - Function called for each received message
	 */
	onMessage(handler: (message: QueueMessage) => void): void;

	/**
	 * Register a handler for errors.
	 *
	 * @param handler - Function called when an error occurs
	 */
	onError(handler: (error: Error) => void): void;

	/**
	 * Register a handler for disconnection events.
	 *
	 * @param handler - Function called when disconnected from broker
	 */
	onDisconnect(handler: () => void): void;

	/**
	 * Close the subscriber and release resources
	 */
	close(): Promise<void>;
}
