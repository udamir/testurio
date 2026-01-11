/**
 * RabbitMQ Adapter
 *
 * Main adapter implementing IMQAdapter for RabbitMQ using amqplib.
 */

import amqplib, { type ChannelModel } from "amqplib";
import type { Codec, IMQAdapter, IMQPublisherAdapter, IMQSubscriberAdapter } from "testurio";
import { RabbitMQPublisherAdapter } from "./rabbitmq.publisher.adapter";
import { RabbitMQSubscriberAdapter } from "./rabbitmq.subscriber.adapter";
import type { RabbitMQAdapterConfig } from "./rabbitmq.types";

/**
 * RabbitMQ adapter for testurio MQ components.
 *
 * @example
 * ```typescript
 * import { Publisher, Subscriber } from "testurio";
 * import { RabbitMQAdapter } from "@testurio/adapter-rabbitmq";
 *
 * const adapter = new RabbitMQAdapter({
 *   url: "amqp://localhost:5672",
 *   exchange: "events",
 *   exchangeType: "topic",
 * });
 *
 * const publisher = new Publisher("pub", { adapter });
 * const subscriber = new Subscriber("sub", { adapter });
 * // Topics are subscribed dynamically via subscriber.onMessage("orders.#")
 * ```
 */
export class RabbitMQAdapter implements IMQAdapter {
	readonly type = "rabbitmq";
	private readonly config: RabbitMQAdapterConfig;
	private connection: ChannelModel | null = null;
	private publishers: RabbitMQPublisherAdapter[] = [];
	private subscribers: RabbitMQSubscriberAdapter[] = [];

	constructor(config: RabbitMQAdapterConfig) {
		this.config = config;
	}

	/**
	 * Establish connection to RabbitMQ if not already connected.
	 */
	private async ensureConnection(): Promise<ChannelModel> {
		if (!this.connection) {
			this.connection = await amqplib.connect(this.config.url, {
				heartbeat: this.config.heartbeat ?? 60,
				...this.config.socketOptions,
			});

			// Handle connection errors
			this.connection.on("error", (err: Error) => {
				console.error("RabbitMQ connection error:", err);
			});

			this.connection.on("close", () => {
				this.connection = null;
			});
		}
		return this.connection;
	}

	async createPublisher(codec: Codec): Promise<IMQPublisherAdapter> {
		const connection = await this.ensureConnection();

		const adapter = new RabbitMQPublisherAdapter(
			connection,
			codec,
			this.config.exchange ?? "",
			this.config.exchangeType ?? "topic",
			this.config.durable ?? true
		);

		await adapter.connect();
		this.publishers.push(adapter);
		return adapter;
	}

	async createSubscriber(codec: Codec): Promise<IMQSubscriberAdapter> {
		const connection = await this.ensureConnection();

		const adapter = new RabbitMQSubscriberAdapter(
			connection,
			codec,
			this.config.exchange ?? "",
			this.config.exchangeType ?? "topic",
			this.config.durable ?? true,
			this.config.prefetch ?? 1,
			this.config.autoAck ?? true,
			this.config.queueOptions
		);

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

		// Close connection
		if (this.connection) {
			await this.connection.close();
			this.connection = null;
		}
	}
}
