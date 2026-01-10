/**
 * Publisher Component Unit Tests
 *
 * Tests for the MQ Publisher component including lifecycle,
 * publishing, step builder, and type-safe operations.
 */

import { TestCaseBuilder } from "testurio";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DefaultTopics } from "../../packages/core/src/components/mq.base";
import { Publisher } from "../../packages/core/src/components/publisher";
import { createFakeMQAdapter, createInMemoryBroker, type InMemoryBroker } from "../mocks/fakeMQAdapter";

describe("Publisher", () => {
	let broker: InMemoryBroker;

	beforeEach(() => {
		broker = createInMemoryBroker();
	});

	afterEach(() => {
		broker.clear();
	});

	describe("lifecycle", () => {
		it("should start and create publisher adapter", async () => {
			const adapter = createFakeMQAdapter(broker);
			const publisher = new Publisher("test-pub", { adapter });

			expect(publisher.getState()).toBe("created");
			expect(publisher.isStarted()).toBe(false);

			await publisher.start();

			expect(publisher.getState()).toBe("started");
			expect(publisher.isStarted()).toBe(true);
		});

		it("should stop and close publisher adapter", async () => {
			const adapter = createFakeMQAdapter(broker);
			const publisher = new Publisher("test-pub", { adapter });
			await publisher.start();

			await publisher.stop();

			expect(publisher.getState()).toBe("stopped");
			expect(publisher.isStopped()).toBe(true);
		});

		it("should throw if started twice", async () => {
			const adapter = createFakeMQAdapter(broker);
			const publisher = new Publisher("test-pub", { adapter });
			await publisher.start();

			await expect(publisher.start()).rejects.toThrow();
		});

		it("should allow restart after stop", async () => {
			const adapter = createFakeMQAdapter(broker);
			const publisher = new Publisher("test-pub", { adapter });

			await publisher.start();
			await publisher.stop();
			await publisher.start();

			expect(publisher.isStarted()).toBe(true);
		});

		it("should handle adapter connection failure", async () => {
			const adapter = createFakeMQAdapter(broker, { failOnConnect: true });
			const publisher = new Publisher("test-pub", { adapter });

			await expect(publisher.start()).rejects.toThrow(/Connection failed/);
			expect(publisher.getState()).toBe("error");
		});
	});

	describe("publish", () => {
		it("should publish message to topic", async () => {
			const adapter = createFakeMQAdapter(broker);
			const publisher = new Publisher("test-pub", { adapter });
			await publisher.start();

			await publisher.publish("orders", { orderId: "123", status: "pending" });

			const messages = broker.getMessages("orders");
			expect(messages).toHaveLength(1);
			expect(messages[0].topic).toBe("orders");
			expect(messages[0].payload).toEqual({ orderId: "123", status: "pending" });
		});

		it("should publish with options (key, headers)", async () => {
			const adapter = createFakeMQAdapter(broker);
			const publisher = new Publisher("test-pub", { adapter });
			await publisher.start();

			await publisher.publish(
				"orders",
				{ orderId: "123" },
				{
					key: "customer-1",
					headers: { "correlation-id": "abc-123" },
				}
			);

			const messages = broker.getMessages("orders");
			expect(messages).toHaveLength(1);
			expect(messages[0].key).toBe("customer-1");
			expect(messages[0].headers).toEqual({ "correlation-id": "abc-123" });
		});

		it("should throw if publish called before start", async () => {
			const adapter = createFakeMQAdapter(broker);
			const publisher = new Publisher("test-pub", { adapter });

			await expect(publisher.publish("orders", { orderId: "123" })).rejects.toThrow(/not started/);
		});

		it("should handle publish failure", async () => {
			const adapter = createFakeMQAdapter(broker, { failOnPublish: true });
			const publisher = new Publisher("test-pub", { adapter });
			await publisher.start();

			await expect(publisher.publish("orders", { orderId: "123" })).rejects.toThrow(/Publish failed/);
		});
	});

	describe("publishBatch", () => {
		it("should publish multiple messages in batch", async () => {
			const adapter = createFakeMQAdapter(broker);
			const publisher = new Publisher("test-pub", { adapter });
			await publisher.start();

			await publisher.publishBatch("orders", [
				{ payload: { orderId: "1" } },
				{ payload: { orderId: "2" }, key: "customer-1" },
				{ payload: { orderId: "3" }, headers: { priority: "high" } },
			]);

			const messages = broker.getMessages("orders");
			expect(messages).toHaveLength(3);
			expect(messages[0].payload).toEqual({ orderId: "1" });
			expect(messages[1].key).toBe("customer-1");
			expect(messages[2].headers).toEqual({ priority: "high" });
		});

		it("should throw if publishBatch called before start", async () => {
			const adapter = createFakeMQAdapter(broker);
			const publisher = new Publisher("test-pub", { adapter });

			await expect(publisher.publishBatch("orders", [{ payload: {} }])).rejects.toThrow(/not started/);
		});
	});

	describe("Component interface compatibility", () => {
		it("should implement base component interface", () => {
			const adapter = createFakeMQAdapter(broker);
			const publisher = new Publisher("test-pub", { adapter });

			expect(publisher.name).toBe("test-pub");
			expect(typeof publisher.start).toBe("function");
			expect(typeof publisher.stop).toBe("function");
			expect(typeof publisher.getState).toBe("function");
			expect(typeof publisher.isStarted).toBe("function");
			expect(typeof publisher.isStopped).toBe("function");
			expect(typeof publisher.createStepBuilder).toBe("function");
			expect(typeof publisher.getUnhandledErrors).toBe("function");
			expect(typeof publisher.clearUnhandledErrors).toBe("function");
		});

		it("should track unhandled errors", async () => {
			const adapter = createFakeMQAdapter(broker);
			const publisher = new Publisher("test-pub", { adapter });

			expect(publisher.getUnhandledErrors()).toEqual([]);
		});
	});
});

describe("PublisherStepBuilder", () => {
	let broker: InMemoryBroker;
	let publisher: Publisher<DefaultTopics>;
	let builder: TestCaseBuilder;

	beforeEach(async () => {
		broker = createInMemoryBroker();
		const adapter = createFakeMQAdapter(broker);
		publisher = new Publisher("test-pub", { adapter });
		await publisher.start();
		builder = new TestCaseBuilder(new Map());
	});

	afterEach(async () => {
		await publisher.stop();
		broker.clear();
	});

	it("should register publish step", () => {
		const stepBuilder = publisher.createStepBuilder(builder);

		stepBuilder.publish("orders", { orderId: "123" });

		const steps = builder.getSteps();
		expect(steps).toHaveLength(1);
		expect(steps[0].type).toBe("custom");
		expect(steps[0].metadata?.operation).toBe("publish");
	});

	it("should register publishBatch step", () => {
		const stepBuilder = publisher.createStepBuilder(builder);

		stepBuilder.publishBatch("orders", [{ payload: { orderId: "1" } }, { payload: { orderId: "2" } }]);

		const steps = builder.getSteps();
		expect(steps).toHaveLength(1);
		expect(steps[0].type).toBe("custom");
		expect(steps[0].metadata?.operation).toBe("publishBatch");
	});

	it("should execute publish step and send message", async () => {
		const stepBuilder = publisher.createStepBuilder(builder);

		stepBuilder.publish("orders", { orderId: "123" });

		const steps = builder.getSteps();
		await steps[0].action();

		const messages = broker.getMessages("orders");
		expect(messages).toHaveLength(1);
		expect(messages[0].payload).toEqual({ orderId: "123" });
	});

	it("should execute publishBatch step and send messages", async () => {
		const stepBuilder = publisher.createStepBuilder(builder);

		stepBuilder.publishBatch("orders", [{ payload: { orderId: "1" } }, { payload: { orderId: "2" } }]);

		const steps = builder.getSteps();
		await steps[0].action();

		const messages = broker.getMessages("orders");
		expect(messages).toHaveLength(2);
	});

	it("should support publish with options", async () => {
		const stepBuilder = publisher.createStepBuilder(builder);

		stepBuilder.publish("orders", { orderId: "123" }, { key: "customer-1" });

		const steps = builder.getSteps();
		await steps[0].action();

		const messages = broker.getMessages("orders");
		expect(messages[0].key).toBe("customer-1");
	});
});

describe("Publisher Type Safety", () => {
	it("should accept any topic in loose mode", async () => {
		const broker = createInMemoryBroker();
		const adapter = createFakeMQAdapter(broker);
		const publisher = new Publisher("test-pub", { adapter });
		await publisher.start();

		// In loose mode, any topic string is valid
		await publisher.publish("any-topic", { any: "data" });
		await publisher.publish("another-topic", { different: "payload" });

		expect(broker.getMessages("any-topic")).toHaveLength(1);
		expect(broker.getMessages("another-topic")).toHaveLength(1);

		await publisher.stop();
	});

	it("should work with typed topics in strict mode", async () => {
		interface OrderTopics {
			"order-created": { orderId: string; customerId: string };
			"order-updated": { orderId: string; status: string };
		}

		const broker = createInMemoryBroker();
		const adapter = createFakeMQAdapter(broker);
		const publisher = new Publisher<OrderTopics>("test-pub", { adapter });
		await publisher.start();

		// Type-safe publish - only defined topics accepted
		await publisher.publish("order-created", { orderId: "ORD-1", customerId: "CUST-1" });
		await publisher.publish("order-updated", { orderId: "ORD-1", status: "shipped" });

		const created = broker.getMessages("order-created");
		const updated = broker.getMessages("order-updated");

		expect(created).toHaveLength(1);
		expect(created[0].payload).toEqual({ orderId: "ORD-1", customerId: "CUST-1" });
		expect(updated).toHaveLength(1);
		expect(updated[0].payload).toEqual({ orderId: "ORD-1", status: "shipped" });

		await publisher.stop();
	});
});
