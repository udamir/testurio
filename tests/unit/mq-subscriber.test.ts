/**
 * Subscriber Component Unit Tests
 *
 * Tests for the MQ Subscriber component including lifecycle,
 * step execution, hooks, and message handling.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DefaultTopics } from "../../packages/core/src/components/mq.base";
import { Subscriber } from "../../packages/core/src/components/subscriber";
import type { Step, Handler } from "../../packages/core/src/components/base/step.types";
import {
	createFakeMQAdapter,
	createInMemoryBroker,
	type InMemoryBroker,
	type FakeMessage,
} from "../mocks/fakeMQAdapter";

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
			const subscriber = new Subscriber("test-sub", { adapter });

			expect(subscriber.getState()).toBe("created");
			expect(subscriber.isStarted()).toBe(false);

			await subscriber.start();

			expect(subscriber.getState()).toBe("started");
			expect(subscriber.isStarted()).toBe(true);

			await subscriber.stop();
		});

		it("should stop and close subscriber adapter", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber("test-sub", { adapter });
			await subscriber.start();

			await subscriber.stop();

			expect(subscriber.getState()).toBe("stopped");
			expect(subscriber.isStopped()).toBe(true);
		});

		it("should throw if started twice", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber("test-sub", { adapter });
			await subscriber.start();

			await expect(subscriber.start()).rejects.toThrow();

			await subscriber.stop();
		});

		it("should allow restart after stop", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber("test-sub", { adapter });

			await subscriber.start();
			await subscriber.stop();
			await subscriber.start();

			expect(subscriber.isStarted()).toBe(true);

			await subscriber.stop();
		});

		it("should handle adapter connection failure", async () => {
			const adapter = createFakeMQAdapter(broker, { failOnConnect: true });
			const subscriber = new Subscriber("test-sub", { adapter });

			await expect(subscriber.start()).rejects.toThrow(/Connection failed/);
			expect(subscriber.getState()).toBe("error");
		});
	});

	describe("executeStep - waitMessage", () => {
		it("should receive message on subscribed topic", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber<DefaultTopics, FakeMessage>("test-sub", { adapter });

			// Mark topic for subscription before start
			subscriber.ensureSubscribed("orders");
			await subscriber.start();

			// First register the hook for the step
			const step: Step = {
				id: "wait-step-1",
				type: "waitMessage",
				component: subscriber,
				mode: "wait",
				params: {
					topics: ["orders"],
					timeout: 1000,
				},
				handlers: [],
			};
			subscriber.registerHook(step);

			// Publish after small delay
			setTimeout(() => {
				broker.publish("orders", {
					topic: "orders",
					payload: { orderId: "123" },
					timestamp: Date.now(),
				});
			}, 10);

			// Execute waitMessage step
			await subscriber.executeStep(step);

			await subscriber.stop();
		});

		it("should timeout if no message received", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber<DefaultTopics, FakeMessage>("test-sub", { adapter });

			subscriber.ensureSubscribed("orders");
			await subscriber.start();

			const step: Step = {
				id: "wait-step-2",
				type: "waitMessage",
				component: subscriber,
				mode: "wait",
				params: {
					topics: ["orders"],
					timeout: 50,
				},
				handlers: [],
			};
			subscriber.registerHook(step);

			await expect(subscriber.executeStep(step)).rejects.toThrow(/Timeout/);

			await subscriber.stop();
		});

		it("should use buffered message if already received", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber<DefaultTopics, FakeMessage>("test-sub", { adapter });

			subscriber.ensureSubscribed("orders");
			await subscriber.start();

			// Message arrives first (no hook registered yet, goes to buffer)
			broker.publish("orders", {
				topic: "orders",
				payload: { orderId: "pre-existing" },
				timestamp: Date.now(),
			});

			// Wait for message to be buffered
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Now register step and execute - should get buffered message
			const step: Step = {
				id: "wait-step-3",
				type: "waitMessage",
				component: subscriber,
				mode: "wait",
				params: {
					topics: ["orders"],
					timeout: 100,
				},
				handlers: [],
			};
			subscriber.registerHook(step);

			// Should resolve immediately from buffer
			await subscriber.executeStep(step);

			await subscriber.stop();
		});

		it("should match message with custom matcher", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber<DefaultTopics, FakeMessage>("test-sub", { adapter });

			subscriber.ensureSubscribed("orders");
			await subscriber.start();

			const step: Step = {
				id: "wait-step-4",
				type: "waitMessage",
				component: subscriber,
				mode: "wait",
				params: {
					topics: ["orders"],
					matcher: (m: FakeMessage) => (m.payload as { status?: string }).status === "shipped",
					timeout: 500,
				},
				handlers: [],
			};
			subscriber.registerHook(step);

			// First message doesn't match
			setTimeout(() => {
				broker.publish("orders", {
					topic: "orders",
					payload: { orderId: "1", status: "pending" },
					timestamp: Date.now(),
				});
			}, 10);

			// Second message matches
			setTimeout(() => {
				broker.publish("orders", {
					topic: "orders",
					payload: { orderId: "2", status: "shipped" },
					timestamp: Date.now(),
				});
			}, 30);

			await subscriber.executeStep(step);

			await subscriber.stop();
		});
	});

	describe("executeStep - onMessage", () => {
		it("should execute onMessage step (hook mode, no-op)", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber<DefaultTopics, FakeMessage>("test-sub", { adapter });

			subscriber.ensureSubscribed("orders");
			await subscriber.start();

			const step: Step = {
				id: "on-msg-step-1",
				type: "onMessage",
				component: subscriber,
				mode: "hook",
				params: {
					topics: ["orders"],
				},
				handlers: [],
			};
			subscriber.registerHook(step);

			// onMessage step is a no-op (hook mode)
			await subscriber.executeStep(step);

			await subscriber.stop();
		});
	});

	describe("hooks with handlers", () => {
		it("should execute assert handler on matching message", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber<DefaultTopics, FakeMessage>("test-sub", { adapter });

			subscriber.ensureSubscribed("orders");
			await subscriber.start();

			let assertCalled = false;
			const assertHandler: Handler = {
				type: "assert",
				params: {
					predicate: (m: unknown) => {
						assertCalled = true;
						return (m as FakeMessage).payload !== undefined;
					},
				},
			};

			const step: Step = {
				id: "assert-step-1",
				type: "onMessage",
				component: subscriber,
				mode: "hook",
				params: {
					topics: ["orders"],
				},
				handlers: [assertHandler],
			};
			subscriber.registerHook(step);

			broker.publish("orders", {
				topic: "orders",
				payload: { orderId: "123" },
				timestamp: Date.now(),
			});

			await new Promise((resolve) => setTimeout(resolve, 20));

			expect(assertCalled).toBe(true);

			await subscriber.stop();
		});

		it("should track error when assert fails", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber<DefaultTopics, FakeMessage>("test-sub", { adapter });

			subscriber.ensureSubscribed("orders");
			await subscriber.start();

			const assertHandler: Handler = {
				type: "assert",
				description: "orderId must be present",
				params: {
					predicate: (m: unknown) => {
						return (m as FakeMessage & { payload: { orderId?: string } }).payload.orderId !== undefined;
					},
				},
			};

			const step: Step = {
				id: "assert-step-2",
				type: "onMessage",
				component: subscriber,
				mode: "hook",
				params: {
					topics: ["orders"],
				},
				handlers: [assertHandler],
			};
			subscriber.registerHook(step);

			// Publish message without orderId
			broker.publish("orders", {
				topic: "orders",
				payload: { status: "invalid" },
				timestamp: Date.now(),
			});

			await new Promise((resolve) => setTimeout(resolve, 20));

			const errors = subscriber.getUnhandledErrors();
			expect(errors).toHaveLength(1);
			expect(errors[0].message).toContain("orderId must be present");

			await subscriber.stop();
		});

		it("should execute drop handler and stop processing", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber<DefaultTopics, FakeMessage>("test-sub", { adapter });

			subscriber.ensureSubscribed("orders");
			await subscriber.start();

			let transformCalled = false;
			const dropHandler: Handler = { type: "drop", params: {} };
			const transformHandler: Handler = {
				type: "transform",
				params: {
					handler: (m: unknown) => {
						transformCalled = true;
						return m;
					},
				},
			};

			const step: Step = {
				id: "drop-step-1",
				type: "onMessage",
				component: subscriber,
				mode: "hook",
				params: {
					topics: ["orders"],
				},
				handlers: [dropHandler, transformHandler],
			};
			subscriber.registerHook(step);

			broker.publish("orders", {
				topic: "orders",
				payload: { orderId: "123" },
				timestamp: Date.now(),
			});

			await new Promise((resolve) => setTimeout(resolve, 20));

			// Transform should NOT be called because drop stops processing
			expect(transformCalled).toBe(false);
			// Drop error should NOT be tracked as unhandled
			expect(subscriber.getUnhandledErrors()).toHaveLength(0);

			await subscriber.stop();
		});

		it("should execute transform handler and modify result", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber<DefaultTopics, FakeMessage>("test-sub", { adapter });

			subscriber.ensureSubscribed("orders");
			await subscriber.start();

			let transformedMessage: unknown;
			const transformHandler: Handler = {
				type: "transform",
				params: {
					handler: (m: unknown) => {
						const msg = m as FakeMessage;
						transformedMessage = {
							...msg,
							payload: { ...(msg.payload as object), transformed: true },
						};
						return transformedMessage;
					},
				},
			};

			const step: Step = {
				id: "transform-step-1",
				type: "waitMessage",
				component: subscriber,
				mode: "wait",
				params: {
					topics: ["orders"],
					timeout: 500,
				},
				handlers: [transformHandler],
			};
			subscriber.registerHook(step);

			setTimeout(() => {
				broker.publish("orders", {
					topic: "orders",
					payload: { orderId: "123" },
					timestamp: Date.now(),
				});
			}, 10);

			await subscriber.executeStep(step);

			expect(transformedMessage).toBeDefined();
			expect((transformedMessage as FakeMessage & { payload: { transformed?: boolean } }).payload.transformed).toBe(true);

			await subscriber.stop();
		});
	});

	describe("multiple topics", () => {
		it("should wait for message from any of multiple topics", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber<DefaultTopics, FakeMessage>("test-sub", { adapter });

			subscriber.ensureSubscribed("orders");
			subscriber.ensureSubscribed("events");
			await subscriber.start();

			const step: Step = {
				id: "multi-topic-step-1",
				type: "waitMessage",
				component: subscriber,
				mode: "wait",
				params: {
					topics: ["orders", "events"],
					timeout: 500,
				},
				handlers: [],
			};
			subscriber.registerHook(step);

			setTimeout(() => {
				broker.publish("events", {
					topic: "events",
					payload: { type: "user-created" },
					timestamp: Date.now(),
				});
			}, 10);

			await subscriber.executeStep(step);

			await subscriber.stop();
		});
	});

	describe("hook cleanup", () => {
		it("should clear hooks on stop", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber<DefaultTopics, FakeMessage>("test-sub", { adapter });

			subscriber.ensureSubscribed("orders");
			await subscriber.start();

			const step: Step = {
				id: "cleanup-step-1",
				type: "onMessage",
				component: subscriber,
				mode: "hook",
				params: {
					topics: ["orders"],
				},
				handlers: [],
			};
			subscriber.registerHook(step);

			await subscriber.stop();

			// After stop, hooks should be cleared
			// Start again and verify no hooks
			subscriber.ensureSubscribed("orders");
			await subscriber.start();

			// No errors should occur even with messages (no hooks registered)
			broker.publish("orders", {
				topic: "orders",
				payload: { orderId: "123" },
				timestamp: Date.now(),
			});

			await new Promise((resolve) => setTimeout(resolve, 20));

			expect(subscriber.getUnhandledErrors()).toHaveLength(0);

			await subscriber.stop();
		});

		it("should remove non-persistent hooks after step completes", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber<DefaultTopics, FakeMessage>("test-sub", { adapter });

			subscriber.ensureSubscribed("orders");
			await subscriber.start();

			const step: Step = {
				id: "cleanup-step-2",
				type: "waitMessage",
				component: subscriber,
				mode: "wait",
				params: {
					topics: ["orders"],
					timeout: 500,
				},
				handlers: [],
			};
			subscriber.registerHook(step);

			setTimeout(() => {
				broker.publish("orders", {
					topic: "orders",
					payload: { orderId: "first" },
					timestamp: Date.now(),
				});
			}, 10);

			await subscriber.executeStep(step);

			// After step completes, hook should be removed
			// Second message should not be matched
			broker.publish("orders", {
				topic: "orders",
				payload: { orderId: "second" },
				timestamp: Date.now(),
			});

			await new Promise((resolve) => setTimeout(resolve, 20));

			// No errors should occur
			expect(subscriber.getUnhandledErrors()).toHaveLength(0);

			await subscriber.stop();
		});
	});

	describe("Component interface compatibility", () => {
		it("should implement Component interface", () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber("test-sub", { adapter });

			expect(subscriber.name).toBe("test-sub");
			expect(typeof subscriber.start).toBe("function");
			expect(typeof subscriber.stop).toBe("function");
			expect(typeof subscriber.getState).toBe("function");
			expect(typeof subscriber.isStarted).toBe("function");
			expect(typeof subscriber.isStopped).toBe("function");
			expect(typeof subscriber.createStepBuilder).toBe("function");
			expect(typeof subscriber.registerHook).toBe("function");
			expect(typeof subscriber.clearHooks).toBe("function");
		});
	});

	describe("unknown step type", () => {
		it("should throw for unknown step type", async () => {
			const adapter = createFakeMQAdapter(broker);
			const subscriber = new Subscriber<DefaultTopics, FakeMessage>("test-sub", { adapter });
			await subscriber.start();

			const step: Step = {
				id: "unknown-step-1",
				type: "unknownType",
				component: subscriber,
				mode: "action",
				params: {},
				handlers: [],
			};

			await expect(subscriber.executeStep(step)).rejects.toThrow(/Unknown step type/);

			await subscriber.stop();
		});
	});
});

describe("Subscriber Type Safety", () => {
	it("should accept any topic in loose mode", async () => {
		const broker = createInMemoryBroker();
		const adapter = createFakeMQAdapter(broker);
		const subscriber = new Subscriber<DefaultTopics, FakeMessage>("test-sub", { adapter });

		subscriber.ensureSubscribed("any-topic");
		subscriber.ensureSubscribed("another-topic");
		await subscriber.start();

		// In loose mode, any topic string is valid
		const step1: Step = {
			id: "type-step-1",
			type: "onMessage",
			component: subscriber,
			mode: "hook",
			params: { topics: ["any-topic"] },
			handlers: [],
		};
		const step2: Step = {
			id: "type-step-2",
			type: "onMessage",
			component: subscriber,
			mode: "hook",
			params: { topics: ["another-topic"] },
			handlers: [],
		};

		subscriber.registerHook(step1);
		subscriber.registerHook(step2);

		await subscriber.stop();
	});

	it("should work with typed topics in strict mode", async () => {
		interface OrderTopics {
			"order-created": { orderId: string; customerId: string };
			"order-updated": { orderId: string; status: string };
		}

		const broker = createInMemoryBroker();
		const adapter = createFakeMQAdapter(broker);
		const subscriber = new Subscriber<OrderTopics, FakeMessage>("test-sub", { adapter });

		subscriber.ensureSubscribed("order-created");
		subscriber.ensureSubscribed("order-updated");
		await subscriber.start();

		// Type-safe steps
		const step1: Step = {
			id: "type-step-3",
			type: "onMessage",
			component: subscriber,
			mode: "hook",
			params: { topics: ["order-created"] },
			handlers: [],
		};
		const step2: Step = {
			id: "type-step-4",
			type: "onMessage",
			component: subscriber,
			mode: "hook",
			params: { topics: ["order-updated"] },
			handlers: [],
		};

		subscriber.registerHook(step1);
		subscriber.registerHook(step2);

		await subscriber.stop();
	});
});
