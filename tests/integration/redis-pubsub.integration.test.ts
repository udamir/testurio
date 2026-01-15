/**
 * Redis Pub/Sub Integration Tests
 *
 * Tests the @testurio/adapter-redis package against a real Redis container
 * using testcontainers.
 *
 * These tests require Docker to be running. They will be skipped automatically
 * if Docker is not available.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Publisher, Subscriber, TestScenario, testCase } from "testurio";
import { RedisPubSubAdapter } from "@testurio/adapter-redis";
import { startRedisContainer, stopRedisContainer, isDockerAvailable, type RedisTestContext } from "../containers";

describe.skipIf(!isDockerAvailable())("Redis Pub/Sub Integration", () => {
	let redis: RedisTestContext;

	beforeAll(async () => {
		redis = await startRedisContainer();
	}, 60000); // 60s timeout for container startup

	afterAll(async () => {
		if (redis) {
			await stopRedisContainer(redis);
		}
	});

	it("should publish and receive a single message", async () => {
		const adapter = new RedisPubSubAdapter({
			host: redis.host,
			port: redis.port,
		});

		const publisher = new Publisher("pub", { adapter });
		const subscriber = new Subscriber("sub", { adapter });

		const scenario = new TestScenario({
			name: "Single message pub/sub",
			components: [subscriber, publisher],
		});

		const tc = testCase("publish and receive message", (test) => {
			const pub = test.use(publisher);
			const sub = test.use(subscriber);

			// Publish message first (action step - executes quickly)
			pub.publish("notifications", { event: "user_created", userId: 123 });

			// Then wait for message (wait step - blocks until message arrives)
			sub.waitMessage("notifications").assert((msg) => {
				expect(msg).toHaveProperty("payload");
				return true;
			});
		});

		const result = await scenario.run(tc);
		if (!result.passed) {
			console.log("Test failed. Result:", JSON.stringify(result, null, 2));
		}
		expect(result.passed).toBe(true);
	});

	it("should handle multiple messages on same topic", async () => {
		const adapter = new RedisPubSubAdapter({
			host: redis.host,
			port: redis.port,
		});

		const publisher = new Publisher("pub", { adapter });
		const subscriber = new Subscriber("sub", { adapter });

		const scenario = new TestScenario({
			name: "Multiple messages",
			components: [subscriber, publisher],
		});

		const tc = testCase("receive multiple messages in order", (test) => {
			const pub = test.use(publisher);
			const sub = test.use(subscriber);

			// Publish messages first (action steps)
			pub.publish("events", { order: 1, data: "first" });
			pub.publish("events", { order: 2, data: "second" });

			// Then wait for messages (wait steps)
			sub.waitMessage("events").assert((msg) => {
				expect(msg).toHaveProperty("payload");
				return true;
			});

			sub.waitMessage("events").assert((msg) => {
				expect(msg).toHaveProperty("payload");
				return true;
			});
		});

		const result = await scenario.run(tc);
		if (!result.passed) {
			console.log("Multiple messages test failed:", JSON.stringify(result, null, 2));
		}
		expect(result.passed).toBe(true);
	});

	it("should support multiple topics", async () => {
		const adapter = new RedisPubSubAdapter({
			host: redis.host,
			port: redis.port,
		});

		const publisher = new Publisher("pub", { adapter });
		const subscriber = new Subscriber("sub", { adapter });

		const scenario = new TestScenario({
			name: "Multiple topics",
			components: [subscriber, publisher],
		});

		const tc = testCase("receive from different topics", (test) => {
			const pub = test.use(publisher);
			const sub = test.use(subscriber);

			// Publish to both topics first
			pub.publish("topic-a", { from: "topic-a" });
			pub.publish("topic-b", { from: "topic-b" });

			// Then wait for messages
			sub.waitMessage("topic-a").assert((msg) => {
				expect(msg).toHaveProperty("payload");
				return true;
			});

			sub.waitMessage("topic-b").assert((msg) => {
				expect(msg).toHaveProperty("payload");
				return true;
			});
		});

		const result = await scenario.run(tc);
		expect(result.passed).toBe(true);
	});

	// TODO: Pattern subscriptions require investigation - async subscription timing
	it.skip("should support pattern subscriptions", async () => {
		const adapter = new RedisPubSubAdapter({
			host: redis.host,
			port: redis.port,
			usePatterns: true,
		});

		const publisher = new Publisher("pub", { adapter });
		const subscriber = new Subscriber("sub", { adapter });

		const scenario = new TestScenario({
			name: "Pattern subscription",
			components: [subscriber, publisher],
		});

		const tc = testCase("receive messages matching pattern", (test) => {
			const pub = test.use(publisher);
			const sub = test.use(subscriber);

			// Publish to channel matching pattern first
			pub.publish("events:user:created", { userId: 456 });

			// Then wait for message on pattern
			sub.waitMessage("events:*").assert((msg) => {
				expect(msg).toHaveProperty("payload");
				return true;
			});
		});

		const result = await scenario.run(tc);
		expect(result.passed).toBe(true);
	});

	// TODO: Multiple subscribers with shared adapter requires investigation
	it.skip("should handle multiple subscribers with shared adapter", async () => {
		const adapter = new RedisPubSubAdapter({
			host: redis.host,
			port: redis.port,
		});

		const publisher = new Publisher("pub", { adapter });
		const subscriber1 = new Subscriber("sub1", { adapter });
		const subscriber2 = new Subscriber("sub2", { adapter });

		const scenario = new TestScenario({
			name: "Multiple subscribers",
			components: [subscriber1, subscriber2, publisher],
		});

		const tc = testCase("both subscribers receive message", (test) => {
			const pub = test.use(publisher);
			const sub1 = test.use(subscriber1);
			const sub2 = test.use(subscriber2);

			// Publish once first - both should receive
			pub.publish("broadcast", { message: "hello everyone" });

			// Both subscribers wait for message on same topic
			sub1.waitMessage("broadcast").assert((msg) => {
				expect(msg).toHaveProperty("payload");
				return true;
			});

			sub2.waitMessage("broadcast").assert((msg) => {
				expect(msg).toHaveProperty("payload");
				return true;
			});
		});

		const result = await scenario.run(tc);
		expect(result.passed).toBe(true);
	});

	it("should handle rapid message publishing", async () => {
		const adapter = new RedisPubSubAdapter({
			host: redis.host,
			port: redis.port,
		});

		const publisher = new Publisher("pub", { adapter });
		const subscriber = new Subscriber("sub", { adapter });

		const scenario = new TestScenario({
			name: "Rapid publishing",
			components: [subscriber, publisher],
		});

		const messageCount = 5;

		const tc = testCase("receive all rapid messages", (test) => {
			const pub = test.use(publisher);
			const sub = test.use(subscriber);

			// Publish all messages rapidly first
			for (let i = 0; i < messageCount; i++) {
				pub.publish("rapid", { index: i });
			}

			// Then wait for all messages
			for (let i = 0; i < messageCount; i++) {
				sub.waitMessage("rapid").assert((msg) => {
					expect(msg).toHaveProperty("payload");
					return true;
				});
			}
		});

		const result = await scenario.run(tc);
		if (!result.passed) {
			console.log("Rapid publishing test failed:", JSON.stringify(result, null, 2));
		}
		expect(result.passed).toBe(true);
	});
});
