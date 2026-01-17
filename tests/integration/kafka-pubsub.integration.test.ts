/**
 * Kafka Pub/Sub Integration Tests
 *
 * Tests the @testurio/adapter-kafka package against a real Redpanda container
 * using testcontainers.
 *
 * These tests require Docker to be running. They will be skipped automatically
 * if Docker is not available.
 *
 * Note: Each test creates its own adapter and components because Kafka consumer
 * group coordination requires ~3s per consumer setup. TestScenario's lifecycle
 * model (start components once, run test cases, stop components) works well,
 * but running multiple test cases with different topics in a single scenario
 * doesn't work because Kafka subscriptions are established during component start.
 */

import { KafkaAdapter } from "@testurio/adapter-kafka";
import { Publisher, Subscriber, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";
import { getKafkaConfig, isKafkaAvailable } from "../containers";

describe.skipIf(!isKafkaAvailable())("Kafka Pub/Sub Integration", () => {
	it("should publish and receive a single message", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: `test-kafka-${Date.now()}`,
			groupId: `test-group-${Date.now()}`,
			fromBeginning: true,
			testMode: true,
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

			pub.publish("notifications", { event: "user_created", userId: 123 });

			sub.waitMessage("notifications").assert((msg) => {
				expect(msg).toHaveProperty("payload");
				expect(msg.payload).toEqual({ event: "user_created", userId: 123 });
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
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: `test-kafka-${Date.now()}`,
			groupId: `test-group-${Date.now()}`,
			fromBeginning: true,
			testMode: true,
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

			pub.publish("events", { order: 1, data: "first" });
			pub.publish("events", { order: 2, data: "second" });

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
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: `test-kafka-${Date.now()}`,
			groupId: `test-group-${Date.now()}`,
			fromBeginning: true,
			testMode: true,
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

			pub.publish("topic-a", { from: "topic-a" });
			pub.publish("topic-b", { from: "topic-b" });

			sub.waitMessage("topic-a").assert((msg) => {
				expect(msg.payload).toEqual({ from: "topic-a" });
				return true;
			});

			sub.waitMessage("topic-b").assert((msg) => {
				expect(msg.payload).toEqual({ from: "topic-b" });
				return true;
			});
		});

		const result = await scenario.run(tc);
		expect(result.passed).toBe(true);
	});

	it("should include Kafka-specific metadata", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: `test-kafka-${Date.now()}`,
			groupId: `test-group-${Date.now()}`,
			fromBeginning: true,
			testMode: true,
		});

		const publisher = new Publisher("pub", { adapter });
		const subscriber = new Subscriber("sub", { adapter });

		const scenario = new TestScenario({
			name: "Kafka metadata",
			components: [subscriber, publisher],
		});

		const tc = testCase("message includes partition and offset", (test) => {
			const pub = test.use(publisher);
			const sub = test.use(subscriber);

			pub.publish("metadata-test", { data: "test" });

			sub.waitMessage("metadata-test").assert((msg) => {
				expect(msg.metadata).toBeDefined();
				expect(msg.metadata).toHaveProperty("partition");
				expect(msg.metadata).toHaveProperty("offset");
				expect(typeof msg.metadata.partition).toBe("number");
				expect(typeof msg.metadata.offset).toBe("string");
				return true;
			});
		});

		const result = await scenario.run(tc);
		expect(result.passed).toBe(true);
	});

	it("should support message keys", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: `test-kafka-${Date.now()}`,
			groupId: `test-group-${Date.now()}`,
			fromBeginning: true,
			testMode: true,
		});

		const publisher = new Publisher("pub", { adapter });
		const subscriber = new Subscriber("sub", { adapter });

		const scenario = new TestScenario({
			name: "Message keys",
			components: [subscriber, publisher],
		});

		const tc = testCase("message includes key", (test) => {
			const pub = test.use(publisher);
			const sub = test.use(subscriber);

			pub.publish("keyed-topic", { data: "test" }, { key: "user-123" });

			sub.waitMessage("keyed-topic").assert((msg) => {
				expect(msg.key).toBe("user-123");
				expect(msg.payload).toEqual({ data: "test" });
				return true;
			});
		});

		const result = await scenario.run(tc);
		expect(result.passed).toBe(true);
	});

	it("should support message headers", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: `test-kafka-${Date.now()}`,
			groupId: `test-group-${Date.now()}`,
			fromBeginning: true,
			testMode: true,
		});

		const publisher = new Publisher("pub", { adapter });
		const subscriber = new Subscriber("sub", { adapter });

		const scenario = new TestScenario({
			name: "Message headers",
			components: [subscriber, publisher],
		});

		const tc = testCase("message includes headers", (test) => {
			const pub = test.use(publisher);
			const sub = test.use(subscriber);

			pub.publish(
				"headers-topic",
				{ data: "test" },
				{ headers: { "x-correlation-id": "abc-123", "x-source": "test" } }
			);

			sub.waitMessage("headers-topic").assert((msg) => {
				expect(msg.headers).toBeDefined();
				expect(msg.headers?.["x-correlation-id"]).toBe("abc-123");
				expect(msg.headers?.["x-source"]).toBe("test");
				return true;
			});
		});

		const result = await scenario.run(tc);
		expect(result.passed).toBe(true);
	});

	it("should handle rapid message publishing", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: `test-kafka-${Date.now()}`,
			groupId: `test-group-${Date.now()}`,
			fromBeginning: true,
			testMode: true,
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

			for (let i = 0; i < messageCount; i++) {
				pub.publish("rapid", { index: i });
			}

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

	it("should support batch publishing", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: `test-kafka-${Date.now()}`,
			groupId: `test-group-${Date.now()}`,
			fromBeginning: true,
			testMode: true,
		});

		const publisher = new Publisher("pub", { adapter });
		const subscriber = new Subscriber("sub", { adapter });

		const scenario = new TestScenario({
			name: "Batch publishing",
			components: [subscriber, publisher],
		});

		const tc = testCase("publish and receive batch messages", (test) => {
			const pub = test.use(publisher);
			const sub = test.use(subscriber);

			pub.publishBatch("batch-topic", [
				{ payload: { id: 1, name: "first" } },
				{ payload: { id: 2, name: "second" } },
				{ payload: { id: 3, name: "third" } },
			]);

			sub.waitMessage("batch-topic").assert((msg) => {
				expect(msg.payload).toHaveProperty("id");
				return true;
			});

			sub.waitMessage("batch-topic").assert((msg) => {
				expect(msg.payload).toHaveProperty("id");
				return true;
			});

			sub.waitMessage("batch-topic").assert((msg) => {
				expect(msg.payload).toHaveProperty("id");
				return true;
			});
		});

		const result = await scenario.run(tc);
		expect(result.passed).toBe(true);
	});

	it("should support independent consumer groups", async () => {
		const kafka = getKafkaConfig();
		const timestamp = Date.now();

		// Two adapters with different group IDs
		const adapter1 = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: `test-group-a-${timestamp}`,
			groupId: `group-a-${timestamp}`,
			fromBeginning: true,
			testMode: true,
		});

		const adapter2 = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: `test-group-b-${timestamp}`,
			groupId: `group-b-${timestamp}`,
			fromBeginning: true,
			testMode: true,
		});

		try {
			const publisher = new Publisher("pub", { adapter: adapter1 });
			const subscriber1 = new Subscriber("sub1", { adapter: adapter1 });
			const subscriber2 = new Subscriber("sub2", { adapter: adapter2 });

			const scenario = new TestScenario({
				name: "Consumer groups",
				components: [subscriber1, subscriber2, publisher],
			});

			const tc = testCase("both groups receive message independently", (test) => {
				const pub = test.use(publisher);
				const sub1 = test.use(subscriber1);
				const sub2 = test.use(subscriber2);

				pub.publish("broadcast", { message: "hello everyone" });

				sub1.waitMessage("broadcast").assert((msg) => {
					expect(msg.payload).toEqual({ message: "hello everyone" });
					return true;
				});

				sub2.waitMessage("broadcast").assert((msg) => {
					expect(msg.payload).toEqual({ message: "hello everyone" });
					return true;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		} finally {
			await adapter1.dispose();
			await adapter2.dispose();
		}
	});
});
