/**
 * Redis Pub/Sub Adapter
 *
 * Main adapter implementing IMQAdapter for Redis using ioredis.
 */

import Redis from "ioredis";
import {
	type Codec,
	defaultJsonCodec,
	type IMQAdapter,
	type IMQPublisherAdapter,
	type IMQSubscriberAdapter,
} from "testurio";
import { RedisPubSubPublisherAdapter } from "./pubsub.publisher.adapter";
import { RedisPubSubSubscriberAdapter } from "./pubsub.subscriber.adapter";
import type { RedisPubSubAdapterConfig } from "./pubsub.types";

/**
 * Redis Pub/Sub adapter for testurio MQ components.
 *
 * @example
 * ```typescript
 * import { Publisher, Subscriber } from "testurio";
 * import { RedisPubSubAdapter } from "@testurio/adapter-redis";
 *
 * const adapter = new RedisPubSubAdapter({
 *   host: "localhost",
 *   port: 6379,
 * });
 *
 * const publisher = new Publisher("pub", { adapter });
 * const subscriber = new Subscriber("sub", { adapter });
 * // Topics are subscribed dynamically via subscriber.onMessage("notifications")
 *
 * // For pattern subscriptions
 * const patternAdapter = new RedisPubSubAdapter({
 *   host: "localhost",
 *   usePatterns: true,
 * });
 * const patternSub = new Subscriber("sub", { adapter: patternAdapter });
 * // Subscribe to patterns via patternSub.onMessage("events:*")
 * ```
 */
export class RedisPubSubAdapter implements IMQAdapter {
	readonly type = "redis-pubsub";
	private readonly config: RedisPubSubAdapterConfig;
	private publisherRedis: Redis | null = null;
	private subscriberRedisInstances: Redis[] = [];
	private publishers: RedisPubSubPublisherAdapter[] = [];
	private subscribers: RedisPubSubSubscriberAdapter[] = [];

	constructor(config: RedisPubSubAdapterConfig = {}) {
		this.config = config;
	}

	/**
	 * Create Redis connection options from config.
	 */
	private getRedisOptions() {
		return {
			host: this.config.host ?? "localhost",
			port: this.config.port ?? 6379,
			password: this.config.password,
			db: this.config.db ?? 0,
			name: this.config.name,
			tls: this.config.tls ? {} : undefined,
			...this.config.redisOptions,
		};
	}

	/**
	 * Get or create Redis connection for publishing.
	 */
	private getPublisherRedis(): Redis {
		if (!this.publisherRedis) {
			this.publisherRedis = new Redis(this.getRedisOptions());
		}
		return this.publisherRedis;
	}

	/**
	 * Create dedicated Redis connection for subscribing.
	 * Each subscriber needs its own connection.
	 */
	private createSubscriberRedis(): Redis {
		const redis = new Redis(this.getRedisOptions());
		this.subscriberRedisInstances.push(redis);
		return redis;
	}

	async createPublisher(codec: Codec = defaultJsonCodec): Promise<IMQPublisherAdapter> {
		const redis = this.getPublisherRedis();
		const adapter = new RedisPubSubPublisherAdapter(redis, codec);
		await adapter.connect();
		this.publishers.push(adapter);
		return adapter;
	}

	async createSubscriber(codec: Codec = defaultJsonCodec): Promise<IMQSubscriberAdapter> {
		// Create dedicated Redis connection for subscriber
		const redis = this.createSubscriberRedis();

		const adapter = new RedisPubSubSubscriberAdapter(redis, codec, this.config.usePatterns ?? false);

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

		// Close Redis connections
		if (this.publisherRedis) {
			await this.publisherRedis.quit();
			this.publisherRedis = null;
		}

		for (const redis of this.subscriberRedisInstances) {
			await redis.quit();
		}
		this.subscriberRedisInstances = [];
	}
}
