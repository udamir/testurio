/**
 * RabbitMQ Publisher Adapter
 *
 * Implements IMQPublisherAdapter for RabbitMQ using amqplib.
 */

import type { Channel, ChannelModel, ConfirmChannel } from "amqplib";
import type { Codec, IMQPublisherAdapter, PublishOptions } from "testurio";

/**
 * Convert codec output to Buffer.
 */
function toBuffer(value: string | Uint8Array): Buffer {
	if (typeof value === "string") {
		return Buffer.from(value);
	}
	return Buffer.from(value);
}

/**
 * RabbitMQ publisher adapter implementation.
 *
 * Wraps amqplib Channel to implement the IMQPublisherAdapter interface.
 */
export class RabbitMQPublisherAdapter implements IMQPublisherAdapter {
	private _isConnected = false;
	private channel: Channel | ConfirmChannel | null = null;

	constructor(
		private readonly connection: ChannelModel,
		private readonly codec: Codec,
		private readonly exchange: string = "",
		private readonly exchangeType: "direct" | "fanout" | "topic" | "headers" = "topic",
		private readonly durable: boolean = true
	) {}

	get isConnected(): boolean {
		return this._isConnected;
	}

	/**
	 * Create channel and declare exchange.
	 */
	async connect(): Promise<void> {
		this.channel = await this.connection.createConfirmChannel();

		// Declare exchange if not using default
		if (this.exchange) {
			await this.channel.assertExchange(this.exchange, this.exchangeType, {
				durable: this.durable,
			});
		}

		this._isConnected = true;
	}

	async publish<T = unknown>(topic: string, payload: T, options?: PublishOptions): Promise<void> {
		if (!this._isConnected || !this.channel) {
			throw new Error("Publisher is not connected");
		}

		const encoded = await this.codec.encode(payload);
		const buffer = toBuffer(encoded);

		// Convert headers to AMQP format
		const headers: Record<string, string | Buffer> = {};
		if (options?.headers) {
			for (const [key, value] of Object.entries(options.headers)) {
				headers[key] = value;
			}
		}

		// Use routing key from options.key or topic name
		const routingKey = options?.key ?? topic;

		return new Promise<void>((resolve, reject) => {
			const confirmChannel = this.channel as ConfirmChannel;

			confirmChannel.publish(
				this.exchange,
				routingKey,
				buffer,
				{
					headers: Object.keys(headers).length > 0 ? headers : undefined,
					persistent: true,
					timestamp: Date.now(),
				},
				(err) => {
					if (err) {
						reject(err);
					} else {
						resolve();
					}
				}
			);
		});
	}

	async publishBatch<T = unknown>(
		topic: string,
		messages: Array<{ payload: T; key?: string; headers?: Record<string, string> }>
	): Promise<void> {
		if (!this._isConnected || !this.channel) {
			throw new Error("Publisher is not connected");
		}

		// Publish all messages and wait for confirms
		await Promise.all(
			messages.map((msg) =>
				this.publish(topic, msg.payload, {
					key: msg.key,
					headers: msg.headers,
				})
			)
		);
	}

	async close(): Promise<void> {
		if (this.channel) {
			await this.channel.close();
			this.channel = null;
		}
		this._isConnected = false;
	}
}
