/**
 * RabbitMQ Subscriber Adapter
 *
 * Implements IMQSubscriberAdapter for RabbitMQ using amqplib.
 * Supports dynamic topic subscription via subscribe()/unsubscribe().
 */

import type { Channel, ChannelModel, ConsumeMessage, Options } from "amqplib";
import type { Codec, IMQSubscriberAdapter, QueueMessage } from "testurio";
import type { RabbitMQMessageMetadata } from "./rabbitmq.types";

/**
 * RabbitMQ subscriber adapter implementation.
 *
 * Wraps amqplib Channel to implement the IMQSubscriberAdapter interface.
 * Topics are bound dynamically via subscribe()/unsubscribe().
 */
export class RabbitMQSubscriberAdapter implements IMQSubscriberAdapter<QueueMessage> {
	readonly id: string;
	private _isConnected = false;
	private channel: Channel | null = null;
	private messageHandler?: (topic: string, message: QueueMessage) => void;
	private errorHandler?: (error: Error) => void;
	private disconnectHandler?: () => void;
	private consumerTag?: string;
	private queueName: string;
	private subscribedTopics: Set<string> = new Set();

	constructor(
		private readonly connection: ChannelModel,
		private readonly codec: Codec,
		private readonly exchange: string = "",
		private readonly exchangeType: "direct" | "fanout" | "topic" | "headers" = "topic",
		private readonly durable: boolean = true,
		private readonly prefetch: number = 1,
		private readonly autoAck: boolean = true,
		private readonly queueOptions?: Options.AssertQueue
	) {
		this.id = `rabbitmq-sub-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
		this.queueName = `testurio-${this.id}`;
	}

	get isConnected(): boolean {
		return this._isConnected;
	}

	/**
	 * Create channel, declare exchange/queue, and start consuming.
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

		// Create a queue for this subscriber
		await this.channel.assertQueue(this.queueName, {
			exclusive: true,
			autoDelete: true,
			...this.queueOptions,
		});

		// Start consuming
		const { consumerTag } = await this.channel.consume(
			this.queueName,
			(msg) => {
				if (msg) {
					this.handleMessage(msg);
				}
			},
			{ noAck: this.autoAck }
		);

		this.consumerTag = consumerTag;
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

	/**
	 * Subscribe to a topic (routing key) dynamically.
	 */
	async subscribe(topic: string): Promise<void> {
		if (this.subscribedTopics.has(topic)) {
			return; // Already subscribed
		}

		if (!this.channel) {
			throw new Error("Channel not connected");
		}

		// Bind queue to the topic as routing key
		await this.channel.bindQueue(this.queueName, this.exchange, topic);
		this.subscribedTopics.add(topic);
	}

	/**
	 * Unsubscribe from a topic (routing key).
	 */
	async unsubscribe(topic: string): Promise<void> {
		if (!this.subscribedTopics.has(topic)) {
			return; // Not subscribed
		}

		if (this.channel) {
			await this.channel.unbindQueue(this.queueName, this.exchange, topic);
		}
		this.subscribedTopics.delete(topic);
	}

	/**
	 * Get currently subscribed topics.
	 */
	getSubscribedTopics(): string[] {
		return Array.from(this.subscribedTopics);
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

			// Find which subscription pattern matched this routing key
			const routingKey = msg.fields.routingKey;
			const matchedPattern = this.findMatchingPattern(routingKey) ?? routingKey;

			// Build RabbitMQ-specific metadata
			const metadata: RabbitMQMessageMetadata = {
				consumerTag: msg.fields.consumerTag,
				deliveryTag: msg.fields.deliveryTag,
				redelivered: msg.fields.redelivered,
				exchange: msg.fields.exchange,
				routingKey: routingKey,
				subscriptionPattern: matchedPattern,
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

			// Use matched pattern as topic for hook matching
			const queueMessage: QueueMessage = {
				topic: matchedPattern,
				payload: decodedPayload,
				headers: Object.keys(headers).length > 0 ? headers : undefined,
				timestamp: msg.properties.timestamp,
				metadata,
			};

			// Pass matched pattern as topic for Subscriber hook matching
			this.messageHandler(matchedPattern, queueMessage);
		} catch (error) {
			this.errorHandler?.(error instanceof Error ? error : new Error(String(error)));
		}
	}

	/**
	 * Find which subscription pattern matches the given routing key.
	 * Supports RabbitMQ topic exchange wildcards:
	 * - `*` matches exactly one word
	 * - `#` matches zero or more words
	 */
	private findMatchingPattern(routingKey: string): string | undefined {
		for (const pattern of this.subscribedTopics) {
			if (this.matchesPattern(pattern, routingKey)) {
				return pattern;
			}
		}
		return undefined;
	}

	/**
	 * Check if a routing key matches a RabbitMQ topic pattern.
	 */
	private matchesPattern(pattern: string, routingKey: string): boolean {
		// Direct match (also handles non-wildcard patterns)
		if (pattern === routingKey) return true;

		// For patterns without wildcards, no match
		if (!pattern.includes("*") && !pattern.includes("#")) {
			return false;
		}

		const patternParts = pattern.split(".");
		const routingParts = routingKey.split(".");

		return this.matchParts(patternParts, 0, routingParts, 0);
	}

	/**
	 * Recursively match pattern parts against routing key parts.
	 */
	private matchParts(patternParts: string[], patternIdx: number, routingParts: string[], routingIdx: number): boolean {
		// Both exhausted - success
		if (patternIdx === patternParts.length && routingIdx === routingParts.length) {
			return true;
		}

		// Pattern exhausted but routing key has more parts - fail
		if (patternIdx === patternParts.length) {
			return false;
		}

		const patternPart = patternParts[patternIdx];

		if (patternPart === "#") {
			// # can match zero or more words
			// Try matching zero words (skip #)
			if (this.matchParts(patternParts, patternIdx + 1, routingParts, routingIdx)) {
				return true;
			}
			// Try matching one or more words
			if (routingIdx < routingParts.length) {
				return this.matchParts(patternParts, patternIdx, routingParts, routingIdx + 1);
			}
			return false;
		}

		// Routing key exhausted but pattern has more parts
		if (routingIdx === routingParts.length) {
			// Only valid if remaining pattern parts are all #
			for (let i = patternIdx; i < patternParts.length; i++) {
				if (patternParts[i] !== "#") return false;
			}
			return true;
		}

		if (patternPart === "*") {
			// * matches exactly one word
			return this.matchParts(patternParts, patternIdx + 1, routingParts, routingIdx + 1);
		}

		// Literal match required
		if (patternPart === routingParts[routingIdx]) {
			return this.matchParts(patternParts, patternIdx + 1, routingParts, routingIdx + 1);
		}

		return false;
	}

	onMessage(handler: (topic: string, message: QueueMessage) => void): void {
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
			// Cancel consumer
			if (this.consumerTag) {
				try {
					await this.channel.cancel(this.consumerTag);
				} catch {
					// Ignore errors during cleanup
				}
				this.consumerTag = undefined;
			}

			await this.channel.close();
			this.channel = null;
		}
		this._isConnected = false;
		this.subscribedTopics.clear();
		this.disconnectHandler?.();
	}
}
