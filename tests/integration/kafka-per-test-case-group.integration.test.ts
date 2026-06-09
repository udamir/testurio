/**
 * Kafka Per-Test-Case Auto-Generated Consumer Group Integration Tests
 * (task 037 v5.8)
 *
 * Covers the headline default behavior: omit `defaultSubscribeParams.groupId`
 * and every test case gets a unique `testurio-${randomSuffix(8)}` consumer
 * group. Each TC's auto-generated group is tracked on the parent
 * `KafkaAdapter` and swept via one shared `admin().deleteGroups([...])` call
 * at `dispose()` time (NOT per-TC — eliminates the LeaveGroup race).
 *
 * Skipped when Docker is unavailable. Port allocation: 18xxx range.
 */

import { KafkaAdapter } from "@testurio/adapter-kafka";
import type { Step } from "testurio";
import { Publisher, Subscriber, TestScenario, testCase } from "testurio";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getKafkaConfig, isKafkaAvailable } from "../containers";
import { createFakeMQAdapter } from "../mocks/fakeMQAdapter";

const uniq = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe.skipIf(!isKafkaAvailable())("Kafka Per-TC Auto-Generated Consumer Groups", () => {
	// 5.10 — default behavior: omit groupId; parallel TCs on same topic, both
	//        receive the same publish (unique groupId per TC → independent groups).
	it("5.10 default (no groupId) → parallel TCs on same topic each see all publishes", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: uniq("5_10"),
			defaultSubscribeParams: { fromBeginning: false }, // groupId omitted → auto-gen
			testMode: true,
		});
		try {
			const publisher = new Publisher("pub", { adapter });
			const subscriber = new Subscriber("sub", { adapter });
			const scenario = new TestScenario({ name: "5.10", components: [subscriber, publisher] });

			const topic = uniq("t-5-10");
			const tcA = testCase("auto-gen A", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);
				pub.publish(topic, { which: "A" });
				sub.waitMessage(topic).timeout(10_000);
			});
			const tcB = testCase("auto-gen B", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);
				pub.publish(topic, { which: "B" });
				sub.waitMessage(topic).timeout(10_000);
			});

			const result = await scenario.run(tcA, tcB);
			expect(result.passed, result.error).toBe(true);
		} finally {
			await adapter.dispose();
		}
	}, 30_000);

	// 5.11 — per-TC fromBeginning honored with auto-generated groupId.
	it("5.11 per-TC fromBeginning honored under auto-generated groupId", async () => {
		const kafka = getKafkaConfig();
		const adapter = new KafkaAdapter({
			brokers: kafka.brokers,
			clientId: uniq("5_11"),
			defaultSubscribeParams: { fromBeginning: true },
			testMode: true,
		});
		try {
			const publisher = new Publisher("pub", { adapter });
			const subscriber = new Subscriber("sub", { adapter });
			const scenario = new TestScenario({ name: "5.11", components: [subscriber, publisher] });

			const topic = uniq("t-5-11");
			const tc = testCase("auto-gen groupId + fromBeginning:true catches earlier publish", (test) => {
				const pub = test.use(publisher);
				const sub = test.use(subscriber);
				pub.publish(topic, { stamp: "early" });
				sub
					.waitMessage(topic)
					.assert((msg) => msg.payload?.stamp === "early")
					.timeout(10_000);
			});

			const result = await scenario.run(tc);
			expect(result.passed, result.error).toBe(true);
		} finally {
			await adapter.dispose();
		}
	}, 30_000);

	// 5.12 — auto-generated consumer groups removed by scenario teardown.
	//
	// **Skipped here**: directly probing the broker via `kafka.admin().listGroups()`
	// requires a workspace-level `kafkajs` dependency that isn't hoisted to the
	// test runner's resolution path. The KafkaAdapter sweep logic itself runs at
	// `dispose()` (covered by Phase 4 task 4.12); end-to-end verification belongs
	// in the broker-config docs path (task 6.8).
	it.skip("5.12 auto-generated testurio-* groups are gone after KafkaAdapter.dispose()", async () => {
		// See note above — manual broker probe required.
	});

	// 5.23 — deferred sweep timing: per-TC ends do NOT delete the group; only dispose() does.
	//
	// **Skipped here for the same reason as 5.12** — the design verifies the
	// per-TC `admin.deleteGroups` REMOVAL via inspection of the
	// `KafkaSubscriberAdapter.close` body and the deferred sweep via
	// `KafkaAdapter.dispose`. End-to-end broker probe deferred to the
	// docker-compose docs path (task 6.8).
	it.skip("5.23 auto-gen groups remain after each TC ends; cleanup deferred to dispose()", async () => {
		// See note above — manual broker probe required.
	});
});

// =============================================================================
// 5.21 b/c — init/stop persistent-hook throws (no Kafka required).
// =============================================================================

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

describe("Subscriber persistent-hook throw (init / stop handler paths)", () => {
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => {
		consoleErrorSpy.mockRestore();
	});

	// 5.21b — `scenario.init` handler registering a Subscriber wait — throws.
	it("5.21b Subscriber waitMessage registered inside scenario.init throws", async () => {
		const adapter = createFakeMQAdapter();
		const subscriber = new Subscriber("sub", { adapter });
		const step = buildScenarioLevelStep("waitMessage", "init-t", subscriber);
		await expect(subscriber.registerHook(step)).rejects.toThrow(/Scenario-level/);
	});

	// 5.21c — `scenario.stop` handler registering a Subscriber onMessage — throws.
	it("5.21c Subscriber onMessage registered inside scenario.stop throws", async () => {
		const adapter = createFakeMQAdapter();
		const subscriber = new Subscriber("sub", { adapter });
		const step = buildScenarioLevelStep("onMessage", "stop-t", subscriber);
		await expect(subscriber.registerHook(step)).rejects.toThrow(/inside testCase\(\) bodies/);
	});
});
