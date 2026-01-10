/**
 * Kafka Adapter Types
 *
 * Configuration and type definitions for the Kafka MQ adapter.
 */

import type { ConsumerConfig, KafkaConfig, logLevel, ProducerConfig } from "kafkajs";

/**
 * Kafka adapter configuration
 */
export interface KafkaAdapterConfig {
	/**
	 * Kafka broker addresses
	 * @example ["localhost:9092", "localhost:9093"]
	 */
	brokers: string[];

	/**
	 * Client ID for this adapter instance
	 * @default "testurio-kafka-adapter"
	 */
	clientId?: string;

	/**
	 * Consumer group ID for subscriptions
	 * Required when creating subscribers
	 */
	groupId?: string;

	/**
	 * Whether to start consuming from the beginning
	 * @default false
	 */
	fromBeginning?: boolean;

	/**
	 * Connection timeout in milliseconds
	 * @default 30000
	 */
	connectionTimeout?: number;

	/**
	 * Request timeout in milliseconds
	 * @default 30000
	 */
	requestTimeout?: number;

	/**
	 * SSL/TLS configuration
	 */
	ssl?: boolean | KafkaConfig["ssl"];

	/**
	 * SASL authentication configuration
	 */
	sasl?: KafkaConfig["sasl"];

	/**
	 * Log level for KafkaJS
	 * @default logLevel.WARN
	 */
	logLevel?: logLevel;

	/**
	 * Additional KafkaJS configuration options
	 */
	kafkaOptions?: Partial<KafkaConfig>;

	/**
	 * Producer-specific configuration
	 */
	producerOptions?: ProducerConfig;

	/**
	 * Consumer-specific configuration
	 */
	consumerOptions?: Omit<ConsumerConfig, "groupId">;
}

/**
 * Kafka message metadata
 *
 * Broker-specific metadata returned with received messages.
 * Use this interface to interpret QueueMessage.metadata.
 */
export interface KafkaMessageMetadata {
	/**
	 * Partition the message was received from
	 */
	partition: number;

	/**
	 * Offset of the message in the partition
	 */
	offset: string;

	/**
	 * Size of the message in bytes
	 */
	size?: number;

	/**
	 * Message attributes
	 */
	attributes?: number;
}

/**
 * Type guard to check if metadata is Kafka metadata
 */
export function isKafkaMetadata(metadata: unknown): metadata is KafkaMessageMetadata {
	return (
		typeof metadata === "object" &&
		metadata !== null &&
		"partition" in metadata &&
		"offset" in metadata &&
		typeof (metadata as KafkaMessageMetadata).partition === "number" &&
		typeof (metadata as KafkaMessageMetadata).offset === "string"
	);
}

/**
 * Extract Kafka partition from message metadata
 */
export function getKafkaPartition(metadata: unknown): number | undefined {
	if (isKafkaMetadata(metadata)) {
		return metadata.partition;
	}
	return undefined;
}

/**
 * Extract Kafka offset from message metadata
 */
export function getKafkaOffset(metadata: unknown): string | undefined {
	if (isKafkaMetadata(metadata)) {
		return metadata.offset;
	}
	return undefined;
}
