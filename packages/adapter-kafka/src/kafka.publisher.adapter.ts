/**
 * Kafka Publisher Adapter
 *
 * Implements IMQPublisherAdapter for Kafka using KafkaJS.
 */

import type { Producer } from "kafkajs";
import type { Codec, IMQPublisherAdapter, PublishOptions } from "testurio";

/**
 * Convert codec output to Kafka-compatible Buffer or string.
 */
function toKafkaValue(value: string | Uint8Array): Buffer | string {
	if (typeof value === "string") {
		return value;
	}
	return Buffer.from(value);
}

/**
 * Kafka publisher adapter implementation.
 *
 * Wraps KafkaJS Producer to implement the IMQPublisherAdapter interface.
 */
export class KafkaPublisherAdapter implements IMQPublisherAdapter {
	private _isConnected = false;

	constructor(
		private readonly producer: Producer,
		private readonly codec: Codec
	) {}

	get isConnected(): boolean {
		return this._isConnected;
	}

	/**
	 * Connect the producer to Kafka brokers.
	 */
	async connect(): Promise<void> {
		await this.producer.connect();
		this._isConnected = true;
	}

	async publish<T = unknown>(topic: string, payload: T, options?: PublishOptions): Promise<void> {
		if (!this._isConnected) {
			throw new Error("Publisher is not connected");
		}

		const encoded = await this.codec.encode(payload);
		const value = toKafkaValue(encoded);

		await this.producer.send({
			topic,
			messages: [
				{
					key: options?.key ?? null,
					value,
					headers: options?.headers
						? Object.fromEntries(Object.entries(options.headers).map(([k, v]) => [k, Buffer.from(v)]))
						: undefined,
				},
			],
		});
	}

	async publishBatch<T = unknown>(
		topic: string,
		messages: Array<{ payload: T; key?: string; headers?: Record<string, string> }>
	): Promise<void> {
		if (!this._isConnected) {
			throw new Error("Publisher is not connected");
		}

		const kafkaMessages = await Promise.all(
			messages.map(async (msg) => {
				const encoded = await this.codec.encode(msg.payload);
				return {
					key: msg.key ?? null,
					value: toKafkaValue(encoded),
					headers: msg.headers
						? Object.fromEntries(Object.entries(msg.headers).map(([k, v]) => [k, Buffer.from(v)]))
						: undefined,
				};
			})
		);

		await this.producer.send({
			topic,
			messages: kafkaMessages,
		});
	}

	async close(): Promise<void> {
		if (this._isConnected) {
			await this.producer.disconnect();
			this._isConnected = false;
		}
	}
}
