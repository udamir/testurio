/**
 * Redis Pub/Sub Subscriber Adapter
 *
 * Implements IMQSubscriberAdapter for Redis using ioredis.
 * Supports dynamic topic subscription via subscribe()/unsubscribe().
 */

import type { Redis } from "ioredis";
import type { Codec, IMQSubscriberAdapter, QueueMessage } from "testurio";
import type { RedisPubSubMessageMetadata } from "./pubsub.types";

/**
 * Message envelope structure used by publisher
 */
interface MessageEnvelope {
	payload: unknown;
	key?: string;
	headers?: Record<string, string>;
	timestamp?: number;
}

/**
 * Redis Pub/Sub subscriber adapter implementation.
 *
 * Wraps ioredis SUBSCRIBE/PSUBSCRIBE to implement the IMQSubscriberAdapter interface.
 * Topics are subscribed dynamically via subscribe()/unsubscribe().
 */
export class RedisPubSubSubscriberAdapter implements IMQSubscriberAdapter<QueueMessage> {
	readonly id: string;
	private _isConnected = false;
	private messageHandler?: (topic: string, message: QueueMessage) => void;
	private errorHandler?: (error: Error) => void;
	private disconnectHandler?: () => void;
	private subscribedTopics: Set<string> = new Set();
	private handlersSet = false;

	constructor(
		private readonly redis: Redis,
		private readonly codec: Codec,
		private readonly usePatterns: boolean = false
	) {
		this.id = `redis-sub-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
	}

	get isConnected(): boolean {
		return this._isConnected;
	}

	/**
	 * Connect to Redis and set up message handlers.
	 */
	async connect(): Promise<void> {
		// Wait for Redis connection to be ready
		if (this.redis.status !== "ready") {
			await new Promise<void>((resolve, reject) => {
				this.redis.once("ready", resolve);
				this.redis.once("error", reject);
			});
		}

		this.setupHandlers();
		this._isConnected = true;
	}

	/**
	 * Set up message and error handlers (only once).
	 */
	private setupHandlers(): void {
		if (this.handlersSet) {
			return;
		}

		// Set up message handler
		if (this.usePatterns) {
			this.redis.on("pmessage", (pattern: string, channel: string, message: string) => {
				this.handleMessage(channel, message, pattern);
			});
		} else {
			this.redis.on("message", (channel: string, message: string) => {
				this.handleMessage(channel, message);
			});
		}

		// Set up error handler
		this.redis.on("error", (err: Error) => {
			this.errorHandler?.(err);
		});

		// Set up disconnect handler
		this.redis.on("close", () => {
			this._isConnected = false;
			this.disconnectHandler?.();
		});

		this.handlersSet = true;
	}

	/**
	 * Subscribe to a topic dynamically.
	 */
	async subscribe(topic: string): Promise<void> {
		if (this.subscribedTopics.has(topic)) {
			return; // Already subscribed
		}

		if (this.usePatterns) {
			await this.redis.psubscribe(topic);
		} else {
			await this.redis.subscribe(topic);
		}

		this.subscribedTopics.add(topic);
	}

	/**
	 * Unsubscribe from a topic.
	 */
	async unsubscribe(topic: string): Promise<void> {
		if (!this.subscribedTopics.has(topic)) {
			return; // Not subscribed
		}

		if (this.usePatterns) {
			await this.redis.punsubscribe(topic);
		} else {
			await this.redis.unsubscribe(topic);
		}

		this.subscribedTopics.delete(topic);
	}

	/**
	 * Get currently subscribed topics.
	 */
	getSubscribedTopics(): string[] {
		return Array.from(this.subscribedTopics);
	}

	private handleMessage(channel: string, rawMessage: string, pattern?: string): void {
		if (!this.messageHandler) {
			return;
		}

		try {
			// Decode envelope
			const envelope = this.codec.decode(rawMessage) as MessageEnvelope;

			// Build Redis-specific metadata
			const metadata: RedisPubSubMessageMetadata = {
				channel,
				pattern,
				isPattern: pattern !== undefined,
			};

			const queueMessage: QueueMessage = {
				topic: channel,
				payload: envelope.payload,
				key: envelope.key,
				headers: envelope.headers,
				timestamp: envelope.timestamp,
				metadata,
			};

			// Pass pattern as topic for pattern subscriptions, channel otherwise
			// Adapter normalizes topic to what was subscribed (pattern or exact channel)
			const topic = pattern ?? channel;
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
	}

	onDisconnect(handler: () => void): void {
		this.disconnectHandler = handler;
	}

	async close(): Promise<void> {
		if (this._isConnected && this.subscribedTopics.size > 0) {
			// Unsubscribe from all topics
			const topics = Array.from(this.subscribedTopics);
			if (this.usePatterns) {
				await this.redis.punsubscribe(...topics);
			} else {
				await this.redis.unsubscribe(...topics);
			}
		}
		this._isConnected = false;
		this.subscribedTopics.clear();
		// Don't close Redis connection as it's managed separately
	}
}
