/**
 * Kafka Subscriber Adapter
 *
 * Implements IMQSubscriberAdapter for Kafka using KafkaJS.
 */

import type { Consumer, ConsumerCrashEvent, EachMessagePayload } from "kafkajs";
import type { Codec, IMQSubscriberAdapter, QueueMessage } from "testurio";
import type { KafkaMessageMetadata } from "./kafka.types";

/**
 * Kafka subscriber adapter implementation.
 *
 * Wraps KafkaJS Consumer to implement the IMQSubscriberAdapter interface.
 */
export class KafkaSubscriberAdapter implements IMQSubscriberAdapter {
	readonly id: string;
	private _isConnected = false;
	private messageHandler?: (message: QueueMessage) => void;
	private errorHandler?: (error: Error) => void;
	private disconnectHandler?: () => void;

	constructor(
		private readonly consumer: Consumer,
		private readonly topics: string[],
		private readonly codec: Codec,
		private readonly fromBeginning: boolean = false
	) {
		this.id = `kafka-sub-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
	}

	get isConnected(): boolean {
		return this._isConnected;
	}

	/**
	 * Connect and start consuming messages.
	 */
	async connect(): Promise<void> {
		await this.consumer.connect();

		// Subscribe to all topics
		for (const topic of this.topics) {
			await this.consumer.subscribe({
				topic,
				fromBeginning: this.fromBeginning,
			});
		}

		// Start consuming
		await this.consumer.run({
			eachMessage: async (payload: EachMessagePayload) => {
				await this.handleMessage(payload);
			},
		});

		this._isConnected = true;
	}

	private async handleMessage(payload: EachMessagePayload): Promise<void> {
		if (!this.messageHandler) {
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

			this.messageHandler(queueMessage);
		} catch (error) {
			this.errorHandler?.(error instanceof Error ? error : new Error(String(error)));
		}
	}

	onMessage(handler: (message: QueueMessage) => void): void {
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
		if (this._isConnected) {
			await this.consumer.disconnect();
			this._isConnected = false;
			this.disconnectHandler?.();
		}
	}
}
