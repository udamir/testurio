/**
 * ClickHouse Client Wrapper
 *
 * Thin helper surface exposed to `DataSource.exec` callbacks. Hides the raw
 * `ResultSet`-based API of `@clickhouse/client` for the common seed/assert
 * use cases. Use `raw()` for advanced needs (streaming, custom formats).
 */

import type { ClickHouseClient } from "@clickhouse/client";
import type { ClickHouseCommandParams, ClickHouseInsertParams, ClickHouseQueryParams } from "./clickhouse.types.js";

export class ClickHouseClientWrapper {
	constructor(private readonly client: ClickHouseClient) {}

	/**
	 * Execute a SELECT/SHOW query and return parsed rows.
	 * Defaults to "JSONEachRow" format; rows are drained from the `ResultSet`.
	 */
	async query<T>(params: ClickHouseQueryParams): Promise<T[]> {
		const rs = await this.client.query({
			query: params.query,
			format: params.format ?? "JSONEachRow",
			query_params: params.query_params,
			abort_signal: params.abort_signal,
			clickhouse_settings: params.clickhouse_settings,
		});
		return rs.json<T>();
	}

	/** Bulk insert into a table. Default format is "JSONEachRow". */
	async insert<T>(params: ClickHouseInsertParams<T>): Promise<void> {
		await this.client.insert<T>({
			table: params.table,
			values: params.values,
			format: params.format ?? "JSONEachRow",
			query_params: params.query_params,
			clickhouse_settings: params.clickhouse_settings,
		});
	}

	/** Execute DDL or any no-result statement. */
	async command(params: ClickHouseCommandParams): Promise<void> {
		await this.client.command({
			query: params.query,
			query_params: params.query_params,
			abort_signal: params.abort_signal,
			clickhouse_settings: params.clickhouse_settings,
		});
	}

	/** Health check. Returns true on success. */
	async ping(): Promise<boolean> {
		const result = await this.client.ping();
		return result.success;
	}

	/** Escape hatch: access the underlying @clickhouse/client instance. */
	raw(): ClickHouseClient {
		return this.client;
	}
}
