/**
 * Publisher Component Unit Tests
 *
 * Tests for the MQ Publisher component including lifecycle,
 * step execution, and step builder.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Step } from "../../packages/core/src/components/base/step.types";
import type { DefaultTopics } from "../../packages/core/src/components/mq.base";
import { Publisher } from "../../packages/core/src/components/publisher";
import {
	createFakeMQAdapter,
	createInMemoryBroker,
	type FakeBatchMessage,
	type FakePublishOptions,
	type InMemoryBroker,
} from "../mocks/fakeMQAdapter";

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

			await publisher.stop();
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

			await publisher.stop();
		});

		it("should allow restart after stop", async () => {
			const adapter = createFakeMQAdapter(broker);
			const publisher = new Publisher("test-pub", { adapter });

			await publisher.start();
			await publisher.stop();
			await publisher.start();

			expect(publisher.isStarted()).toBe(true);

			await publisher.stop();
		});

		it("should handle adapter connection failure", async () => {
			const adapter = createFakeMQAdapter(broker, { failOnConnect: true });
			const publisher = new Publisher("test-pub", { adapter });

			await expect(publisher.start()).rejects.toThrow(/Connection failed/);
			expect(publisher.getState()).toBe("error");
		});
	});

	describe("executeStep - publish", () => {
		it("should publish message to topic", async () => {
			const adapter = createFakeMQAdapter(broker);
			const publisher = new Publisher<DefaultTopics, FakePublishOptions, FakeBatchMessage>("test-pub", { adapter });
			await publisher.start();

			const step: Step = {
				id: "test-step-1",
				type: "publish",
				component: publisher,
				mode: "action",
				params: {
					topic: "orders",
					payload: { orderId: "123", status: "pending" },
				},
				handlers: [],
			};

			await publisher.executeStep(step);

			const messages = broker.getMessages("orders");
			expect(messages).toHaveLength(1);
			expect(messages[0].topic).toBe("orders");
			expect(messages[0].payload).toEqual({ orderId: "123", status: "pending" });

			await publisher.stop();
		});

		it("should publish with options (key, headers)", async () => {
			const adapter = createFakeMQAdapter(broker);
			const publisher = new Publisher<DefaultTopics, FakePublishOptions, FakeBatchMessage>("test-pub", { adapter });
			await publisher.start();

			const step: Step = {
				id: "test-step-2",
				type: "publish",
				component: publisher,
				mode: "action",
				params: {
					topic: "orders",
					payload: { orderId: "123" },
					options: {
						key: "customer-1",
						headers: { "correlation-id": "abc-123" },
					},
				},
				handlers: [],
			};

			await publisher.executeStep(step);

			const messages = broker.getMessages("orders");
			expect(messages).toHaveLength(1);
			expect(messages[0].key).toBe("customer-1");
			expect(messages[0].headers).toEqual({ "correlation-id": "abc-123" });

			await publisher.stop();
		});

		it("should throw if executeStep called before start", async () => {
			const adapter = createFakeMQAdapter(broker);
			const publisher = new Publisher<DefaultTopics, FakePublishOptions, FakeBatchMessage>("test-pub", { adapter });

			const step: Step = {
				id: "test-step-3",
				type: "publish",
				component: publisher,
				mode: "action",
				params: {
					topic: "orders",
					payload: { orderId: "123" },
				},
				handlers: [],
			};

			await expect(publisher.executeStep(step)).rejects.toThrow(/not started/);
		});

		it("should handle publish failure", async () => {
			const adapter = createFakeMQAdapter(broker, { failOnPublish: true });
			const publisher = new Publisher<DefaultTopics, FakePublishOptions, FakeBatchMessage>("test-pub", { adapter });
			await publisher.start();

			const step: Step = {
				id: "test-step-4",
				type: "publish",
				component: publisher,
				mode: "action",
				params: {
					topic: "orders",
					payload: { orderId: "123" },
				},
				handlers: [],
			};

			await expect(publisher.executeStep(step)).rejects.toThrow(/Publish failed/);

			await publisher.stop();
		});
	});

	describe("executeStep - publishBatch", () => {
		it("should publish multiple messages in batch", async () => {
			const adapter = createFakeMQAdapter(broker);
			const publisher = new Publisher<DefaultTopics, FakePublishOptions, FakeBatchMessage>("test-pub", { adapter });
			await publisher.start();

			const step: Step = {
				id: "test-step-5",
				type: "publishBatch",
				component: publisher,
				mode: "action",
				params: {
					topic: "orders",
					messages: [
						{ payload: { orderId: "1" } },
						{ payload: { orderId: "2" }, key: "customer-1" },
						{ payload: { orderId: "3" }, headers: { priority: "high" } },
					],
				},
				handlers: [],
			};

			await publisher.executeStep(step);

			const messages = broker.getMessages("orders");
			expect(messages).toHaveLength(3);
			expect(messages[0].payload).toEqual({ orderId: "1" });
			expect(messages[1].key).toBe("customer-1");
			expect(messages[2].headers).toEqual({ priority: "high" });

			await publisher.stop();
		});

		it("should throw if publishBatch called before start", async () => {
			const adapter = createFakeMQAdapter(broker);
			const publisher = new Publisher<DefaultTopics, FakePublishOptions, FakeBatchMessage>("test-pub", { adapter });

			const step: Step = {
				id: "test-step-6",
				type: "publishBatch",
				component: publisher,
				mode: "action",
				params: {
					topic: "orders",
					messages: [{ payload: {} }],
				},
				handlers: [],
			};

			await expect(publisher.executeStep(step)).rejects.toThrow(/not started/);
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

	describe("unknown step type", () => {
		it("should throw for unknown step type", async () => {
			const adapter = createFakeMQAdapter(broker);
			const publisher = new Publisher<DefaultTopics, FakePublishOptions, FakeBatchMessage>("test-pub", { adapter });
			await publisher.start();

			const step: Step = {
				id: "test-step-7",
				type: "unknownType",
				component: publisher,
				mode: "action",
				params: {},
				handlers: [],
			};

			await expect(publisher.executeStep(step)).rejects.toThrow(/Unknown step type/);

			await publisher.stop();
		});
	});
});

describe("Publisher Type Safety", () => {
	it("should accept any topic in loose mode", async () => {
		const broker = createInMemoryBroker();
		const adapter = createFakeMQAdapter(broker);
		const publisher = new Publisher<DefaultTopics, FakePublishOptions, FakeBatchMessage>("test-pub", { adapter });
		await publisher.start();

		// In loose mode, any topic string is valid
		const step1: Step = {
			id: "type-step-1",
			type: "publish",
			component: publisher,
			mode: "action",
			params: { topic: "any-topic", payload: { any: "data" } },
			handlers: [],
		};
		const step2: Step = {
			id: "type-step-2",
			type: "publish",
			component: publisher,
			mode: "action",
			params: { topic: "another-topic", payload: { different: "payload" } },
			handlers: [],
		};

		await publisher.executeStep(step1);
		await publisher.executeStep(step2);

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
		const publisher = new Publisher<OrderTopics, FakePublishOptions, FakeBatchMessage>("test-pub", { adapter });
		await publisher.start();

		// Type-safe publish - only defined topics accepted
		const step1: Step = {
			id: "type-step-3",
			type: "publish",
			component: publisher,
			mode: "action",
			params: { topic: "order-created", payload: { orderId: "ORD-1", customerId: "CUST-1" } },
			handlers: [],
		};
		const step2: Step = {
			id: "type-step-4",
			type: "publish",
			component: publisher,
			mode: "action",
			params: { topic: "order-updated", payload: { orderId: "ORD-1", status: "shipped" } },
			handlers: [],
		};

		await publisher.executeStep(step1);
		await publisher.executeStep(step2);

		const created = broker.getMessages("order-created");
		const updated = broker.getMessages("order-updated");

		expect(created).toHaveLength(1);
		expect(created[0].payload).toEqual({ orderId: "ORD-1", customerId: "CUST-1" });
		expect(updated).toHaveLength(1);
		expect(updated[0].payload).toEqual({ orderId: "ORD-1", status: "shipped" });

		await publisher.stop();
	});
});
