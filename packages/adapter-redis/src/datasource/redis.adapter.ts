/**
 * Redis Adapter
 *
 * DataSource adapter for Redis using ioredis.
 * Provides connection lifecycle management and native client access.
 */

import Redis from "ioredis";
import type { DataSourceAdapter, DataSourceAdapterEvents, Unsubscribe } from "testurio";
import type { RedisAdapterConfig } from "./redis.types";

/**
 * Redis Adapter Implementation
 *
 * Wraps ioredis client with DataSourceAdapter interface.
 * Handles connection lifecycle, events, and reconnection.
 *
 * @example
 * ```typescript
 * const adapter = new RedisAdapter({
 *   host: "localhost",
 *   port: 6379,
 *   password: "secret",
 * });
 *
 * const ds = new DataSource("cache", { adapter });
 * await ds.start();
 *
 * await ds.exec(async (client) => {
 *   await client.set("key", "value");
 *   return client.get("key");
 * });
 * ```
 */
export class RedisAdapter implements DataSourceAdapter<Redis, RedisAdapterConfig> {
	readonly type = "redis";
	readonly config: RedisAdapterConfig;

	private client: Redis | null = null;
	private connected = false;
	private eventHandlers = new Map<keyof DataSourceAdapterEvents, Set<(data: unknown) => void>>();

	constructor(config: RedisAdapterConfig) {
		this.config = config;
	}

	/**
	 * Initialize the adapter and connect to Redis
	 */
	async init(): Promise<void> {
		if (this.client) {
			throw new Error("RedisAdapter: already initialized");
		}

		const redisOptions = {
			host: this.config.host ?? "localhost",
			port: this.config.port ?? 6379,
			password: this.config.password,
			db: this.config.db ?? 0,
			name: this.config.name,
			connectTimeout: this.config.connectTimeout ?? 10000,
			commandTimeout: this.config.commandTimeout,
			maxRetriesPerRequest: this.config.maxRetriesPerRequest ?? 3,
			lazyConnect: true, // We'll connect explicitly
			...this.config.options,
		};

		// Add TLS if enabled
		if (this.config.tls) {
			Object.assign(redisOptions, { tls: {} });
		}

		this.client = new Redis(redisOptions);

		// Setup event handlers
		this.client.on("connect", () => {
			this.connected = true;
			this.emit("connected", undefined);
		});

		this.client.on("close", () => {
			this.connected = false;
			this.emit("disconnected", undefined);
		});

		this.client.on("error", (error: Error) => {
			this.emit("error", error);
		});

		// Connect to Redis
		try {
			await this.client.connect();
		} catch (error) {
			this.client = null;
			throw error;
		}
	}

	/**
	 * Dispose of the adapter and disconnect from Redis
	 */
	async dispose(): Promise<void> {
		if (!this.client) {
			return;
		}

		try {
			await this.client.quit();
		} catch {
			// Force disconnect if quit fails
			this.client.disconnect();
		} finally {
			this.client = null;
			this.connected = false;
		}
	}

	/**
	 * Get the native ioredis client
	 */
	getClient(): Redis {
		if (!this.client || !this.connected) {
			throw new Error("RedisAdapter: not connected. Call init() first.");
		}
		return this.client;
	}

	/**
	 * Check if adapter is connected
	 */
	isConnected(): boolean {
		return this.connected;
	}

	/**
	 * Subscribe to adapter events
	 */
	on<K extends keyof DataSourceAdapterEvents>(
		event: K,
		handler: (data: DataSourceAdapterEvents[K]) => void
	): Unsubscribe {
		if (!this.eventHandlers.has(event)) {
			this.eventHandlers.set(event, new Set());
		}
		this.eventHandlers.get(event)?.add(handler as (data: unknown) => void);

		return () => {
			this.eventHandlers.get(event)?.delete(handler as (data: unknown) => void);
		};
	}

	/**
	 * Emit an event to all subscribers
	 */
	private emit<K extends keyof DataSourceAdapterEvents>(event: K, data: DataSourceAdapterEvents[K]): void {
		const handlers = this.eventHandlers.get(event);
		if (handlers) {
			for (const handler of handlers) {
				handler(data);
			}
		}
	}
}

/**
 * Factory function to create a Redis adapter
 */
export function createRedisAdapter(config: RedisAdapterConfig): RedisAdapter {
	return new RedisAdapter(config);
}
