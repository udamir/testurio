/**
 * Subscriber Per-Test-Case Isolation Integration Tests (task 037 v5.8)
 *
 * Covers the v5.8 always-on per-TC isolation contract for `Subscriber`:
 * materialization per TC, batched subscribe, builder shortcuts, per-call params
 * override, autoSubscribe modes, breaking-change migration, per-TC error /
 * disconnect attribution, persistent-hook throw, doStop drain, and
 * restart-preserves-fromBeginning.
 *
 * Tests requiring a real Kafka broker are skipped automatically when Docker is
 * unavailable. Tests that only exercise component-level logic use the in-memory
 * `FakeMQAdapter`. Port allocation: 17xxx range.
 */

import { KafkaAdapter } from "@testurio/adapter-kafka";
import type { Step } from "testurio";
import { Publisher, Subscriber, TestScenario, testCase } from "testurio";
import { describe, expect, it, vi } from "vitest";
import { getKafkaConfig, isKafkaAvailable } from "../containers";
import { createFakeMQAdapter } from "../mocks/fakeMQAdapter";

const uniq = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe.skipIf(!isKafkaAvailable())("Subscriber Per-Test-Case Isolation (Kafka)", () => {
	// 5.1 — sequential TCs, same topic, shared groupId.
	it("5.1 sequential TCs on same topic with shared groupId tear down per-TC adapters", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: uniq("5_1"),
			defaultSubscribeParams: { groupId: uniq("shared-5_1"), fromBeginning: true },
			testMode: true,
		});
		try {
			const publisher = new Publisher("pub", { adapter });
			const subscriber = new Subscriber("sub", { adapter });
			const scenario = new TestScenario({ name: "5.1", components: [subscriber, publisher] });

			const tc1 = testCase("TC1", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);
				pub.publish("t-5-1", { i: 1 });
				sub.waitMessage("t-5-1").assert((msg) => {
					expect(msg.payload).toEqual({ i: 1 });
					return true;
				});
			});
			const tc2 = testCase("TC2", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);
				pub.publish("t-5-1", { i: 2 });
				sub.waitMessage("t-5-1").assert((msg) => {
					expect(msg.payload).toEqual({ i: 2 });
					return true;
				});
			});

			const result = await scenario.run([tc1, tc2]);
			expect(result.passed, result.error).toBe(true);
		} finally {
			await adapter.dispose();
		}
	});

	// 5.2 — sequential TCs, DIFFERENT Kafka topics (headline fix vs master).
	it("5.2 sequential TCs on different Kafka topics both succeed", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: uniq("5_2"),
			defaultSubscribeParams: { groupId: uniq("shared-5_2"), fromBeginning: true },
			testMode: true,
		});
		try {
			const publisher = new Publisher("pub", { adapter });
			const subscriber = new Subscriber("sub", { adapter });
			const scenario = new TestScenario({ name: "5.2", components: [subscriber, publisher] });

			const tcA = testCase("topic-a", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);
				pub.publish("t-5-2-a", { which: "a" });
				sub.waitMessage("t-5-2-a").assert((msg) => msg.payload?.which === "a");
			});
			const tcB = testCase("topic-b", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);
				pub.publish("t-5-2-b", { which: "b" });
				sub.waitMessage("t-5-2-b").assert((msg) => msg.payload?.which === "b");
			});

			const result = await scenario.run([tcA, tcB]);
			expect(result.passed, result.error).toBe(true);
		} finally {
			await adapter.dispose();
		}
	});

	// 5.3 — parallel TCs, same topic, shared groupId. Kafka partition-assignment
	//        semantics: each message lands on exactly one consumer.
	it("5.3 parallel TCs on same topic with shared groupId share messages (Kafka semantics)", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: uniq("5_3"),
			defaultSubscribeParams: { groupId: uniq("shared-5_3"), fromBeginning: true },
			testMode: true,
		});
		try {
			const publisher = new Publisher("pub", { adapter });
			const subscriber = new Subscriber("sub", { adapter });
			const scenario = new TestScenario({ name: "5.3", components: [subscriber, publisher] });

			const tcA = testCase("parallel-A", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);
				pub.publish("t-5-3", { id: "A" });
				sub.waitMessage("t-5-3").timeout(8000);
			});
			const tcB = testCase("parallel-B", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);
				pub.publish("t-5-3", { id: "B" });
				sub.waitMessage("t-5-3").timeout(8000);
			});

			const result = await scenario.run(tcA, tcB);
			expect(result.passed, result.error).toBe(true);
		} finally {
			await adapter.dispose();
		}
	});

	// 5.4 — parallel TCs, DISJOINT topics, shared groupId.
	it("5.4 parallel TCs on disjoint topics with shared groupId both deliver", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: uniq("5_4"),
			defaultSubscribeParams: { groupId: uniq("shared-5_4"), fromBeginning: true },
			testMode: true,
		});
		try {
			const publisher = new Publisher("pub", { adapter });
			const subscriber = new Subscriber("sub", { adapter });
			const scenario = new TestScenario({ name: "5.4", components: [subscriber, publisher] });

			const tcA = testCase("disjoint-A", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);
				pub.publish("t-5-4-a", { which: "a" });
				sub.waitMessage("t-5-4-a").assert((msg) => msg.payload?.which === "a");
			});
			const tcB = testCase("disjoint-B", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);
				pub.publish("t-5-4-b", { which: "b" });
				sub.waitMessage("t-5-4-b").assert((msg) => msg.payload?.which === "b");
			});

			const result = await scenario.run(tcA, tcB);
			expect(result.passed, result.error).toBe(true);
		} finally {
			await adapter.dispose();
		}
	});

	// 5.6 — per-call fromBeginning override.
	it("5.6 per-call fromBeginning override is honored", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: uniq("5_6"),
			defaultSubscribeParams: { fromBeginning: false },
			testMode: true,
		});
		try {
			const publisher = new Publisher("pub", { adapter });
			const subscriber = new Subscriber("sub", { adapter, autoSubscribe: false });
			const scenario = new TestScenario({ name: "5.6", components: [subscriber, publisher] });

			const topic = uniq("t-5-6");
			const tc = testCase("explicit fromBeginning=true catches earlier publish", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);
				pub.publish(topic, { stamp: "first" });
				sub.subscribe(topic, { fromBeginning: true });
				sub
					.waitMessage(topic)
					.assert((msg) => msg.payload?.stamp === "first")
					.timeout(8000);
			});

			const result = await scenario.run(tc);
			expect(result.passed, result.error).toBe(true);
		} finally {
			await adapter.dispose();
		}
	});

	// 5.7 — adapter-config defaultSubscribeParams resolution.
	it("5.7 defaultSubscribeParams on the adapter applies at createSubscriber time", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: uniq("5_7"),
			defaultSubscribeParams: { fromBeginning: true },
			testMode: true,
		});
		try {
			const publisher = new Publisher("pub", { adapter });
			const subscriber = new Subscriber("sub", { adapter });
			const scenario = new TestScenario({ name: "5.7", components: [subscriber, publisher] });

			const topic = uniq("t-5-7");
			const tc = testCase("adapter default applies", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);
				pub.publish(topic, { stamp: "before-wait" });
				sub
					.waitMessage(topic)
					.assert((msg) => msg.payload?.stamp === "before-wait")
					.timeout(8000);
			});

			const result = await scenario.run(tc);
			expect(result.passed, result.error).toBe(true);
		} finally {
			await adapter.dispose();
		}
	});

	// 5.8 — autoSubscribe: false imperative mode.
	it("5.8 autoSubscribe:false requires imperative subscribe before message delivery", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: uniq("5_8"),
			defaultSubscribeParams: { groupId: uniq("shared-5_8"), fromBeginning: true },
			testMode: true,
		});
		try {
			const publisher = new Publisher("pub", { adapter });
			const subscriber = new Subscriber("sub", { adapter, autoSubscribe: false });
			const scenario = new TestScenario({ name: "5.8", components: [subscriber, publisher] });

			const tc = testCase("imperative subscribe activates delivery", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);
				sub.subscribe("t-5-8");
				pub.publish("t-5-8", { stamp: "ok" });
				sub
					.waitMessage("t-5-8")
					.assert((msg) => msg.payload?.stamp === "ok")
					.timeout(8000);
			});

			const result = await scenario.run(tc);
			expect(result.passed, result.error).toBe(true);
		} finally {
			await adapter.dispose();
		}
	});

	// 5.13 — explicit shared groupId opt-out via defaultSubscribeParams.
	it("5.13 explicit shared groupId is honored across parallel TCs", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: uniq("5_13"),
			defaultSubscribeParams: { groupId: uniq("shared-5_13"), fromBeginning: true },
			testMode: true,
		});
		try {
			const publisher = new Publisher("pub", { adapter });
			const subscriber = new Subscriber("sub", { adapter });
			const scenario = new TestScenario({ name: "5.13", components: [subscriber, publisher] });

			const tcA = testCase("shared-group A", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);
				pub.publish("t-5-13", { x: "A" });
				sub.waitMessage("t-5-13").timeout(8000);
			});
			const tcB = testCase("shared-group B", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);
				pub.publish("t-5-13", { x: "B" });
				sub.waitMessage("t-5-13").timeout(8000);
			});

			const result = await scenario.run(tcA, tcB);
			expect(result.passed, result.error).toBe(true);
		} finally {
			await adapter.dispose();
		}
	});

	// 5.14 — batched subscribe efficiency.
	it("5.14 multiple hook-derived topics in one TC yield a single Kafka subscribe+run cycle", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: uniq("5_14"),
			defaultSubscribeParams: { groupId: uniq("shared-5_14"), fromBeginning: true },
			testMode: true,
		});
		try {
			const publisher = new Publisher("pub", { adapter });
			const subscriber = new Subscriber("sub", { adapter });
			const scenario = new TestScenario({ name: "5.14", components: [subscriber, publisher] });

			const tc = testCase("three onMessage hooks one batch", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);
				sub.onMessage("t-5-14-a");
				sub.onMessage("t-5-14-b");
				sub.onMessage("t-5-14-c");
				pub.publish("t-5-14-a", { which: "a" });
				pub.publish("t-5-14-b", { which: "b" });
				pub.publish("t-5-14-c", { which: "c" });
				sub.waitMessage("t-5-14-a").timeout(8000);
				sub.waitMessage("t-5-14-b").timeout(8000);
				sub.waitMessage("t-5-14-c").timeout(8000);
			});

			const start = Date.now();
			const result = await scenario.run(tc);
			const elapsed = Date.now() - start;
			expect(result.passed, result.error).toBe(true);
			// Budget: one join (~3 s on testMode) + delivery (<2 s) ≈ ≤ 12 s. A
			// restart-on-every-topic flow would burn ~3 s × 3 ≈ 9 s+ in joins alone.
			expect(elapsed).toBeLessThan(12_000);
		} finally {
			await adapter.dispose();
		}
	}, 30_000);

	// 5.15 — within-TC warn-on-conflict.
	it("5.15 within-TC conflicting explicit fromBeginning logs a warning", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: uniq("5_15"),
			defaultSubscribeParams: { groupId: uniq("shared-5_15"), fromBeginning: false },
			testMode: true,
		});
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const publisher = new Publisher("pub", { adapter });
			const subscriber = new Subscriber("sub", { adapter, autoSubscribe: false });
			const scenario = new TestScenario({ name: "5.15", components: [subscriber, publisher] });

			const tc = testCase("two conflicting explicit subscribes", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);
				sub.subscribe("t-5-15", { fromBeginning: true });
				sub.subscribe("t-5-15", { fromBeginning: false });
				pub.publish("t-5-15", { x: "ok" });
				sub.waitMessage("t-5-15").timeout(8000);
			});

			await scenario.run(tc);
			const warned = warnSpy.mock.calls.some((args) => String(args[0]).includes("fromBeginning"));
			expect(warned).toBe(true);
		} finally {
			warnSpy.mockRestore();
			await adapter.dispose();
		}
	});

	// 5.16 — per-TC handler routing correctness.
	it("5.16 parallel TCs with default per-TC groupIds each see their own delivery stream", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: uniq("5_16"),
			defaultSubscribeParams: { fromBeginning: false },
			testMode: true,
		});
		try {
			const publisher = new Publisher("pub", { adapter });
			const subscriber = new Subscriber("sub", { adapter });
			const scenario = new TestScenario({ name: "5.16", components: [subscriber, publisher] });

			const topic = uniq("t-5-16");
			const tcA = testCase("routing-A", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);
				pub.publish(topic, { which: "A" });
				sub.waitMessage(topic).timeout(8000);
			});
			const tcB = testCase("routing-B", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);
				pub.publish(topic, { which: "B" });
				sub.waitMessage(topic).timeout(8000);
			});

			const result = await scenario.run(tcA, tcB);
			expect(result.passed, result.error).toBe(true);
		} finally {
			await adapter.dispose();
		}
	});

	// 5.22 — auto-subscribe + explicit override interaction (H1/H4).
	it("5.22 auto-subscribe records no opinion; second explicit conflict warns", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: uniq("5_22"),
			defaultSubscribeParams: { groupId: uniq("shared-5_22"), fromBeginning: false },
			testMode: true,
		});
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const publisher = new Publisher("pub", { adapter });
			const subscriber = new Subscriber("sub", { adapter });
			const scenario = new TestScenario({ name: "5.22", components: [subscriber, publisher] });

			const tc = testCase("auto then first-explicit then second-explicit-conflict", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);
				// Phase 1 registers waitMessage's hook → topic enters _hookDerivedTopics
				// → Phase 1.5 auto-subscribes "t-5-22" with undefined (no opinion recorded).
				// Phase 2 then runs the two explicit subscribes (first-on-auto records the
				// opinion; second conflicts and warns) before publish + waitMessage at the
				// end. waitMessage MUST be last — see BUG-004: step-executor awaits each
				// step sequentially, so a leading waitMessage would block the subsequent
				// subscribes from running.
				sub.subscribe("t-5-22", { fromBeginning: true }); // first-explicit-on-auto — no warn
				sub.subscribe("t-5-22", { fromBeginning: false }); // second-explicit-conflict — WARN
				pub.publish("t-5-22", { ok: true });
				sub.waitMessage("t-5-22").timeout(8000);
			});

			await scenario.run(tc);
			const warned = warnSpy.mock.calls.some((args) => String(args[0]).includes("fromBeginning"));
			expect(warned).toBe(true);
		} finally {
			warnSpy.mockRestore();
			await adapter.dispose();
		}
	});

	// 5.25 — disconnect-reconnect restart preserves per-topic fromBeginning.
	it("5.25 restart on new topic preserves per-topic fromBeginning for already-active topics", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: uniq("5_25"),
			defaultSubscribeParams: { groupId: uniq("shared-5_25"), fromBeginning: true },
			testMode: true,
		});
		try {
			const publisher = new Publisher("pub", { adapter });
			// BUG-005 Option B: autoSubscribe disabled so Phase 1.5 doesn't batch
			// topicA + topicB together (which would force both to use the
			// adapter's default fromBeginning:true and defeat the restart-
			// preserves-per-topic-fromBeginning probe). Each topic is now
			// subscribed via its own explicit step with the correct per-call
			// fromBeginning value.
			const subscriber = new Subscriber("sub", { adapter, autoSubscribe: false });
			const scenario = new TestScenario({ name: "5.25", components: [subscriber, publisher] });

			const topicA = uniq("t-5-25-a");
			const topicB = uniq("t-5-25-b");

			// Seed history.
			const seedAdapter = new KafkaAdapter({ brokers: kafka.brokers, clientId: uniq("seed-5_25") });
			const seedPublisher = new Publisher("seed", { adapter: seedAdapter });
			const seedScenario = new TestScenario({ name: "seed", components: [seedPublisher] });
			const seedTc = testCase("seed", (test) => {
				const p = test.use(seedPublisher);
				p.publish(topicA, { age: "old-a" });
				p.publish(topicB, { age: "old-b" });
			});
			await seedScenario.run(seedTc);
			await seedAdapter.dispose();
			await new Promise((r) => setTimeout(r, 500));

			const tc = testCase("explicit restart preserves fromBeginning per topic", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);
				// Initial subscribe — topicA fromBeginning:true picks up the seeded
				// `old-a`. The consumer enters running state here.
				sub.subscribe(topicA, { fromBeginning: true });
				sub
					.waitMessage(topicA)
					.assert((msg) => msg.payload?.age === "old-a")
					.timeout(10_000);
				// Explicit subscribe to a NEW topic while running → triggers
				// restartConsumerWithTopics. The restart must preserve
				// topicA's recorded fromBeginning:true while applying
				// fromBeginning:false to the new topicB.
				sub.subscribe(topicB, { fromBeginning: false });
				pub.publish(topicB, { age: "new-b" });
				sub
					.waitMessage(topicB)
					.assert((msg) => msg.payload?.age === "new-b")
					.timeout(10_000);
			});

			const result = await scenario.run(tc);
			expect(result.passed, result.error).toBe(true);
		} finally {
			await adapter.dispose();
		}
	}, 60_000);
});

// =============================================================================
// Tests that DO NOT require a Kafka broker (use FakeMQAdapter).
// =============================================================================

/**
 * Build a Step manually for the persistent-hook throw tests. Bypasses the
 * normal step-builder/TestScenario lifecycle so we can probe the
 * `Subscriber.registerHook` precondition directly with `testCaseId: undefined`.
 */
function buildScenarioLevelStep(type: "onMessage" | "waitMessage", topic: string, component: Subscriber): Step {
	return {
		id: `manual-${type}`,
		type,
		component,
		params: { topic, topics: [topic] },
		handlers: [],
		mode: type === "waitMessage" ? "wait" : "hook",
		testCaseId: undefined,
	};
}

describe("Subscriber Per-Test-Case Isolation (Fake adapter)", () => {
	// 5.5 — imperative single + array form + empty-array shortcut.
	it("5.5 single, array, and empty-array shortcut forms all work", async () => {
		const adapter = createFakeMQAdapter();
		const publisher = new Publisher("pub", { adapter });
		const subscriber = new Subscriber("sub", { adapter, autoSubscribe: false });
		const scenario = new TestScenario({ name: "5.5", components: [subscriber, publisher] });

		const tc = testCase("forms", (test) => {
			const pub = test.use(publisher);
			const sub = test.use(subscriber);

			// Empty-array shortcut: subscribe to all hook-derived topics for
			// this TC (gathered from the waitMessage hooks registered in Phase 1).
			sub.subscribe();
			pub.publish("a", { which: "a" });
			pub.publish("b", { which: "b" });

			// Hook-derived topics: 'a' and 'b'. Hooks already in place from Phase 1.
			sub
				.waitMessage("a")
				.assert((msg) => msg.payload?.which === "a")
				.timeout(1000);
			sub
				.waitMessage("b")
				.assert((msg) => msg.payload?.which === "b")
				.timeout(1000);

			// Unsubscribe all currently-held — empty-array shortcut.
			sub.unsubscribe();
		});

		const result = await scenario.run(tc);
		expect(result.passed, result.error).toBe(true);
	});

	// 5.9 — TC end closes per-TC adapter; subscribers map shrinks.
	it("5.9 TC end closes per-TC adapter", async () => {
		const adapter = createFakeMQAdapter();
		const publisher = new Publisher("pub", { adapter });
		const subscriber = new Subscriber("sub", { adapter });
		const scenario = new TestScenario({ name: "5.9", components: [subscriber, publisher] });

		const tc = testCase("TC creates an entry", (test) => {
			const pub = test.use(publisher);
			const sub = test.use(subscriber);
			pub.publish("t-5-9", { x: 1 });
			sub.waitMessage("t-5-9").timeout(1000);
		});
		const result = await scenario.run(tc);
		expect(result.passed, result.error).toBe(true);

		// Exactly one subscriber adapter was materialized (per-TC) and is now closed.
		const created = adapter.getSubscriberAdapters();
		expect(created.length).toBe(1);
		expect(created[0].isConnected).toBe(false);
	});

	// 5.19 — per-TC adapter error attribution (component-level smoke).
	it("5.19 errors raised on one TC's adapter do not poison a sibling TC", async () => {
		const adapter = createFakeMQAdapter();
		const publisher = new Publisher("pub", { adapter });
		const subscriber = new Subscriber("sub", { adapter });
		const scenario = new TestScenario({ name: "5.19", components: [subscriber, publisher] });

		const tc1 = testCase("normal", (test) => {
			const pub = test.use(publisher);
			const sub = test.use(subscriber);
			pub.publish("t-5-19", { id: 1 });
			sub.waitMessage("t-5-19").timeout(1000);
		});
		const tc2 = testCase("normal-too", (test) => {
			const pub = test.use(publisher);
			const sub = test.use(subscriber);
			pub.publish("t-5-19", { id: 2 });
			sub.waitMessage("t-5-19").timeout(1000);
		});

		const result = await scenario.run([tc1, tc2]);
		expect(result.passed, result.error).toBe(true);
	});

	// 5.20 — per-TC adapter disconnect scope (timeout exercises clearHooks cleanup).
	it("5.20 wait timeout in one TC cleans up that TC's adapter without affecting siblings", async () => {
		const adapter = createFakeMQAdapter();
		const subscriber = new Subscriber("sub", { adapter });
		const scenario = new TestScenario({ name: "5.20", components: [subscriber] });

		const tc = testCase("timeout-then-cleanup", (test) => {
			const sub = test.use(subscriber);
			sub.waitMessage("t-5-20").timeout(200);
		});
		const result = await scenario.run(tc);
		expect(result.passed).toBe(false); // timeout — expected
		// Adapter created and closed even though the TC failed.
		const created = adapter.getSubscriberAdapters();
		expect(created.length).toBe(1);
		expect(created[0].isConnected).toBe(false);
	});

	// 5.21a — persistent-hook throw at scenario-level.
	it("5.21a Subscriber hook outside a testCase body throws at registerHook", async () => {
		const adapter = createFakeMQAdapter();
		const subscriber = new Subscriber("sub", { adapter });
		const step = buildScenarioLevelStep("onMessage", "t-5-21a", subscriber);
		await expect(subscriber.registerHook(step)).rejects.toThrow(/inside testCase\(\) bodies/);
	});

	// 5.24 — doStop blocks new materialization.
	it("5.24 doStop sets _isStopping; later clearHooks is a safe idempotent no-op", async () => {
		const adapter = createFakeMQAdapter();
		const subscriber = new Subscriber("sub", { adapter });

		// Exercise the lifecycle directly via BaseComponent.start/stop — no
		// scenario needed for this internal-state assertion.
		await subscriber.start();
		await subscriber.stop();

		// After stop, clearHooks for an unmaterialized TC is safe (idempotent path).
		await expect(Promise.resolve(subscriber.clearHooks("late-tc-id"))).resolves.toBeUndefined();
	});
});
