/**
 * Redis Pub/Sub Publisher Adapter
 *
 * Implements IMQPublisherAdapter for Redis using ioredis.
 */

import type { Redis } from "ioredis";
import type { Codec, IMQPublisherAdapter, PublishOptions } from "testurio";

/**
 * Redis Pub/Sub publisher adapter implementation.
 *
 * Wraps ioredis PUBLISH to implement the IMQPublisherAdapter interface.
 *
 * Note: Redis Pub/Sub doesn't support message keys or headers natively.
 * These are encoded into the message payload.
 */
export class RedisPubSubPublisherAdapter implements IMQPublisherAdapter {
	private _isConnected = false;

	constructor(
		private readonly redis: Redis,
		private readonly codec: Codec
	) {}

	get isConnected(): boolean {
		return this._isConnected;
	}

	/**
	 * Mark as connected (Redis connection is already established).
	 */
	async connect(): Promise<void> {
		// Redis is already connected when passed in
		this._isConnected = this.redis.status === "ready";

		if (!this._isConnected) {
			await new Promise<void>((resolve, reject) => {
				this.redis.once("ready", () => {
					this._isConnected = true;
					resolve();
				});
				this.redis.once("error", reject);
			});
		}
	}

	async publish<T = unknown>(topic: string, payload: T, options?: PublishOptions): Promise<void> {
		if (!this._isConnected) {
			throw new Error("Publisher is not connected");
		}

		// Wrap payload with optional metadata (key, headers)
		const envelope = {
			payload,
			key: options?.key,
			headers: options?.headers,
			timestamp: Date.now(),
		};

		const encoded = await this.codec.encode(envelope);
		// Pass raw bytes (Buffer) directly when the codec is binary; only string
		// payloads stay as strings. ioredis.publish accepts both natively.
		const wire: string | Buffer = typeof encoded === "string" ? encoded : Buffer.from(encoded);

		await this.redis.publish(topic, wire);
	}

	async publishBatch<T = unknown>(
		topic: string,
		messages: Array<{
			payload: T;
			key?: string;
			headers?: Record<string, string>;
		}>
	): Promise<void> {
		if (!this._isConnected) {
			throw new Error("Publisher is not connected");
		}

		// Use pipeline for batch publishing
		const pipeline = this.redis.pipeline();

		for (const msg of messages) {
			const envelope = {
				payload: msg.payload,
				key: msg.key,
				headers: msg.headers,
				timestamp: Date.now(),
			};

			const encoded = await this.codec.encode(envelope);
			// Pass raw bytes (Buffer) directly when the codec is binary; only string
			// payloads stay as strings. ioredis.publish accepts both natively.
			const wire: string | Buffer = typeof encoded === "string" ? encoded : Buffer.from(encoded);
			pipeline.publish(topic, wire);
		}

		await pipeline.exec();
	}

	async close(): Promise<void> {
		// Don't close the Redis connection as it's shared
		this._isConnected = false;
	}
}
