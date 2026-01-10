/**
 * Redis Adapter for Testurio
 *
 * Provides Redis connectivity for:
 * - DataSource component (key-value operations)
 * - Publisher/Subscriber components (Pub/Sub messaging)
 *
 * @example DataSource usage
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
 *
 * @example Pub/Sub usage
 * ```typescript
 * import { Publisher, Subscriber } from "testurio";
 * import { RedisPubSubAdapter } from "@testurio/adapter-redis";
 *
 * const adapter = new RedisPubSubAdapter({
 *   host: "localhost",
 *   port: 6379,
 * });
 *
 * const publisher = new Publisher("pub", { adapter });
 * const subscriber = new Subscriber("sub", { adapter, topics: ["notifications"] });
 *
 * await publisher.publish("notifications", { type: "alert", message: "Hello!" });
 * ```
 */

// DataSource adapter
export * from "./redis.adapter";
export * from "./redis.types";
