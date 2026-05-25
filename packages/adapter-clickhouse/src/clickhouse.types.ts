/**
 * ClickHouse Adapter Types
 *
 * Configuration and helper parameter types for the ClickHouse adapter.
 */

import type { Readable } from "node:stream";
import type {
	ClickHouseClientConfigOptions,
	ClickHouseSettings,
	DataFormat,
	InsertValues,
	StreamableJSONDataFormat,
} from "@clickhouse/client";

/**
 * Streamable JSON formats whose `ResultSet.json<T>()` resolves to `T[]`.
 * Excludes `JSONEachRowWithProgress` which interleaves progress rows.
 */
export type QueryRowsFormat = Exclude<StreamableJSONDataFormat, "JSONEachRowWithProgress">;

/**
 * ClickHouse adapter configuration
 */
export interface ClickHouseAdapterConfig {
	/** Full URL (e.g., "http://localhost:8123"). Takes precedence over host/port. */
	url?: string;
	/** Host (default: "localhost") — used if `url` is not provided. */
	host?: string;
	/** HTTP port (default: 8123) — used if `url` is not provided. */
	port?: number;
	/** Use https:// when building URL from host/port. */
	tls?: boolean;
	/** Username (default: "default"). */
	username?: string;
	/** Password (default: ""). */
	password?: string;
	/** Default database. */
	database?: string;
	/** Per-request timeout in ms. */
	requestTimeout?: number;
	/** Connection pool size (default: 10). */
	maxOpenConnections?: number;
	/** Compression settings (default: { request: false, response: true }). */
	compression?: { request?: boolean; response?: boolean };
	/** Application name for query log identification. */
	application?: string;
	/** ClickHouse session-level settings passed verbatim. */
	clickhouseSettings?: ClickHouseSettings;
	/** Additional @clickhouse/client config passed through (merged last). */
	options?: Partial<ClickHouseClientConfigOptions>;
}

/**
 * Parameters for `ClickHouseClientWrapper.query<T>`.
 *
 * Defaults to `"JSONEachRow"` so the wrapper can return `T[]` for the common case.
 * For non-JSON formats (CSV, JSON, Parquet, etc.), use `wrapper.raw()` to access
 * the underlying `ClickHouseClient` directly.
 */
export interface ClickHouseQueryParams {
	query: string;
	/** Defaults to "JSONEachRow" — wrapper parses rows accordingly. */
	format?: QueryRowsFormat;
	query_params?: Record<string, unknown>;
	abort_signal?: AbortSignal;
	clickhouse_settings?: ClickHouseSettings;
}

/**
 * Parameters for `ClickHouseClientWrapper.insert<T>`.
 */
export interface ClickHouseInsertParams<T> {
	table: string;
	values: InsertValues<Readable, T>;
	format?: DataFormat;
	query_params?: Record<string, unknown>;
	clickhouse_settings?: ClickHouseSettings;
}

/**
 * Parameters for `ClickHouseClientWrapper.command`.
 */
export interface ClickHouseCommandParams {
	query: string;
	query_params?: Record<string, unknown>;
	abort_signal?: AbortSignal;
	clickhouse_settings?: ClickHouseSettings;
}
