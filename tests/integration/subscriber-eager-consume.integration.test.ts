/**
 * Subscriber Eager Consume Integration Tests
 *
 * Under task 037 v5.8 the Subscriber is always per-test-case and the consumer
 * activates inside `adapter.subscribe(...)` (master's separate `startConsuming`
 * was folded in). These tests prove the consumer-join race is still closed
 * end-to-end:
 *  - Test A — default `autoSubscribe: true` subscribes hook-derived topics in
 *    Phase 1.5 (before any action step runs), so publish-before-wait works.
 *  - Test B — `autoSubscribe: false` + imperative `ev.subscribe([...])`
 *    exercises the explicit batched-subscribe path.
 *  - Test C — `autoSubscribe: true` with a no-op `onMessage` proves the
 *    topic auto-subscribes even when no wait step is present yet.
 *
 * Each test specifies an explicit `defaultSubscribeParams.groupId` so the
 * shared-group opt-out path is exercised and `fromBeginning: false` gives a
 * deterministic end-of-log start.
 */

import { KafkaAdapter } from "@testurio/adapter-kafka";
import { Publisher, Subscriber, TestScenario, testCase } from "testurio";
import { describe, expect, it } from "vitest";
import { getKafkaConfig, isKafkaAvailable } from "../containers";

describe.skipIf(!isKafkaAvailable())("Subscriber Eager Consume", () => {
	it("Test A: autoSubscribe: true closes the consumer-join race", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: `eager-true-${Date.now()}`,
			defaultSubscribeParams: {
				groupId: `eager-true-group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				fromBeginning: false,
			},
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

	it("Test B: autoSubscribe: false + imperative subscribe([...]) batched activation", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: `eager-list-${Date.now()}`,
			defaultSubscribeParams: {
				groupId: `eager-list-group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				fromBeginning: false,
			},
			testMode: true,
		});

		try {
			const publisher = new Publisher("pub", { adapter });
			const subscriber = new Subscriber("sub", { adapter, autoSubscribe: false });

			const scenario = new TestScenario({
				name: "autoSubscribe false + imperative subscribe([...])",
				components: [subscriber, publisher],
			});

			// `autoSubscribe: false` disables Phase 1.5 auto-subscribe. The
			// explicit `subscribe(['eager-list-topic'])` step batches into one
			// Kafka `consumer.subscribe + consumer.run` cycle and awaits
			// GROUP_JOIN before returning — publish-then-wait afterwards is safe.
			const tc = testCase("imperative subscribe before publish", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);

				sub.subscribe(["eager-list-topic"]);
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

	it("Test C: autoSubscribe true with a no-op onMessage hook auto-subscribes the topic", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: `auto-noop-${Date.now()}`,
			defaultSubscribeParams: {
				groupId: `auto-noop-group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				fromBeginning: false,
			},
			testMode: true,
		});

		try {
			const publisher = new Publisher("pub", { adapter });
			const subscriber = new Subscriber("sub", { adapter });

			const scenario = new TestScenario({
				name: "autoSubscribe true + no-op onMessage hook",
				components: [subscriber, publisher],
			});

			// `autoSubscribe: true` (default) — the `onMessage` hook contributes
			// 'lazy-default-topic' to `_hookDerivedTopics`. Phase 1.5 issues
			// `adapter.subscribe(['lazy-default-topic'])`, awaits GROUP_JOIN,
			// and the publish then lands on a hot consumer.
			const tc = testCase("no-op onMessage before publish wires up Phase 1.5 subscribe", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);

				sub.onMessage("lazy-default-topic"); // no-op handler — only registers the topic

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
	// never lets the consumer join the group. Under v5.8 the GROUP_JOIN happens
	// inside the test case body (Phase 1.5), so the timeout surfaces as a
	// failed TestScenario.run result — not as a rejected scenario.start().
	// Gated to avoid flaky CI: set RUN_TIMEOUT_TEST=1 to run.
	it.skipIf(!process.env.RUN_TIMEOUT_TEST)("Test D: GROUP_JOIN timeout produces ConsumerJoinTimeoutError", async () => {
		const adapter = new KafkaAdapter({
			brokers: ["localhost:1"],
			clientId: `timeout-${Date.now()}`,
			defaultSubscribeParams: { groupId: `timeout-group-${Date.now()}` },
			groupJoinTimeoutMs: 100,
			connectionTimeout: 500,
			requestTimeout: 500,
		});

		const subscriber = new Subscriber("sub", { adapter });

		const scenario = new TestScenario({
			name: "ConsumerJoinTimeoutError on unreachable broker",
			components: [subscriber],
		});

		const tc = testCase("Phase 1.5 subscribe surfaces GROUP_JOIN timeout", (test) => {
			const sub = test.use(subscriber);
			sub.waitMessage("timeout-topic").timeout(2000);
		});

		try {
			const result = await scenario.run(tc);
			expect(result.passed).toBe(false);
			// The error message should reference GROUP_JOIN or the timeout window.
			expect(result.error ?? "").toMatch(/GROUP_JOIN|ConsumerJoinTimeoutError/);
		} finally {
			try {
				await adapter.dispose();
			} catch {
				// best-effort cleanup
			}
		}
	});
});
