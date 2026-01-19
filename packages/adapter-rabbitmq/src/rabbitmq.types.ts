/**
 * RabbitMQ Adapter Types
 *
 * Configuration and type definitions for the RabbitMQ MQ adapter.
 */

import type { Options } from "amqplib";

/**
 * RabbitMQ adapter configuration
 */
export interface RabbitMQAdapterConfig {
	/**
	 * RabbitMQ connection URL
	 * @example "amqp://localhost:5672"
	 * @example "amqp://user:password@localhost:5672/vhost"
	 */
	url: string;

	/**
	 * Exchange name for publishing
	 * @default "" (default exchange)
	 */
	exchange?: string;

	/**
	 * Exchange type
	 * @default "topic"
	 */
	exchangeType?: "direct" | "fanout" | "topic" | "headers";

	/**
	 * Whether the exchange should survive broker restarts
	 * @default true
	 */
	durable?: boolean;

	/**
	 * Socket options for connection
	 */
	socketOptions?: Options.Connect;

	/**
	 * Prefetch count for consumers
	 * @default 1
	 */
	prefetch?: number;

	/**
	 * Whether to auto-acknowledge messages
	 * @default true
	 */
	autoAck?: boolean;

	/**
	 * Queue options for consumers
	 */
	queueOptions?: Options.AssertQueue;

	/**
	 * Connection heartbeat in seconds
	 * @default 60
	 */
	heartbeat?: number;
}

/**
 * RabbitMQ message metadata
 *
 * Broker-specific metadata returned with received messages.
 * Use this interface to interpret QueueMessage.metadata.
 */
export interface RabbitMQMessageMetadata {
	/**
	 * Consumer tag
	 */
	consumerTag: string;

	/**
	 * Delivery tag for acknowledgment
	 */
	deliveryTag: number;

	/**
	 * Whether the message was redelivered
	 */
	redelivered: boolean;

	/**
	 * Exchange the message was published to
	 */
	exchange: string;

	/**
	 * Actual routing key from the message
	 */
	routingKey: string;

	/**
	 * Subscription pattern that matched this message.
	 * For topic exchanges with wildcards (# or *), this is the pattern
	 * that was used to subscribe, not the actual routing key.
	 */
	subscriptionPattern: string;

	/**
	 * Message properties
	 */
	properties?: {
		contentType?: string;
		contentEncoding?: string;
		correlationId?: string;
		replyTo?: string;
		expiration?: string;
		messageId?: string;
		timestamp?: number;
		type?: string;
		userId?: string;
		appId?: string;
		priority?: number;
	};
}

/**
 * Type guard to check if metadata is RabbitMQ metadata
 */
export function isRabbitMQMetadata(metadata: unknown): metadata is RabbitMQMessageMetadata {
	return (
		typeof metadata === "object" &&
		metadata !== null &&
		"consumerTag" in metadata &&
		"deliveryTag" in metadata &&
		"routingKey" in metadata &&
		"subscriptionPattern" in metadata &&
		typeof (metadata as RabbitMQMessageMetadata).consumerTag === "string" &&
		typeof (metadata as RabbitMQMessageMetadata).deliveryTag === "number" &&
		typeof (metadata as RabbitMQMessageMetadata).routingKey === "string" &&
		typeof (metadata as RabbitMQMessageMetadata).subscriptionPattern === "string"
	);
}

/**
 * Extract RabbitMQ routing key from message metadata
 */
export function getRoutingKey(metadata: unknown): string | undefined {
	if (isRabbitMQMetadata(metadata)) {
		return metadata.routingKey;
	}
	return undefined;
}

/**
 * Extract RabbitMQ delivery tag from message metadata
 */
export function getDeliveryTag(metadata: unknown): number | undefined {
	if (isRabbitMQMetadata(metadata)) {
		return metadata.deliveryTag;
	}
	return undefined;
}

/**
 * Check if message was redelivered
 */
export function isRedelivered(metadata: unknown): boolean | undefined {
	if (isRabbitMQMetadata(metadata)) {
		return metadata.redelivered;
	}
	return undefined;
}
