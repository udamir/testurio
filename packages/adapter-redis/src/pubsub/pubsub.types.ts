/**
 * Redis Pub/Sub Adapter Types
 *
 * Configuration and type definitions for the Redis MQ (Pub/Sub) adapter.
 */

import type { RedisOptions } from "ioredis";

/**
 * Redis Pub/Sub adapter configuration
 */
export interface RedisPubSubAdapterConfig {
	/**
	 * Redis host
	 * @default "localhost"
	 */
	host?: string;

	/**
	 * Redis port
	 * @default 6379
	 */
	port?: number;

	/**
	 * Redis password
	 */
	password?: string;

	/**
	 * Redis database number
	 * @default 0
	 */
	db?: number;

	/**
	 * Connection name
	 */
	name?: string;

	/**
	 * Enable TLS
	 */
	tls?: boolean;

	/**
	 * Additional ioredis options
	 */
	redisOptions?: RedisOptions;

	/**
	 * Support pattern subscriptions (PSUBSCRIBE)
	 * @default false
	 */
	usePatterns?: boolean;
}

/**
 * Redis Pub/Sub message metadata
 *
 * Broker-specific metadata returned with received messages.
 * Use this interface to interpret QueueMessage.metadata.
 */
export interface RedisPubSubMessageMetadata {
	/**
	 * The channel the message was received on
	 */
	channel: string;

	/**
	 * The pattern that matched (for pattern subscriptions)
	 */
	pattern?: string;

	/**
	 * Whether this was a pattern subscription
	 */
	isPattern: boolean;
}

/**
 * Type guard to check if metadata is Redis Pub/Sub metadata
 */
export function isRedisPubSubMetadata(metadata: unknown): metadata is RedisPubSubMessageMetadata {
	return (
		typeof metadata === "object" &&
		metadata !== null &&
		"channel" in metadata &&
		"isPattern" in metadata &&
		typeof (metadata as RedisPubSubMessageMetadata).channel === "string" &&
		typeof (metadata as RedisPubSubMessageMetadata).isPattern === "boolean"
	);
}

/**
 * Extract channel from Redis message metadata
 */
export function getChannel(metadata: unknown): string | undefined {
	if (isRedisPubSubMetadata(metadata)) {
		return metadata.channel;
	}
	return undefined;
}

/**
 * Extract pattern from Redis message metadata
 */
export function getPattern(metadata: unknown): string | undefined {
	if (isRedisPubSubMetadata(metadata)) {
		return metadata.pattern;
	}
	return undefined;
}

/**
 * Check if message was received via pattern subscription
 */
export function isPatternSubscription(metadata: unknown): boolean | undefined {
	if (isRedisPubSubMetadata(metadata)) {
		return metadata.isPattern;
	}
	return undefined;
}
