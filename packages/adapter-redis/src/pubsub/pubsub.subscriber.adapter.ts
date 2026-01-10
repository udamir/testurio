/**
 * Redis Pub/Sub Subscriber Adapter
 *
 * Implements IMQSubscriberAdapter for Redis using ioredis.
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
 */
export class RedisPubSubSubscriberAdapter implements IMQSubscriberAdapter {
	readonly id: string;
	private _isConnected = false;
	private messageHandler?: (message: QueueMessage) => void;
	private errorHandler?: (error: Error) => void;
	private disconnectHandler?: () => void;

	constructor(
		private readonly redis: Redis,
		private readonly topics: string[],
		private readonly codec: Codec,
		private readonly usePatterns: boolean = false
	) {
		this.id = `redis-sub-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
	}

	get isConnected(): boolean {
		return this._isConnected;
	}

	/**
	 * Subscribe to topics and start receiving messages.
	 */
	async connect(): Promise<void> {
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

		// Subscribe to topics
		if (this.usePatterns) {
			await this.redis.psubscribe(...this.topics);
		} else {
			await this.redis.subscribe(...this.topics);
		}

		this._isConnected = true;
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
		if (this._isConnected) {
			// Unsubscribe from topics
			if (this.usePatterns) {
				await this.redis.punsubscribe(...this.topics);
			} else {
				await this.redis.unsubscribe(...this.topics);
			}
			this._isConnected = false;
		}
		// Don't close Redis connection as it's managed separately
	}
}
