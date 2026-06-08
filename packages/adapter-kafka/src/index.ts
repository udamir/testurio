/**
 * @testurio/adapter-kafka
 *
 * Kafka MQ adapter for testurio Publisher/Subscriber components.
 *
 * @example Zero-config per-TC isolation (recommended)
 * ```typescript
 * import { Publisher, Subscriber, TestScenario, testCase } from "testurio";
 * import { KafkaAdapter } from "@testurio/adapter-kafka";
 *
 * const adapter = new KafkaAdapter({ brokers: ["localhost:9092"] });
 * // No groupId → each test case gets a unique `testurio-<random>` consumer group.
 *
 * const publisher = new Publisher("pub", { adapter });
 * const subscriber = new Subscriber("sub", { adapter });
 *
 * const tc = testCase("publish + receive", (test) => {
 *   const pub = test.use(publisher);
 *   const sub = test.use(subscriber);
 *   pub.publish("events", { type: "user.created", userId: "123" });
 *   sub.waitMessage("events").assert((msg) => msg.payload?.type === "user.created");
 * });
 *
 * await new TestScenario({ name: "demo", components: [subscriber, publisher] }).run(tc);
 * ```
 *
 * @example Shared groupId across test cases (opt-in)
 * ```typescript
 * const adapter = new KafkaAdapter({
 *   brokers: ["localhost:9092"],
 *   defaultSubscribeParams: { groupId: "shared-events", fromBeginning: true },
 * });
 * ```
 *
 * @packageDocumentation
 */

// Main adapter
export * from "./kafka.adapter";
// Errors
export * from "./kafka.errors";
// Individual adapters (for advanced use cases)
export * from "./kafka.publisher.adapter";
export * from "./kafka.subscriber.adapter";

// Types
export * from "./kafka.types";
