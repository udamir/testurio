/**
 * Subscriber Component Unit Tests
 *
 * Tests for the MQ Subscriber component including lifecycle,
 * message receiving, waitForMessage, hooks, and step builder.
 */

import { TestCaseBuilder } from "testurio";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DefaultTopics } from "../../packages/core/src/components/mq.base";
import { Subscriber } from "../../packages/core/src/components/subscriber";
import { createFakeMQAdapter, createInMemoryBroker, type InMemoryBroker } from "../mocks/fakeMQAdapter";

describe("Subscriber", () => {
	let broker: InMemoryBroker;

	beforeEach(() => {
		broker = createInMemoryBroker();
	});

	afterEach(() => {
		broker.clear();
	});

	describe("lifecycle", () => {
		it("should start and create subscriber adapter", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber("test-sub", {
				adapter,
				topics: ["orders"],
			});

			expect(subscriber.getState()).toBe("created");
			expect(subscriber.isStarted()).toBe(false);

			await subscriber.start();

			expect(subscriber.getState()).toBe("started");
			expect(subscriber.isStarted()).toBe(true);
		});

		it("should stop and close subscriber adapter", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber("test-sub", {
				adapter,
				topics: ["orders"],
			});
			await subscriber.start();

			await subscriber.stop();

			expect(subscriber.getState()).toBe("stopped");
			expect(subscriber.isStopped()).toBe(true);
		});

		it("should throw if started twice", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber("test-sub", {
				adapter,
				topics: ["orders"],
			});
			await subscriber.start();

			await expect(subscriber.start()).rejects.toThrow();
		});

		it("should allow restart after stop", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber("test-sub", {
				adapter,
				topics: ["orders"],
			});

			await subscriber.start();
			await subscriber.stop();
			await subscriber.start();

			expect(subscriber.isStarted()).toBe(true);
		});

		it("should handle adapter connection failure", async () => {
			const adapter = createFakeMQAdapter(broker, { failOnConnect: true });
			const subscriber = new Subscriber("test-sub", {
				adapter,
				topics: ["orders"],
			});

			await expect(subscriber.start()).rejects.toThrow(/Connection failed/);
			expect(subscriber.getState()).toBe("error");
		});

		it("should reject pending waiters on stop", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber("test-sub", {
				adapter,
				topics: ["orders"],
			});
			await subscriber.start();

			const waitPromise = subscriber.waitForMessage("orders", undefined, 10000);

			// Stop should reject the waiter
			await subscriber.stop();

			await expect(waitPromise).rejects.toThrow(/stopped while waiting/);
		});
	});

	describe("waitForMessage", () => {
		it("should receive message on subscribed topic", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber("test-sub", {
				adapter,
				topics: ["orders"],
			});
			await subscriber.start();

			// Publish after small delay
			setTimeout(() => {
				broker.publish("orders", {
					topic: "orders",
					payload: { orderId: "123" },
					timestamp: Date.now(),
				});
			}, 10);

			const msg = await subscriber.waitForMessage("orders");

			expect(msg.topic).toBe("orders");
			expect(msg.payload).toEqual({ orderId: "123" });

			await subscriber.stop();
		});

		it("should match message with custom matcher", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber("test-sub", {
				adapter,
				topics: ["orders"],
			});
			await subscriber.start();

			// Publish multiple messages
			setTimeout(() => {
				broker.publish("orders", {
					topic: "orders",
					payload: { orderId: "1", status: "pending" },
					timestamp: Date.now(),
				});
				broker.publish("orders", {
					topic: "orders",
					payload: { orderId: "2", status: "shipped" },
					timestamp: Date.now(),
				});
			}, 10);

			const msg = await subscriber.waitForMessage(
				"orders",
				(m) => (m.payload as { status: string }).status === "shipped"
			);

			expect(msg.payload).toEqual({ orderId: "2", status: "shipped" });

			await subscriber.stop();
		});

		it("should wait for message on multiple topics", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber("test-sub", {
				adapter,
				topics: ["orders", "events"],
			});
			await subscriber.start();

			setTimeout(() => {
				broker.publish("events", {
					topic: "events",
					payload: { type: "user-created" },
					timestamp: Date.now(),
				});
			}, 10);

			const msg = await subscriber.waitForMessage(["orders", "events"]);

			expect(msg.topic).toBe("events");
			expect(msg.payload).toEqual({ type: "user-created" });

			await subscriber.stop();
		});

		it("should timeout if no message received", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber("test-sub", {
				adapter,
				topics: ["orders"],
			});
			await subscriber.start();

			await expect(subscriber.waitForMessage("orders", undefined, 50)).rejects.toThrow(/Timeout/);

			await subscriber.stop();
		});

		it("should throw if called before start", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber("test-sub", {
				adapter,
				topics: ["orders"],
			});

			await expect(subscriber.waitForMessage("orders")).rejects.toThrow(/not started/);
		});

		it("should return already received message immediately", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber("test-sub", {
				adapter,
				topics: ["orders"],
			});
			await subscriber.start();

			// Publish before waiting
			broker.publish("orders", {
				topic: "orders",
				payload: { orderId: "pre-existing" },
				timestamp: Date.now(),
			});

			// Small delay to ensure message is processed
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Should return immediately without timeout
			const msg = await subscriber.waitForMessage("orders", undefined, 50);

			expect(msg.payload).toEqual({ orderId: "pre-existing" });

			await subscriber.stop();
		});
	});

	describe("message buffer", () => {
		it("should store received messages", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber("test-sub", {
				adapter,
				topics: ["orders"],
			});
			await subscriber.start();

			broker.publish("orders", {
				topic: "orders",
				payload: { orderId: "1" },
				timestamp: Date.now(),
			});
			broker.publish("orders", {
				topic: "orders",
				payload: { orderId: "2" },
				timestamp: Date.now(),
			});

			// Small delay to process messages
			await new Promise((resolve) => setTimeout(resolve, 10));

			const messages = subscriber.getReceivedMessages();
			expect(messages).toHaveLength(2);

			await subscriber.stop();
		});

		it("should clear received messages", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber("test-sub", {
				adapter,
				topics: ["orders"],
			});
			await subscriber.start();

			broker.publish("orders", {
				topic: "orders",
				payload: { orderId: "1" },
				timestamp: Date.now(),
			});

			await new Promise((resolve) => setTimeout(resolve, 10));

			subscriber.clearReceivedMessages();

			expect(subscriber.getReceivedMessages()).toHaveLength(0);

			await subscriber.stop();
		});
	});

	describe("hooks", () => {
		it("should execute assert hook on matching message", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber("test-sub", {
				adapter,
				topics: ["orders"],
			});
			await subscriber.start();

			let assertCalled = false;
			subscriber.onMessage("orders").assert((msg) => {
				assertCalled = true;
				return msg.payload !== undefined;
			});

			broker.publish("orders", {
				topic: "orders",
				payload: { orderId: "123" },
				timestamp: Date.now(),
			});

			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(assertCalled).toBe(true);

			await subscriber.stop();
		});

		it("should track error when assert fails", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber("test-sub", {
				adapter,
				topics: ["orders"],
			});
			await subscriber.start();

			subscriber.onMessage("orders").assert("orderId must be present", (msg) => {
				return (msg.payload as { orderId?: string }).orderId !== undefined;
			});

			// Publish message without orderId
			broker.publish("orders", {
				topic: "orders",
				payload: { status: "invalid" },
				timestamp: Date.now(),
			});

			await new Promise((resolve) => setTimeout(resolve, 10));

			const errors = subscriber.getUnhandledErrors();
			expect(errors).toHaveLength(1);
			expect(errors[0].message).toContain("orderId must be present");

			await subscriber.stop();
		});

		it("should execute transform hook and modify message", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber("test-sub", {
				adapter,
				topics: ["orders"],
			});
			await subscriber.start();

			subscriber.onMessage("orders").transform((msg) => ({
				...msg,
				payload: { ...(msg.payload as object), transformed: true },
			}));

			broker.publish("orders", {
				topic: "orders",
				payload: { orderId: "123" },
				timestamp: Date.now(),
			});

			await new Promise((resolve) => setTimeout(resolve, 10));

			const messages = subscriber.getReceivedMessages();
			expect(messages).toHaveLength(1);
			expect((messages[0].payload as { transformed?: boolean }).transformed).toBe(true);

			await subscriber.stop();
		});

		it("should drop message with drop hook", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber("test-sub", {
				adapter,
				topics: ["orders"],
			});
			await subscriber.start();

			subscriber.onMessage("orders").drop();

			broker.publish("orders", {
				topic: "orders",
				payload: { orderId: "123" },
				timestamp: Date.now(),
			});

			await new Promise((resolve) => setTimeout(resolve, 10));

			// Message should be dropped, not stored
			expect(subscriber.getReceivedMessages()).toHaveLength(0);

			await subscriber.stop();
		});

		it("should only match hook with payload matcher", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber("test-sub", {
				adapter,
				topics: ["orders"],
			});
			await subscriber.start();

			// Only drop cancelled orders
			subscriber.onMessage("orders", (payload) => (payload as { status: string }).status === "cancelled").drop();

			broker.publish("orders", {
				topic: "orders",
				payload: { orderId: "1", status: "pending" },
				timestamp: Date.now(),
			});
			broker.publish("orders", {
				topic: "orders",
				payload: { orderId: "2", status: "cancelled" },
				timestamp: Date.now(),
			});

			await new Promise((resolve) => setTimeout(resolve, 10));

			const messages = subscriber.getReceivedMessages();
			// Only pending order should be stored (cancelled was dropped)
			expect(messages).toHaveLength(1);
			expect((messages[0].payload as { status: string }).status).toBe("pending");

			await subscriber.stop();
		});

		it("should chain multiple hooks", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber("test-sub", {
				adapter,
				topics: ["orders"],
			});
			await subscriber.start();

			subscriber
				.onMessage("orders")
				.assert((msg) => msg.payload !== undefined)
				.transform((msg) => ({
					...msg,
					payload: { ...(msg.payload as object), step1: true },
				}))
				.transform((msg) => ({
					...msg,
					payload: { ...(msg.payload as object), step2: true },
				}));

			broker.publish("orders", {
				topic: "orders",
				payload: { orderId: "123" },
				timestamp: Date.now(),
			});

			await new Promise((resolve) => setTimeout(resolve, 10));

			const messages = subscriber.getReceivedMessages();
			expect(messages).toHaveLength(1);
			const payload = messages[0].payload as { step1?: boolean; step2?: boolean };
			expect(payload.step1).toBe(true);
			expect(payload.step2).toBe(true);

			await subscriber.stop();
		});

		it("should clear non-persistent hooks", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber("test-sub", {
				adapter,
				topics: ["orders"],
			});
			await subscriber.start();

			subscriber.onMessage("orders").drop();

			subscriber.clearTestCaseHooks();

			// After clearing, message should not be dropped
			broker.publish("orders", {
				topic: "orders",
				payload: { orderId: "123" },
				timestamp: Date.now(),
			});

			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(subscriber.getReceivedMessages()).toHaveLength(1);

			await subscriber.stop();
		});

		it("should clear all hooks", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber("test-sub", {
				adapter,
				topics: ["orders"],
			});
			await subscriber.start();

			subscriber.onMessage("orders").drop();

			subscriber.clearHooks();

			broker.publish("orders", {
				topic: "orders",
				payload: { orderId: "123" },
				timestamp: Date.now(),
			});

			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(subscriber.getReceivedMessages()).toHaveLength(1);

			await subscriber.stop();
		});
	});

	describe("Component interface compatibility", () => {
		it("should implement Component interface", () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber("test-sub", {
				adapter,
				topics: ["orders"],
			});

			expect(subscriber.name).toBe("test-sub");
			expect(typeof subscriber.start).toBe("function");
			expect(typeof subscriber.stop).toBe("function");
			expect(typeof subscriber.getState).toBe("function");
			expect(typeof subscriber.isStarted).toBe("function");
			expect(typeof subscriber.isStopped).toBe("function");
			expect(typeof subscriber.createStepBuilder).toBe("function");
			expect(typeof subscriber.clearTestCaseHooks).toBe("function");
			expect(typeof subscriber.clearHooks).toBe("function");
		});
	});
});

describe("SubscriberStepBuilder", () => {
	let broker: InMemoryBroker;
	let subscriber: Subscriber<DefaultTopics>;
	let builder: TestCaseBuilder;

	beforeEach(async () => {
		broker = createInMemoryBroker();
		const adapter = createFakeMQAdapter(broker);
		subscriber = new Subscriber("test-sub", {
			adapter,
			topics: ["orders"],
		});
		await subscriber.start();
		builder = new TestCaseBuilder(new Map());
	});

	afterEach(async () => {
		await subscriber.stop();
		broker.clear();
	});

	it("should register waitForMessage step", () => {
		const stepBuilder = subscriber.createStepBuilder(builder);

		stepBuilder.waitForMessage("orders", "receivedOrder");

		const steps = builder.getSteps();
		expect(steps).toHaveLength(1);
		expect(steps[0].type).toBe("waitForMessage");
		expect(steps[0].metadata?.operation).toBe("waitForMessage");
		expect(steps[0].metadata?.storeAs).toBe("receivedOrder");
	});

	it("should register onMessage hook step", () => {
		const stepBuilder = subscriber.createStepBuilder(builder);

		stepBuilder.onMessage("orders").assert((msg) => msg.payload !== undefined);

		// Hook registration is synchronous, no step created
		// The hook is registered directly on the subscriber
	});
});

describe("Subscriber Type Safety", () => {
	it("should accept any topic in loose mode", async () => {
		const broker = createInMemoryBroker();
		const adapter = createFakeMQAdapter(broker);
		const subscriber = new Subscriber("test-sub", {
			adapter,
			topics: ["any-topic", "another-topic"],
		});
		await subscriber.start();

		// Register hooks on any topic
		subscriber.onMessage("any-topic").assert(() => true);
		subscriber.onMessage("another-topic").transform((msg) => msg);

		await subscriber.stop();
	});

	it("should work with typed topics in strict mode", async () => {
		interface OrderTopics {
			"order-created": { orderId: string; customerId: string };
			"order-updated": { orderId: string; status: string };
		}

		const broker = createInMemoryBroker();
		const adapter = createFakeMQAdapter(broker);
		const subscriber = new Subscriber<OrderTopics>("test-sub", {
			adapter,
			topics: ["order-created", "order-updated"],
		});
		await subscriber.start();

		// Type-safe hook - payload is typed
		subscriber.onMessage("order-created").assert((msg) => {
			// msg.payload is typed as { orderId: string; customerId: string }
			return msg.payload.orderId !== undefined;
		});

		subscriber.onMessage("order-updated").transform((msg) => {
			// msg.payload is typed as { orderId: string; status: string }
			return {
				...msg,
				payload: { ...msg.payload, processed: true } as typeof msg.payload,
			};
		});

		await subscriber.stop();
	});
});
