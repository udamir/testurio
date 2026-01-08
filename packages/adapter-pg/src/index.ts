/**
 * @testurio/adapter-pg
 *
 * PostgreSQL adapter for Testurio DataSource component.
 * Uses node-postgres (pg) for database connectivity.
 *
 * @example
 * ```typescript
 * import { DataSource } from "testurio";
 * import { PostgresAdapter } from "@testurio/adapter-pg";
 *
 * const db = new DataSource("postgres", {
 *   adapter: new PostgresAdapter({
 *     host: "localhost",
 *     port: 5432,
 *     database: "testdb",
 *     user: "postgres",
 *     password: "password",
 *   }),
 * });
 *
 * await db.start();
 *
 * // Direct execution
 * const users = await db.exec(async (pool) => {
 *   const result = await pool.query("SELECT * FROM users");
 *   return result.rows;
 * });
 *
 * // In test scenarios
 * const tc = testCase("verify user exists", (test) => {
 *   const postgres = test.use(db);
 *
 *   postgres
 *     .exec("query users table", async (pool) => {
 *       const result = await pool.query("SELECT * FROM users WHERE id = $1", [1]);
 *       return result.rows[0];
 *     })
 *     .assert("user should exist", (user) => user !== undefined);
 * });
 * ```
 */

// Re-export Pool type for convenience
export type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
export { createPostgresAdapter, PostgresAdapter } from "./pg.adapter.js";
export type { PostgresAdapterConfig } from "./pg.types.js";
