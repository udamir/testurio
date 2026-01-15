/**
 * Kafka Adapter
 *
 * Main adapter implementing IMQAdapter for Kafka using KafkaJS.
 */

import { Kafka, logLevel as KafkaLogLevel } from "kafkajs";
import { defaultJsonCodec, type Codec, type IMQAdapter, type IMQPublisherAdapter, type IMQSubscriberAdapter } from "testurio";
import { KafkaPublisherAdapter } from "./kafka.publisher.adapter";
import { KafkaSubscriberAdapter } from "./kafka.subscriber.adapter";
import type { KafkaAdapterConfig } from "./kafka.types";

/**
 * Kafka adapter for testurio MQ components.
 *
 * @example
 * ```typescript
 * import { Publisher, Subscriber } from "testurio";
 * import { KafkaAdapter } from "@testurio/adapter-kafka";
 *
 * const adapter = new KafkaAdapter({
 *   brokers: ["localhost:9092"],
 *   clientId: "my-app",
 *   groupId: "my-consumer-group",
 * });
 *
 * const publisher = new Publisher("pub", { adapter });
 * const subscriber = new Subscriber("sub", { adapter });
 * // Topics are subscribed dynamically via subscriber.onMessage("topic")
 * ```
 */
export class KafkaAdapter implements IMQAdapter {
	readonly type = "kafka";
	private readonly kafka: Kafka;
	private readonly config: KafkaAdapterConfig;
	private publishers: KafkaPublisherAdapter[] = [];
	private subscribers: KafkaSubscriberAdapter[] = [];

	constructor(config: KafkaAdapterConfig) {
		this.config = config;

		this.kafka = new Kafka({
			clientId: config.clientId ?? "testurio-kafka-adapter",
			brokers: config.brokers,
			connectionTimeout: config.connectionTimeout ?? 30000,
			requestTimeout: config.requestTimeout ?? 30000,
			ssl: config.ssl,
			sasl: config.sasl,
			logLevel: config.logLevel ?? KafkaLogLevel.WARN,
			...config.kafkaOptions,
		});
	}

	async createPublisher(codec: Codec = defaultJsonCodec): Promise<IMQPublisherAdapter> {
		const producer = this.kafka.producer(this.config.producerOptions);
		const adapter = new KafkaPublisherAdapter(producer, codec);
		await adapter.connect();
		this.publishers.push(adapter);
		return adapter;
	}

	async createSubscriber(codec: Codec = defaultJsonCodec): Promise<IMQSubscriberAdapter> {
		if (!this.config.groupId) {
			throw new Error("groupId is required for creating subscribers");
		}

		const consumer = this.kafka.consumer({
			groupId: this.config.groupId,
			...this.config.consumerOptions,
		});

		const adapter = new KafkaSubscriberAdapter(consumer, codec, this.config.fromBeginning ?? false);
		await adapter.connect();
		this.subscribers.push(adapter);
		return adapter;
	}

	async dispose(): Promise<void> {
		// Close all publishers
		for (const publisher of this.publishers) {
			await publisher.close();
		}
		this.publishers = [];

		// Close all subscribers
		for (const subscriber of this.subscribers) {
			await subscriber.close();
		}
		this.subscribers = [];
	}
}
