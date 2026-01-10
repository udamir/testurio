/**
 * Redis Adapter Types
 *
 * Configuration and types for the Redis adapter.
 */

import type { RedisOptions } from "ioredis";

/**
 * Redis adapter configuration
 */
export interface RedisAdapterConfig {
	/** Redis host (default: "localhost") */
	host?: string;

	/** Redis port (default: 6379) */
	port?: number;

	/** Redis password */
	password?: string;

	/** Database number (default: 0) */
	db?: number;

	/** Connection name for identification */
	name?: string;

	/** Enable TLS */
	tls?: boolean;

	/** Connection timeout in milliseconds */
	connectTimeout?: number;

	/** Command timeout in milliseconds */
	commandTimeout?: number;

	/** Maximum number of retries per request */
	maxRetriesPerRequest?: number;

	/** Additional ioredis options */
	options?: Partial<RedisOptions>;
}
