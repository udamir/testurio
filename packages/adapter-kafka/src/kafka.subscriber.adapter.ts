/**
 * Kafka Subscriber Adapter
 *
 * Implements IMQSubscriberAdapter for Kafka using KafkaJS.
 * Supports dynamic topic subscription via subscribe()/unsubscribe().
 */

import type { Consumer, ConsumerCrashEvent, EachMessagePayload } from "kafkajs";
import type { Codec, IMQSubscriberAdapter, QueueMessage } from "testurio";
import type { KafkaMessageMetadata } from "./kafka.types";

/**
 * Kafka subscriber adapter implementation.
 *
 * Wraps KafkaJS Consumer to implement the IMQSubscriberAdapter interface.
 * Note: Kafka has limitations on dynamic subscription - topics must be subscribed
 * before consumer.run() is called. For testing purposes, we restart the consumer
 * when new topics are added.
 */
export class KafkaSubscriberAdapter implements IMQSubscriberAdapter<QueueMessage> {
	readonly id: string;
	private _isConnected = false;
	private _isRunning = false;
	private messageHandler?: (topic: string, message: QueueMessage) => void;
	private errorHandler?: (error: Error) => void;
	private disconnectHandler?: () => void;
	private subscribedTopics: Set<string> = new Set();

	constructor(
		private readonly consumer: Consumer,
		private readonly codec: Codec,
		private readonly fromBeginning: boolean = false
	) {
		this.id = `kafka-sub-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
	}

	get isConnected(): boolean {
		return this._isConnected;
	}

	/**
	 * Connect to Kafka.
	 */
	async connect(): Promise<void> {
		await this.consumer.connect();
		this._isConnected = true;
	}

	/**
	 * Subscribe to a topic. Does NOT start the consumer.
	 * Call startConsuming() after all subscriptions are registered.
	 *
	 * Note: This method only registers the topic subscription with KafkaJS.
	 * The consumer must be started separately via startConsuming() to trigger
	 * consumer group coordination (join, rebalance, partition assignment).
	 */
	async subscribe(topic: string): Promise<void> {
		if (this.subscribedTopics.has(topic)) {
			return; // Already subscribed
		}

		// Just register the subscription - don't start/restart consumer
		await this.consumer.subscribe({
			topic,
			fromBeginning: this.fromBeginning,
		});
		this.subscribedTopics.add(topic);
	}

	/**
	 * Unsubscribe from a topic.
	 * Note: Kafka doesn't support unsubscribing from individual topics easily.
	 * We remove from our set and ignore messages from that topic.
	 */
	async unsubscribe(topic: string): Promise<void> {
		this.subscribedTopics.delete(topic);
	}

	/**
	 * Get currently subscribed topics.
	 */
	getSubscribedTopics(): string[] {
		return Array.from(this.subscribedTopics);
	}

	/**
	 * Start consuming messages. Call after all topics are subscribed.
	 * This triggers consumer group join and rebalancing.
	 *
	 * For optimal performance with Kafka, call subscribe() for all topics first,
	 * then call startConsuming() once to trigger a single rebalancing cycle.
	 */
	async startConsuming(): Promise<void> {
		if (this._isRunning) {
			return;
		}

		if (this.subscribedTopics.size === 0) {
			return; // No topics to consume
		}

		await this.consumer.run({
			eachMessage: async (payload: EachMessagePayload) => {
				await this.handleMessage(payload);
			},
		});

		this._isRunning = true;
	}

	private async handleMessage(payload: EachMessagePayload): Promise<void> {
		if (!this.messageHandler) {
			return;
		}

		// Skip if topic was unsubscribed
		if (!this.subscribedTopics.has(payload.topic)) {
			return;
		}

		try {
			const { topic, partition, message } = payload;

			// Decode headers
			const headers: Record<string, string> = {};
			if (message.headers) {
				for (const [key, value] of Object.entries(message.headers)) {
					if (value) {
						headers[key] = Buffer.isBuffer(value) ? value.toString() : String(value);
					}
				}
			}

			// Decode payload
			const decodedPayload = message.value ? this.codec.decode(message.value.toString()) : null;

			// Build Kafka-specific metadata
			const metadata: KafkaMessageMetadata = {
				partition,
				offset: message.offset,
				size: message.size,
				attributes: message.attributes,
			};

			const queueMessage: QueueMessage = {
				topic,
				payload: decodedPayload,
				key: message.key?.toString(),
				headers: Object.keys(headers).length > 0 ? headers : undefined,
				timestamp: message.timestamp ? Number.parseInt(message.timestamp, 10) : undefined,
				metadata,
			};

			this.messageHandler(topic, queueMessage);
		} catch (error) {
			this.errorHandler?.(error instanceof Error ? error : new Error(String(error)));
		}
	}

	onMessage(handler: (topic: string, message: QueueMessage) => void): void {
		this.messageHandler = handler;
	}

	onError(handler: (error: Error) => void): void {
		this.errorHandler = handler;

		// Also subscribe to consumer errors
		this.consumer.on("consumer.crash", (event: ConsumerCrashEvent) => {
			handler(event.payload.error);
		});
	}

	onDisconnect(handler: () => void): void {
		this.disconnectHandler = handler;

		this.consumer.on("consumer.disconnect", () => {
			this._isConnected = false;
			handler();
		});
	}

	async close(): Promise<void> {
		if (this._isRunning) {
			await this.consumer.stop();
			this._isRunning = false;
		}
		if (this._isConnected) {
			await this.consumer.disconnect();
			this._isConnected = false;
			this.disconnectHandler?.();
		}
		this.subscribedTopics.clear();
	}
}
