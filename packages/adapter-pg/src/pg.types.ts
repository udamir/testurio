/**
 * PostgreSQL Adapter Types
 *
 * Configuration and types for the PostgreSQL adapter.
 */

import type { PoolConfig } from "pg";

/**
 * PostgreSQL adapter configuration
 */
export interface PostgresAdapterConfig {
	/** PostgreSQL host (default: "localhost") */
	host?: string;
	/** PostgreSQL port (default: 5432) */
	port?: number;
	/** Database name */
	database?: string;
	/** Database user */
	user?: string;
	/** Database password */
	password?: string;
	/** Connection string (alternative to individual options) */
	connectionString?: string;
	/** Maximum number of clients in the pool (default: 10) */
	max?: number;
	/** Minimum number of idle clients (default: 0) */
	min?: number;
	/** Connection timeout in milliseconds (default: 30000) */
	connectionTimeoutMillis?: number;
	/** Idle timeout in milliseconds (default: 10000) */
	idleTimeoutMillis?: number;
	/** Enable SSL connection */
	ssl?: boolean | object;
	/** Statement timeout in milliseconds */
	statementTimeout?: number;
	/** Query timeout in milliseconds */
	queryTimeout?: number;
	/** Application name for connection identification */
	applicationName?: string;
	/** Additional pg pool options */
	options?: Partial<PoolConfig>;
}
