/**
 * Redis Adapter for Testurio
 *
 * Provides Redis connectivity for DataSource component.
 *
 * @example
 * ```typescript
 * import { DataSource, TestScenario, testCase } from "testurio";
 * import { RedisAdapter } from "@testurio/adapter-redis";
 *
 * const cache = new DataSource("cache", {
 *   adapter: new RedisAdapter({
 *     host: "localhost",
 *     port: 6379,
 *   }),
 * });
 *
 * const scenario = new TestScenario({
 *   name: "Redis Test",
 *   components: [cache],
 * });
 *
 * const tc = testCase("should cache data", (test) => {
 *   const redis = test.use(cache);
 *
 *   redis.exec("set value", async (client) => {
 *     await client.set("key", "value");
 *   });
 *
 *   redis.exec("get value", async (client) => {
 *     return client.get("key");
 *   }).assert("value should be cached", (val) => val === "value");
 * });
 *
 * await scenario.run(tc);
 * ```
 */

// Re-export Redis type from ioredis for convenience
export type { Redis } from "ioredis";
export { createRedisAdapter, RedisAdapter } from "./redis.adapter";
export type { RedisAdapterConfig } from "./redis.types";
