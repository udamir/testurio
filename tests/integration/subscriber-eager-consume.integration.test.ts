/**
 * Subscriber Eager Consume Integration Tests
 *
 * Proves the Kafka consumer-join race is closed for both `autoSubscribe` modes
 * (`true` and `string[]`), and that the default (`undefined`) mode preserves
 * backward-compatible behavior with the dummy-`onMessage` mitigation pattern.
 *
 * These tests require Docker. They will be skipped automatically if Docker is
 * not available.
 *
 * **Race description.** Before this fix, `Subscriber.executeStep` lazily called
 * `startConsuming()` on the first subscriber step. Kafka's `consumer.run()`
 * schedules the runner loop and resolves *before* `GROUP_JOIN`, so a
 * `.waitMessage(...)` step placed AFTER the action that publishes would join
 * the group too late, miss the message, and time out. The fix is two-fold:
 *   1. `KafkaSubscriberAdapter.startConsuming()` now awaits `GROUP_JOIN`.
 *   2. `SubscriberOptions.autoSubscribe?: true | string[]` opts the consumer
 *      into eager subscription so it's hot before the first action runs.
 *
 * Each test creates its own adapter (fresh `groupId`) so the eager-mode tests
 * can use `fromBeginning: false` and still get a deterministic result — the
 * first GROUP_JOIN starts at end-of-log, so any message published *after*
 * `startConsuming` resolves is guaranteed to be delivered.
 */

import { ConsumerJoinTimeoutError, KafkaAdapter } from "@testurio/adapter-kafka";
import { Publisher, Subscriber, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";
import { getKafkaConfig, isKafkaAvailable } from "../containers";

describe.skipIf(!isKafkaAvailable())("Subscriber Eager Consume", () => {
	it("Test A: autoSubscribe: true closes the consumer-join race", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: `eager-true-${Date.now()}`,
			groupId: `eager-true-group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			fromBeginning: false,
			testMode: true,
		});

		try {
			const publisher = new Publisher("pub", { adapter });
			const subscriber = new Subscriber("sub", { adapter, autoSubscribe: true });

			const scenario = new TestScenario({
				name: "autoSubscribe true race closed",
				components: [subscriber, publisher],
			});

			// Publish FIRST, wait SECOND. With autoSubscribe: true, the consumer
			// joins the group in Phase 1.5 (before any action step runs), so the
			// publish lands AFTER the consumer is at end-of-log and the message
			// is delivered.
			const tc = testCase("publish before wait, no preceding subscriber step", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);

				pub.publish("eager-true-topic", { kind: "order.filled", id: "abc-1" });

				sub
					.waitMessage("eager-true-topic")
					.assert((msg) => {
						expect(msg.payload).toEqual({ kind: "order.filled", id: "abc-1" });
						return true;
					})
					.timeout(5000);
			});

			const result = await scenario.run(tc);
			if (!result.passed) {
				console.log("Test A failed. Result:", JSON.stringify(result, null, 2));
			}
			expect(result.passed).toBe(true);
		} finally {
			await adapter.dispose();
		}
	});

	it("Test B: autoSubscribe: ['topic'] closes the consumer-join race", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: `eager-list-${Date.now()}`,
			groupId: `eager-list-group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			fromBeginning: false,
			testMode: true,
		});

		try {
			const publisher = new Publisher("pub", { adapter });
			const subscriber = new Subscriber("sub", {
				adapter,
				autoSubscribe: ["eager-list-topic"],
			});

			const scenario = new TestScenario({
				name: "autoSubscribe string[] race closed",
				components: [subscriber, publisher],
			});

			// With autoSubscribe: ['eager-list-topic'], the consumer subscribes
			// and joins the group during scenario.start() — before any test case
			// step runs. Publish-then-wait order is safe.
			const tc = testCase("publish before wait with explicit topic list", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);

				pub.publish("eager-list-topic", { kind: "order.filled", id: "list-1" });

				sub
					.waitMessage("eager-list-topic")
					.assert((msg) => {
						expect(msg.payload).toEqual({ kind: "order.filled", id: "list-1" });
						return true;
					})
					.timeout(5000);
			});

			const result = await scenario.run(tc);
			if (!result.passed) {
				console.log("Test B failed. Result:", JSON.stringify(result, null, 2));
			}
			expect(result.passed).toBe(true);
		} finally {
			await adapter.dispose();
		}
	});

	it("Test C: autoSubscribe undefined preserves backward-compatible behavior", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: `lazy-default-${Date.now()}`,
			groupId: `lazy-default-group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			fromBeginning: false,
			testMode: true,
		});

		try {
			const publisher = new Publisher("pub", { adapter });
			const subscriber = new Subscriber("sub", { adapter });

			const scenario = new TestScenario({
				name: "Default lazy mode with dummy-onMessage mitigation",
				components: [subscriber, publisher],
			});

			// Default lazy behavior — startConsuming is triggered by the first
			// subscriber step. The dummy `onMessage` step before the publish IS
			// that first subscriber step, so `startConsuming()` runs (and now
			// awaits GROUP_JOIN — Phase 1 adapter fix) before the publish.
			const tc = testCase("dummy onMessage before publish still works", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);

				sub.onMessage("lazy-default-topic"); // dummy step — triggers eager startConsuming

				pub.publish("lazy-default-topic", { kind: "order.filled", id: "lazy-1" });

				sub
					.waitMessage("lazy-default-topic")
					.assert((msg) => {
						expect(msg.payload).toEqual({ kind: "order.filled", id: "lazy-1" });
						return true;
					})
					.timeout(5000);
			});

			const result = await scenario.run(tc);
			if (!result.passed) {
				console.log("Test C failed. Result:", JSON.stringify(result, null, 2));
			}
			expect(result.passed).toBe(true);
		} finally {
			await adapter.dispose();
		}
	});

	// Manual-only test. Requires a broker that accepts the TCP connection but
	// never lets the consumer join the group — easiest to reproduce by pointing
	// at a dead port and waiting for kafkajs' own connect retry to expire after
	// the broker is reachable but stuck. Gated to avoid flaky CI: set
	// RUN_TIMEOUT_TEST=1 to run.
	it.skipIf(!process.env.RUN_TIMEOUT_TEST)("Test D: GROUP_JOIN timeout produces ConsumerJoinTimeoutError", async () => {
		// Point at an unreachable broker. KafkaAdapter.createSubscriber calls
		// adapter.connect() — that may itself reject with a kafkajs connection
		// error before we ever reach startConsuming. The autoSubscribe: true
		// path that triggers startConsuming during scenario.start() is what we
		// want to assert against.
		const adapter = new KafkaAdapter({
			brokers: ["localhost:1"],
			clientId: `timeout-${Date.now()}`,
			groupId: `timeout-group-${Date.now()}`,
			groupJoinTimeoutMs: 100,
			connectionTimeout: 500,
			requestTimeout: 500,
		});

		const subscriber = new Subscriber("sub", {
			adapter,
			autoSubscribe: ["timeout-topic"],
		});

		const scenario = new TestScenario({
			name: "ConsumerJoinTimeoutError on unreachable broker",
			components: [subscriber],
		});

		try {
			await expect(
				scenario.start().then(async () => {
					await scenario.stop();
				})
			).rejects.toSatisfy((err: unknown) => err instanceof ConsumerJoinTimeoutError);
		} finally {
			try {
				await adapter.dispose();
			} catch {
				// best-effort cleanup
			}
		}
	});
});
