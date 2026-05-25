/**
 * @testurio/adapter-clickhouse
 *
 * ClickHouse adapter for Testurio DataSource component.
 * Uses the official `@clickhouse/client` HTTP transport.
 *
 * @example
 * ```typescript
 * import { DataSource, TestScenario, testCase } from "testurio";
 * import { ClickHouseAdapter } from "@testurio/adapter-clickhouse";
 *
 * const ch = new DataSource("clickhouse", {
 *   adapter: new ClickHouseAdapter({
 *     url: "http://localhost:8123",
 *     database: "default",
 *   }),
 * });
 *
 * const tc = testCase("count events", (test) => {
 *   const store = test.use(ch);
 *
 *   store.exec("ddl", async (db) => {
 *     await db.command({
 *       query: "CREATE TABLE events (id UInt32, name String) ENGINE = MergeTree() ORDER BY id",
 *     });
 *   });
 *
 *   store
 *     .exec("count", async (db) => {
 *       const rows = await db.query<{ count: string }>({
 *         query: "SELECT count() AS count FROM events",
 *       });
 *       return Number(rows[0].count);
 *     })
 *     .assert("two events", (n) => n === 2);
 * });
 * ```
 */

// Re-export common @clickhouse/client types for convenience
export type { ClickHouseClient, ResultSet, Row } from "@clickhouse/client";
export { ClickHouseAdapter, createClickHouseAdapter } from "./clickhouse.adapter.js";
export type {
	ClickHouseAdapterConfig,
	ClickHouseCommandParams,
	ClickHouseInsertParams,
	ClickHouseQueryParams,
	QueryRowsFormat,
} from "./clickhouse.types.js";
export { ClickHouseClientWrapper } from "./clickhouse.wrapper.js";
