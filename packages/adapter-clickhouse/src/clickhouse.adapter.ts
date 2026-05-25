/**
 * ClickHouse Adapter
 *
 * DataSource adapter for ClickHouse using the official `@clickhouse/client`
 * (HTTP transport). Wraps the raw client in a `ClickHouseClientWrapper` for
 * ergonomic seed/assert flows; raw client access is available via
 * `getClickHouseClient()` and `wrapper.raw()`.
 */

import { type ClickHouseClient, createClient } from "@clickhouse/client";
import type { DataSourceAdapter, DataSourceAdapterEvents, Unsubscribe } from "testurio";
import type { ClickHouseAdapterConfig } from "./clickhouse.types.js";
import { ClickHouseClientWrapper } from "./clickhouse.wrapper.js";

/**
 * ClickHouse Adapter Implementation
 *
 * @example
 * ```typescript
 * const adapter = new ClickHouseAdapter({
 *   url: "http://localhost:8123",
 *   database: "testdb",
 * });
 *
 * const ds = new DataSource("clickhouse", { adapter });
 * await ds.start();
 *
 * await ds.exec(async (db) => {
 *   const rows = await db.query<{ c: string }>({
 *     query: "SELECT count() AS c FROM events",
 *   });
 *   return Number(rows[0].c);
 * });
 * ```
 */
export class ClickHouseAdapter implements DataSourceAdapter<ClickHouseClientWrapper, ClickHouseAdapterConfig> {
	readonly type = "clickhouse";
	readonly config: ClickHouseAdapterConfig;

	private client: ClickHouseClient | null = null;
	private wrapper: ClickHouseClientWrapper | null = null;
	private connected = false;
	private eventHandlers: Map<keyof DataSourceAdapterEvents, Set<(data: unknown) => void>> = new Map();

	constructor(config: ClickHouseAdapterConfig) {
		this.config = config;
	}

	/**
	 * Build ClickHouse HTTP URL from config.
	 * `url` takes precedence over `host`/`port`/`tls`.
	 */
	private buildUrl(): string {
		if (this.config.url) {
			return this.config.url;
		}
		const scheme = this.config.tls ? "https" : "http";
		const host = this.config.host ?? "localhost";
		const port = this.config.port ?? 8123;
		return `${scheme}://${host}:${port}`;
	}

	/**
	 * Initialize the adapter and verify connection via `/ping`.
	 */
	async init(): Promise<void> {
		if (this.client) {
			throw new Error("ClickHouseAdapter: already initialized");
		}

		this.client = createClient({
			url: this.buildUrl(),
			username: this.config.username ?? "default",
			password: this.config.password ?? "",
			database: this.config.database,
			request_timeout: this.config.requestTimeout,
			max_open_connections: this.config.maxOpenConnections ?? 10,
			compression: {
				request: this.config.compression?.request ?? false,
				response: this.config.compression?.response ?? true,
			},
			application: this.config.application,
			clickhouse_settings: this.config.clickhouseSettings,
			...this.config.options,
		});

		try {
			const result = await this.client.ping();
			if (!result.success) {
				throw result.error ?? new Error("ClickHouseAdapter: ping failed");
			}
			this.wrapper = new ClickHouseClientWrapper(this.client);
			this.connected = true;
			this.emit("connected", undefined);
		} catch (error) {
			await this.client.close().catch(() => {});
			this.client = null;
			this.wrapper = null;
			const err = error instanceof Error ? error : new Error(String(error));
			this.emit("error", err);
			throw err;
		}
	}

	/**
	 * Dispose of the adapter and close the connection.
	 */
	async dispose(): Promise<void> {
		if (!this.client) {
			return;
		}
		try {
			await this.client.close();
		} finally {
			this.client = null;
			this.wrapper = null;
			this.connected = false;
			this.emit("disconnected", undefined);
		}
	}

	/**
	 * Get the wrapper exposed to `DataSource.exec` callbacks.
	 */
	getClient(): ClickHouseClientWrapper {
		if (!this.wrapper || !this.connected) {
			throw new Error("ClickHouseAdapter: not connected. Call init() first.");
		}
		return this.wrapper;
	}

	/**
	 * Escape hatch: access the underlying `@clickhouse/client` instance.
	 */
	getClickHouseClient(): ClickHouseClient {
		if (!this.client || !this.connected) {
			throw new Error("ClickHouseAdapter: not connected. Call init() first.");
		}
		return this.client;
	}

	isConnected(): boolean {
		return this.connected;
	}

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
 * Factory function to create a ClickHouse adapter.
 */
export function createClickHouseAdapter(config: ClickHouseAdapterConfig): ClickHouseAdapter {
	return new ClickHouseAdapter(config);
}
