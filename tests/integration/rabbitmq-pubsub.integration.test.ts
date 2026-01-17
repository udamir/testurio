/**
 * RabbitMQ Pub/Sub Integration Tests
 *
 * Tests the @testurio/adapter-rabbitmq package against a real RabbitMQ container
 * using the global container setup pattern.
 *
 * These tests require Docker to be running. They will be skipped automatically
 * if Docker is not available.
 */

import { RabbitMQAdapter } from "@testurio/adapter-rabbitmq";
import { Publisher, Subscriber, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";
import { getRabbitMQConfig, isRabbitMQAvailable } from "../containers";

describe.skipIf(!isRabbitMQAvailable())("RabbitMQ Pub/Sub Integration", () => {
	describe("Basic Pub/Sub", () => {
		it("should publish and receive a single message", async () => {
			const rabbitmq = getRabbitMQConfig();
			const adapter = new RabbitMQAdapter({
				url: rabbitmq.amqpUrl,
				exchange: "test-exchange-single",
				exchangeType: "topic",
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
			expect(result.passed).toBe(true);
		});

		it("should handle multiple messages on same routing key", async () => {
			const rabbitmq = getRabbitMQConfig();
			const adapter = new RabbitMQAdapter({
				url: rabbitmq.amqpUrl,
				exchange: "test-exchange-multi",
				exchangeType: "topic",
			});

			const publisher = new Publisher("pub", { adapter });
			const subscriber = new Subscriber("sub", { adapter });

			const scenario = new TestScenario({
				name: "Multiple messages",
				components: [subscriber, publisher],
			});

			const tc = testCase("receive multiple messages", (test) => {
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
			expect(result.passed).toBe(true);
		});
	});

	describe("Exchange Types", () => {
		it("should work with topic exchange and # wildcard", async () => {
			const rabbitmq = getRabbitMQConfig();
			const adapter = new RabbitMQAdapter({
				url: rabbitmq.amqpUrl,
				exchange: "topic-exchange-hash",
				exchangeType: "topic",
			});

			const publisher = new Publisher("pub", { adapter });
			const subscriber = new Subscriber("sub", { adapter });

			const scenario = new TestScenario({
				name: "Topic exchange with # wildcard",
				components: [subscriber, publisher],
			});

			const tc = testCase("receive messages matching routing pattern", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);

				// Publish to specific routing key
				pub.publish("events.user.created", { userId: 456 });

				// Subscribe to pattern (# matches zero or more words)
				sub.waitMessage("events.#").assert((msg) => {
					expect(msg).toHaveProperty("payload");
					return true;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should work with topic exchange using * wildcard", async () => {
			const rabbitmq = getRabbitMQConfig();
			const adapter = new RabbitMQAdapter({
				url: rabbitmq.amqpUrl,
				exchange: "topic-exchange-star",
				exchangeType: "topic",
			});

			const publisher = new Publisher("pub", { adapter });
			const subscriber = new Subscriber("sub", { adapter });

			const scenario = new TestScenario({
				name: "Topic exchange with * wildcard",
				components: [subscriber, publisher],
			});

			const tc = testCase("receive messages matching single-word pattern", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);

				// Publish to specific routing key
				pub.publish("order.created", { orderId: 789 });

				// Subscribe to pattern (* matches exactly one word)
				sub.waitMessage("order.*").assert((msg) => {
					expect(msg).toHaveProperty("payload");
					return true;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should work with direct exchange", async () => {
			const rabbitmq = getRabbitMQConfig();
			const adapter = new RabbitMQAdapter({
				url: rabbitmq.amqpUrl,
				exchange: "direct-exchange",
				exchangeType: "direct",
			});

			const publisher = new Publisher("pub", { adapter });
			const subscriber = new Subscriber("sub", { adapter });

			const scenario = new TestScenario({
				name: "Direct exchange",
				components: [subscriber, publisher],
			});

			const tc = testCase("receive message with exact routing key", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);

				pub.publish("user-events", { type: "login" });

				sub.waitMessage("user-events").assert((msg) => {
					expect(msg).toHaveProperty("payload");
					return true;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});

		it("should work with fanout exchange", async () => {
			const rabbitmq = getRabbitMQConfig();
			const adapter = new RabbitMQAdapter({
				url: rabbitmq.amqpUrl,
				exchange: "fanout-exchange",
				exchangeType: "fanout",
			});

			const publisher = new Publisher("pub", { adapter });
			const subscriber1 = new Subscriber("sub1", { adapter });
			const subscriber2 = new Subscriber("sub2", { adapter });

			const scenario = new TestScenario({
				name: "Fanout exchange",
				components: [subscriber1, subscriber2, publisher],
			});

			const tc = testCase("all subscribers receive broadcast message", (test) => {
				const pub = test.use(publisher);
				const sub1 = test.use(subscriber1);
				const sub2 = test.use(subscriber2);

				// Routing key is ignored in fanout - just publish to any key
				pub.publish("broadcast", { message: "hello everyone" });

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
	});

	describe("Multiple Topics/Routing Keys", () => {
		it("should support multiple routing keys", async () => {
			const rabbitmq = getRabbitMQConfig();
			const adapter = new RabbitMQAdapter({
				url: rabbitmq.amqpUrl,
				exchange: "multi-key-exchange",
				exchangeType: "topic",
			});

			const publisher = new Publisher("pub", { adapter });
			const subscriber = new Subscriber("sub", { adapter });

			const scenario = new TestScenario({
				name: "Multiple routing keys",
				components: [subscriber, publisher],
			});

			const tc = testCase("receive from different routing keys", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);

				pub.publish("orders.created", { from: "orders.created" });
				pub.publish("orders.updated", { from: "orders.updated" });

				sub.waitMessage("orders.created").assert((msg) => {
					expect(msg).toHaveProperty("payload");
					return true;
				});

				sub.waitMessage("orders.updated").assert((msg) => {
					expect(msg).toHaveProperty("payload");
					return true;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Message Acknowledgment", () => {
		it("should work with auto-ack enabled (default)", async () => {
			const rabbitmq = getRabbitMQConfig();
			const adapter = new RabbitMQAdapter({
				url: rabbitmq.amqpUrl,
				exchange: "auto-ack-exchange",
				exchangeType: "topic",
				autoAck: true,
			});

			const publisher = new Publisher("pub", { adapter });
			const subscriber = new Subscriber("sub", { adapter });

			const scenario = new TestScenario({
				name: "Auto-ack mode",
				components: [subscriber, publisher],
			});

			const tc = testCase("message auto-acknowledged", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);

				pub.publish("tasks", { taskId: 1 });

				sub.waitMessage("tasks").assert((msg) => {
					expect(msg).toHaveProperty("payload");
					return true;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});

	describe("Rapid Publishing", () => {
		it("should handle rapid message publishing", async () => {
			const rabbitmq = getRabbitMQConfig();
			const adapter = new RabbitMQAdapter({
				url: rabbitmq.amqpUrl,
				exchange: "rapid-exchange",
				exchangeType: "topic",
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
			expect(result.passed).toBe(true);
		});
	});

	describe("Message Metadata", () => {
		it("should include RabbitMQ-specific metadata", async () => {
			const rabbitmq = getRabbitMQConfig();
			const adapter = new RabbitMQAdapter({
				url: rabbitmq.amqpUrl,
				exchange: "metadata-exchange",
				exchangeType: "topic",
			});

			const publisher = new Publisher("pub", { adapter });
			const subscriber = new Subscriber("sub", { adapter });

			const scenario = new TestScenario({
				name: "Message metadata",
				components: [subscriber, publisher],
			});

			const tc = testCase("receive message with metadata", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);

				pub.publish("metadata-test", { data: "test" });

				sub.waitMessage("metadata-test").assert((msg) => {
					expect(msg).toHaveProperty("metadata");
					// RabbitMQ-specific metadata fields
					expect(msg.metadata).toHaveProperty("routingKey");
					expect(msg.metadata).toHaveProperty("exchange");
					expect(msg.metadata).toHaveProperty("consumerTag");
					return true;
				});
			});

			const result = await scenario.run(tc);
			expect(result.passed).toBe(true);
		});
	});
});
