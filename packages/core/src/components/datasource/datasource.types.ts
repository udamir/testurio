/**
 * DataSource Types
 *
 * Types and interfaces for DataSource component and adapters.
 * DataSource provides direct SDK access to data stores (Redis, PostgreSQL, MongoDB, etc.)
 */

// =============================================================================
// Core Types
// =============================================================================

/**
 * Unsubscribe function returned by event subscriptions
 */
export type Unsubscribe = () => void;

/**
 * Events emitted by DataSource adapters
 */
export interface DataSourceAdapterEvents {
	/** Emitted when connection is established */
	connected: undefined;
	/** Emitted when connection is closed */
	disconnected: undefined;
	/** Emitted on connection/operation error */
	error: Error;
}

// =============================================================================
// Adapter Interface
// =============================================================================

/**
 * Base adapter interface for all data source adapters
 *
 * @typeParam TClient - Native SDK client type (e.g., Redis from ioredis, Pool from pg)
 * @typeParam TConfig - Adapter configuration type
 */
export interface DataSourceAdapter<TClient, TConfig = unknown> {
	/** Adapter type identifier (e.g., "redis", "postgres", "mongodb") */
	readonly type: string;

	/** Configuration used to create this adapter */
	readonly config: TConfig;

	/**
	 * Initialize the adapter and establish connection
	 * Called by DataSource.start()
	 */
	init(): Promise<void>;

	/**
	 * Dispose of the adapter and close connection
	 * Called by DataSource.stop()
	 */
	dispose(): Promise<void>;

	/**
	 * Get the native SDK client
	 * Returns the underlying client for direct SDK access
	 */
	getClient(): TClient;

	/**
	 * Check if adapter is connected
	 */
	isConnected(): boolean;

	/**
	 * Subscribe to adapter events
	 */
	on<K extends keyof DataSourceAdapterEvents>(
		event: K,
		handler: (data: DataSourceAdapterEvents[K]) => void
	): Unsubscribe;
}

// =============================================================================
// Type Utilities
// =============================================================================

/**
 * Extract the client type from a DataSourceAdapter.
 * Used to infer TClient from the adapter type parameter.
 *
 * @example
 * ```typescript
 * type RedisClient = ClientOf<RedisAdapter>; // Redis
 * type PgClient = ClientOf<PostgresAdapter>; // Pool
 * type MongoClient = ClientOf<MongoAdapter>; // Db
 * ```
 */
export type ClientOf<A> = A extends DataSourceAdapter<infer TClient, unknown> ? TClient : unknown;

/**
 * Extract the config type from a DataSourceAdapter.
 */
export type ConfigOf<A> = A extends DataSourceAdapter<unknown, infer TConfig> ? TConfig : unknown;

// =============================================================================
// Component Options
// =============================================================================

/**
 * DataSource component options
 *
 * @typeParam A - Adapter type extending DataSourceAdapter
 */
export interface DataSourceOptions<A extends DataSourceAdapter<unknown, unknown>> {
	/** Adapter instance for the data store */
	adapter: A;
}

// =============================================================================
// Exec Options
// =============================================================================

/**
 * Options for exec() operation
 */
export interface ExecOptions {
	/** Timeout in milliseconds. Operation fails if exceeded. */
	timeout?: number;
}
