/**
 * PostgreSQL Adapter
 *
 * DataSource adapter for PostgreSQL using node-postgres (pg).
 * Provides connection pool management and native client access.
 */

import { Pool, type PoolClient } from "pg";
import type { DataSourceAdapter, DataSourceAdapterEvents, Unsubscribe } from "testurio";
import type { PostgresAdapterConfig } from "./pg.types.js";

/**
 * PostgreSQL Adapter Implementation
 *
 * Wraps node-postgres Pool with DataSourceAdapter interface.
 * Handles connection pooling, lifecycle, and events.
 *
 * @example
 * ```typescript
 * const adapter = new PostgresAdapter({
 *   host: "localhost",
 *   port: 5432,
 *   database: "mydb",
 *   user: "postgres",
 *   password: "secret",
 * });
 *
 * const ds = new DataSource("db", { adapter });
 * await ds.start();
 *
 * await ds.exec(async (pool) => {
 *   const result = await pool.query("SELECT * FROM users");
 *   return result.rows;
 * });
 * ```
 */
export class PostgresAdapter implements DataSourceAdapter<Pool, PostgresAdapterConfig> {
	readonly type = "postgres";
	readonly config: PostgresAdapterConfig;

	private pool: Pool | null = null;
	private connected = false;
	private eventHandlers: Map<keyof DataSourceAdapterEvents, Set<(data: unknown) => void>> = new Map();

	constructor(config: PostgresAdapterConfig) {
		this.config = config;
	}

	/**
	 * Initialize the adapter and create the connection pool
	 */
	async init(): Promise<void> {
		if (this.pool) {
			throw new Error("PostgresAdapter: already initialized");
		}

		const poolConfig = {
			host: this.config.host ?? "localhost",
			port: this.config.port ?? 5432,
			database: this.config.database,
			user: this.config.user,
			password: this.config.password,
			connectionString: this.config.connectionString,
			max: this.config.max ?? 10,
			min: this.config.min ?? 0,
			connectionTimeoutMillis: this.config.connectionTimeoutMillis ?? 30000,
			idleTimeoutMillis: this.config.idleTimeoutMillis ?? 10000,
			statement_timeout: this.config.statementTimeout,
			query_timeout: this.config.queryTimeout,
			application_name: this.config.applicationName,
			ssl: this.config.ssl,
			...this.config.options,
		};

		this.pool = new Pool(poolConfig);

		// Set up event handlers
		this.pool.on("connect", () => {
			if (!this.connected) {
				this.connected = true;
				this.emit("connected", undefined);
			}
		});

		this.pool.on("error", (error: Error) => {
			this.emit("error", error);
		});

		// Verify connection by acquiring and releasing a client
		let client: PoolClient | null = null;
		try {
			client = await this.pool.connect();
			this.connected = true;
			this.emit("connected", undefined);
		} catch (error) {
			await this.pool.end();
			this.pool = null;
			throw error;
		} finally {
			if (client) {
				client.release();
			}
		}
	}

	/**
	 * Dispose of the adapter and close all connections
	 */
	async dispose(): Promise<void> {
		if (!this.pool) {
			return;
		}

		try {
			await this.pool.end();
		} finally {
			this.pool = null;
			this.connected = false;
			this.emit("disconnected", undefined);
		}
	}

	/**
	 * Get the native pg Pool
	 */
	getClient(): Pool {
		if (!this.pool || !this.connected) {
			throw new Error("PostgresAdapter: not connected. Call init() first.");
		}
		return this.pool;
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
 * Factory function to create a PostgreSQL adapter
 */
export function createPostgresAdapter(config: PostgresAdapterConfig): PostgresAdapter {
	return new PostgresAdapter(config);
}
