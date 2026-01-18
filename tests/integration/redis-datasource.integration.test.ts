/**
 * Redis DataSource Integration Tests
 *
 * Tests the RedisAdapter (DataSource) against a real Redis container
 * using testcontainers.
 *
 * These tests require Docker to be running. They will be skipped automatically
 * if Docker is not available.
 */

import { RedisAdapter } from "@testurio/adapter-redis";
import { DataSource, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";
import { getRedisConfig, isRedisAvailable } from "../containers";

describe.skipIf(!isRedisAvailable())("Redis DataSource Integration", () => {
	describe("Connection Lifecycle", () => {
		it("should connect and disconnect via TestScenario lifecycle", async () => {
			const redis = getRedisConfig();
			const adapter = new RedisAdapter({
				host: redis.host,
				port: redis.port,
			});
			const cache = new DataSource("cache", { adapter });

			const scenario = new TestScenario({
				name: "Connection lifecycle test",
				components: [cache],
			});

			let wasConnected = false;

			const tc = testCase("verify connection", (test) => {
				test.use(cache).exec("check connection", async (client) => {
					wasConnected = true;
					const pong = await client.ping();
					expect(pong).toBe("PONG");
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(true);
			expect(wasConnected).toBe(true);
			expect(cache.isStopped()).toBe(true);
		});
	});

	describe("Basic Key-Value Operations", () => {
		it("should set and get a string value", async () => {
			const redis = getRedisConfig();
			const adapter = new RedisAdapter({
				host: redis.host,
				port: redis.port,
			});
			const cache = new DataSource("cache", { adapter });

			const scenario = new TestScenario({
				name: "String operations",
				components: [cache],
			});

			const tc = testCase("set and get string", (test) => {
				const store = test.use(cache);

				store.exec("set value", async (client) => {
					await client.set("greeting", "hello world");
				});

				store
					.exec("get value", async (client) => {
						return client.get("greeting");
					})
					.assert("value should match", (result) => result === "hello world");
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should set and get JSON objects", async () => {
			const redis = getRedisConfig();
			const adapter = new RedisAdapter({
				host: redis.host,
				port: redis.port,
			});
			const cache = new DataSource("cache", { adapter });

			const scenario = new TestScenario({
				name: "JSON operations",
				components: [cache],
			});

			const testUser = { id: 123, name: "John Doe", email: "john@example.com" };

			const tc = testCase("set and get JSON", (test) => {
				const store = test.use(cache);

				store.exec("store user", async (client) => {
					await client.set("user:123", JSON.stringify(testUser));
				});

				store
					.exec("retrieve user", async (client) => {
						const data = await client.get("user:123");
						return data ? JSON.parse(data) : null;
					})
					.assert("user should match", (result) => {
						const user = result as typeof testUser;
						return user.id === 123 && user.name === "John Doe";
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should delete keys", async () => {
			const redis = getRedisConfig();
			const adapter = new RedisAdapter({
				host: redis.host,
				port: redis.port,
			});
			const cache = new DataSource("cache", { adapter });

			const scenario = new TestScenario({
				name: "Delete operations",
				components: [cache],
			});

			const tc = testCase("delete key", (test) => {
				const store = test.use(cache);

				store.exec("set value", async (client) => {
					await client.set("temp-key", "temporary");
				});

				store
					.exec("verify exists", async (client) => {
						return client.exists("temp-key");
					})
					.assert("key should exist", (result) => result === 1);

				store.exec("delete key", async (client) => {
					await client.del("temp-key");
				});

				store
					.exec("verify deleted", async (client) => {
						return client.exists("temp-key");
					})
					.assert("key should not exist", (result) => result === 0);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should handle non-existent keys", async () => {
			const redis = getRedisConfig();
			const adapter = new RedisAdapter({
				host: redis.host,
				port: redis.port,
			});
			const cache = new DataSource("cache", { adapter });

			const scenario = new TestScenario({
				name: "Non-existent key",
				components: [cache],
			});

			const tc = testCase("get non-existent key", (test) => {
				test
					.use(cache)
					.exec(async (client) => {
						return client.get("this-key-does-not-exist");
					})
					.assert("should return null", (result) => result === null);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Expiration (TTL)", () => {
		it("should set key with expiration", async () => {
			const redis = getRedisConfig();
			const adapter = new RedisAdapter({
				host: redis.host,
				port: redis.port,
			});
			const cache = new DataSource("cache", { adapter });

			const scenario = new TestScenario({
				name: "TTL operations",
				components: [cache],
			});

			const tc = testCase("set with TTL", (test) => {
				const store = test.use(cache);

				store.exec("set with expiration", async (client) => {
					await client.setex("expiring-key", 10, "will expire");
				});

				store
					.exec("check TTL", async (client) => {
						return client.ttl("expiring-key");
					})
					.assert("TTL should be positive", (result) => {
						const ttl = result as number;
						return ttl > 0 && ttl <= 10;
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should set expiration on existing key", async () => {
			const redis = getRedisConfig();
			const adapter = new RedisAdapter({
				host: redis.host,
				port: redis.port,
			});
			const cache = new DataSource("cache", { adapter });

			const scenario = new TestScenario({
				name: "EXPIRE command",
				components: [cache],
			});

			const tc = testCase("expire existing key", (test) => {
				const store = test.use(cache);

				store.exec("set without expiration", async (client) => {
					await client.set("persistent-key", "value");
				});

				store
					.exec("verify no TTL", async (client) => {
						return client.ttl("persistent-key");
					})
					.assert("should have no TTL", (result) => result === -1);

				store.exec("add expiration", async (client) => {
					await client.expire("persistent-key", 60);
				});

				store
					.exec("verify TTL set", async (client) => {
						return client.ttl("persistent-key");
					})
					.assert("should have TTL", (result) => {
						const ttl = result as number;
						return ttl > 0 && ttl <= 60;
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Hash Operations", () => {
		it("should set and get hash fields", async () => {
			const redis = getRedisConfig();
			const adapter = new RedisAdapter({
				host: redis.host,
				port: redis.port,
			});
			const cache = new DataSource("cache", { adapter });

			const scenario = new TestScenario({
				name: "Hash operations",
				components: [cache],
			});

			const tc = testCase("hash field operations", (test) => {
				const store = test.use(cache);

				store.exec("set hash fields", async (client) => {
					await client.hset("user:456", {
						name: "Jane Doe",
						email: "jane@example.com",
						age: "28",
					});
				});

				store
					.exec("get single field", async (client) => {
						return client.hget("user:456", "name");
					})
					.assert("name should match", (result) => result === "Jane Doe");

				store
					.exec("get all fields", async (client) => {
						return client.hgetall("user:456");
					})
					.assert("all fields should match", (result) => {
						const hash = result as Record<string, string>;
						return hash.name === "Jane Doe" && hash.email === "jane@example.com";
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should increment hash field", async () => {
			const redis = getRedisConfig();
			const adapter = new RedisAdapter({
				host: redis.host,
				port: redis.port,
			});
			const cache = new DataSource("cache", { adapter });

			const scenario = new TestScenario({
				name: "Hash increment",
				components: [cache],
			});

			const tc = testCase("increment hash field", (test) => {
				const store = test.use(cache);

				store.exec("initialize counter", async (client) => {
					await client.hset("stats", "views", "100");
				});

				store
					.exec("increment counter", async (client) => {
						return client.hincrby("stats", "views", 5);
					})
					.assert("should return new value", (result) => result === 105);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("List Operations", () => {
		it("should push and pop from list", async () => {
			const redis = getRedisConfig();
			const adapter = new RedisAdapter({
				host: redis.host,
				port: redis.port,
			});
			const cache = new DataSource("cache", { adapter });

			const scenario = new TestScenario({
				name: "List operations",
				components: [cache],
			});

			const tc = testCase("list push and pop", (test) => {
				const store = test.use(cache);

				store.exec("push items", async (client) => {
					await client.rpush("queue", "item1", "item2", "item3");
				});

				store
					.exec("get list length", async (client) => {
						return client.llen("queue");
					})
					.assert("should have 3 items", (result) => result === 3);

				store
					.exec("pop from left", async (client) => {
						return client.lpop("queue");
					})
					.assert("should return first item", (result) => result === "item1");

				store
					.exec("get remaining", async (client) => {
						return client.lrange("queue", 0, -1);
					})
					.assert("should have 2 items", (result) => {
						const items = result as string[];
						return items.length === 2 && items[0] === "item2";
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Set Operations", () => {
		it("should add and check set members", async () => {
			const redis = getRedisConfig();
			const adapter = new RedisAdapter({
				host: redis.host,
				port: redis.port,
			});
			const cache = new DataSource("cache", { adapter });

			const scenario = new TestScenario({
				name: "Set operations",
				components: [cache],
			});

			const tc = testCase("set member operations", (test) => {
				const store = test.use(cache);

				store.exec("add members", async (client) => {
					await client.sadd("tags", "javascript", "typescript", "nodejs");
				});

				store
					.exec("check membership", async (client) => {
						return client.sismember("tags", "typescript");
					})
					.assert("should be member", (result) => result === 1);

				store
					.exec("get all members", async (client) => {
						return client.smembers("tags");
					})
					.assert("should have 3 members", (result) => {
						const members = result as string[];
						return members.length === 3 && members.includes("typescript");
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Sorted Set Operations", () => {
		it("should add and query sorted set", async () => {
			const redis = getRedisConfig();
			const adapter = new RedisAdapter({
				host: redis.host,
				port: redis.port,
			});
			const cache = new DataSource("cache", { adapter });

			const scenario = new TestScenario({
				name: "Sorted set operations",
				components: [cache],
			});

			const tc = testCase("sorted set operations", (test) => {
				const store = test.use(cache);

				store.exec("add scored items", async (client) => {
					await client.zadd("leaderboard", 100, "player1", 250, "player2", 175, "player3");
				});

				store
					.exec("get top players", async (client) => {
						return client.zrevrange("leaderboard", 0, 1, "WITHSCORES");
					})
					.assert("top player should be player2", (result) => {
						const items = result as string[];
						return items[0] === "player2" && items[1] === "250";
					});

				store
					.exec("get player rank", async (client) => {
						return client.zrevrank("leaderboard", "player3");
					})
					.assert("player3 should be rank 1 (0-indexed)", (result) => result === 1);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Atomic Operations", () => {
		it("should increment counter atomically", async () => {
			const redis = getRedisConfig();
			const adapter = new RedisAdapter({
				host: redis.host,
				port: redis.port,
			});
			const cache = new DataSource("cache", { adapter });

			const scenario = new TestScenario({
				name: "Atomic increment",
				components: [cache],
			});

			const tc = testCase("atomic increment", (test) => {
				const store = test.use(cache);

				store.exec("set initial value", async (client) => {
					await client.set("counter", "0");
				});

				store
					.exec("increment by 1", async (client) => {
						return client.incr("counter");
					})
					.assert("should return 1", (result) => result === 1);

				store
					.exec("increment by 5", async (client) => {
						return client.incrby("counter", 5);
					})
					.assert("should return 6", (result) => result === 6);
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should execute multi/exec transaction", async () => {
			const redis = getRedisConfig();
			const adapter = new RedisAdapter({
				host: redis.host,
				port: redis.port,
			});
			const cache = new DataSource("cache", { adapter });

			const scenario = new TestScenario({
				name: "Transaction",
				components: [cache],
			});

			const tc = testCase("multi/exec transaction", (test) => {
				test
					.use(cache)
					.exec("execute transaction", async (client) => {
						const results = await client
							.multi()
							.set("tx-key1", "value1")
							.set("tx-key2", "value2")
							.get("tx-key1")
							.exec();
						return results;
					})
					.assert("all commands should succeed", (result) => {
						const results = result as [Error | null, string][];
						return results.length === 3 && results[2][1] === "value1";
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Multiple DataSources", () => {
		it("should support multiple Redis databases", async () => {
			const redis = getRedisConfig();
			const adapter0 = new RedisAdapter({
				host: redis.host,
				port: redis.port,
				db: 0,
			});
			const adapter1 = new RedisAdapter({
				host: redis.host,
				port: redis.port,
				db: 1,
			});

			const cache = new DataSource("cache", { adapter: adapter0 });
			const session = new DataSource("session", { adapter: adapter1 });

			const scenario = new TestScenario({
				name: "Multiple databases",
				components: [cache, session],
			});

			const tc = testCase("isolated databases", (test) => {
				const cacheStore = test.use(cache);
				const sessionStore = test.use(session);

				// Set same key in both databases
				cacheStore.exec("set in cache db", async (client) => {
					await client.set("shared-key", "from-cache");
				});

				sessionStore.exec("set in session db", async (client) => {
					await client.set("shared-key", "from-session");
				});

				// Verify isolation
				cacheStore
					.exec("get from cache db", async (client) => {
						return client.get("shared-key");
					})
					.assert("should be cache value", (result) => result === "from-cache");

				sessionStore
					.exec("get from session db", async (client) => {
						return client.get("shared-key");
					})
					.assert("should be session value", (result) => result === "from-session");
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Error Handling", () => {
		it("should handle command errors gracefully", async () => {
			const redis = getRedisConfig();
			const adapter = new RedisAdapter({
				host: redis.host,
				port: redis.port,
			});
			const cache = new DataSource("cache", { adapter });

			const scenario = new TestScenario({
				name: "Error handling",
				components: [cache],
			});

			const tc = testCase("invalid command error", (test) => {
				test.use(cache).exec("execute invalid operation", async (client) => {
					// Try to get a hash field from a string key (type error)
					await client.set("string-key", "value");
					await client.hget("string-key", "field"); // This should throw
				});
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(false);
			expect(result.testCases[0].error).toMatch(/WRONGTYPE/i);
		});
	});

	describe("Assertions", () => {
		it("should fail test when assertion fails", async () => {
			const redis = getRedisConfig();
			const adapter = new RedisAdapter({
				host: redis.host,
				port: redis.port,
			});
			const cache = new DataSource("cache", { adapter });

			const scenario = new TestScenario({
				name: "Assertion failure",
				components: [cache],
			});

			const tc = testCase("failing assertion", (test) => {
				test
					.use(cache)
					.exec(async (client) => {
						return client.get("non-existent-key");
					})
					.assert("value should exist", (result) => result !== null);
			});

			const result = await scenario.run(tc);

			expect(result.passed).toBe(false);
			expect(result.testCases[0].error).toContain("Assertion failed");
			expect(result.testCases[0].error).toContain("value should exist");
		});

		it("should support multiple chained assertions", async () => {
			const redis = getRedisConfig();
			const adapter = new RedisAdapter({
				host: redis.host,
				port: redis.port,
			});
			const cache = new DataSource("cache", { adapter });

			const scenario = new TestScenario({
				name: "Chained assertions",
				components: [cache],
			});

			const tc = testCase("multiple assertions", (test) => {
				const store = test.use(cache);

				store.exec("set user data", async (client) => {
					await client.hset("user:789", { name: "Bob", role: "admin", active: "true" });
				});

				store
					.exec("get user data", async (client) => {
						return client.hgetall("user:789");
					})
					.assert("user should exist", (result) => result !== null)
					.assert("should have name", (result) => {
						const user = result as Record<string, string>;
						return user.name === "Bob";
					})
					.assert("should be admin", (result) => {
						const user = result as Record<string, string>;
						return user.role === "admin";
					});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});
});
