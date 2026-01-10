/**
 * RabbitMQ Subscriber Adapter
 *
 * Implements IMQSubscriberAdapter for RabbitMQ using amqplib.
 */

import type { Channel, ChannelModel, ConsumeMessage, Options } from "amqplib";
import type { Codec, IMQSubscriberAdapter, QueueMessage } from "testurio";
import type { RabbitMQMessageMetadata } from "./rabbitmq.types";

/**
 * RabbitMQ subscriber adapter implementation.
 *
 * Wraps amqplib Channel to implement the IMQSubscriberAdapter interface.
 */
export class RabbitMQSubscriberAdapter implements IMQSubscriberAdapter {
	readonly id: string;
	private _isConnected = false;
	private channel: Channel | null = null;
	private messageHandler?: (message: QueueMessage) => void;
	private errorHandler?: (error: Error) => void;
	private disconnectHandler?: () => void;
	private consumerTags: string[] = [];

	constructor(
		private readonly connection: ChannelModel,
		private readonly topics: string[],
		private readonly codec: Codec,
		private readonly exchange: string = "",
		private readonly exchangeType: "direct" | "fanout" | "topic" | "headers" = "topic",
		private readonly durable: boolean = true,
		private readonly prefetch: number = 1,
		private readonly autoAck: boolean = true,
		private readonly queueOptions?: Options.AssertQueue
	) {
		this.id = `rabbitmq-sub-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
	}

	get isConnected(): boolean {
		return this._isConnected;
	}

	/**
	 * Create channel, declare exchange/queues, and start consuming.
	 */
	async connect(): Promise<void> {
		this.channel = await this.connection.createChannel();
		await this.channel.prefetch(this.prefetch);

		// Declare exchange if not using default
		if (this.exchange) {
			await this.channel.assertExchange(this.exchange, this.exchangeType, {
				durable: this.durable,
			});
		}

		// Create a queue for this subscriber and bind to topics
		const queueName = `testurio-${this.id}`;
		await this.channel.assertQueue(queueName, {
			exclusive: true,
			autoDelete: true,
			...this.queueOptions,
		});

		// Bind queue to each topic as routing key
		for (const topic of this.topics) {
			await this.channel.bindQueue(queueName, this.exchange, topic);
		}

		// Start consuming
		const { consumerTag } = await this.channel.consume(
			queueName,
			(msg) => {
				if (msg) {
					this.handleMessage(msg);
				}
			},
			{ noAck: this.autoAck }
		);

		this.consumerTags.push(consumerTag);
		this._isConnected = true;

		// Handle channel errors
		this.channel.on("error", (err) => {
			this.errorHandler?.(err);
		});

		this.channel.on("close", () => {
			this._isConnected = false;
			this.disconnectHandler?.();
		});
	}

	private handleMessage(msg: ConsumeMessage): void {
		if (!this.messageHandler) {
			return;
		}

		try {
			// Decode headers
			const headers: Record<string, string> = {};
			if (msg.properties.headers) {
				for (const [key, value] of Object.entries(msg.properties.headers)) {
					if (value !== undefined && value !== null) {
						headers[key] = Buffer.isBuffer(value) ? value.toString() : String(value);
					}
				}
			}

			// Decode payload
			const decodedPayload = this.codec.decode(msg.content.toString());

			// Build RabbitMQ-specific metadata
			const metadata: RabbitMQMessageMetadata = {
				consumerTag: msg.fields.consumerTag,
				deliveryTag: msg.fields.deliveryTag,
				redelivered: msg.fields.redelivered,
				exchange: msg.fields.exchange,
				routingKey: msg.fields.routingKey,
				properties: {
					contentType: msg.properties.contentType,
					contentEncoding: msg.properties.contentEncoding,
					correlationId: msg.properties.correlationId,
					replyTo: msg.properties.replyTo,
					expiration: msg.properties.expiration,
					messageId: msg.properties.messageId,
					timestamp: msg.properties.timestamp,
					type: msg.properties.type,
					userId: msg.properties.userId,
					appId: msg.properties.appId,
					priority: msg.properties.priority,
				},
			};

			// Use routing key as topic
			const queueMessage: QueueMessage = {
				topic: msg.fields.routingKey,
				payload: decodedPayload,
				headers: Object.keys(headers).length > 0 ? headers : undefined,
				timestamp: msg.properties.timestamp,
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
	}

	onDisconnect(handler: () => void): void {
		this.disconnectHandler = handler;
	}

	async close(): Promise<void> {
		if (this.channel) {
			// Cancel all consumers
			for (const tag of this.consumerTags) {
				try {
					await this.channel.cancel(tag);
				} catch {
					// Ignore errors during cleanup
				}
			}
			this.consumerTags = [];

			await this.channel.close();
			this.channel = null;
		}
		this._isConnected = false;
		this.disconnectHandler?.();
	}
}
