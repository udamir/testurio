/**
 * @testurio/adapter-kafka
 *
 * Kafka MQ adapter for testurio Publisher/Subscriber components.
 *
 * @example
 * ```typescript
 * import { Publisher, Subscriber } from "testurio";
 * import { KafkaAdapter } from "@testurio/adapter-kafka";
 *
 * // Create adapter with Kafka configuration
 * const adapter = new KafkaAdapter({
 *   brokers: ["localhost:9092"],
 *   clientId: "my-app",
 *   groupId: "my-consumer-group",
 * });
 *
 * // Use with Publisher
 * const publisher = new Publisher("pub", { adapter });
 * await publisher.publish("events", { type: "user.created", userId: "123" });
 *
 * // Use with Subscriber
 * const subscriber = new Subscriber("sub", { adapter, topics: ["events"] });
 * subscriber.onMessage("events").assert((msg) => msg.payload.type !== undefined);
 * ```
 *
 * @packageDocumentation
 */

// Main adapter
export { KafkaAdapter } from "./kafka.adapter";

// Individual adapters (for advanced use cases)
export { KafkaPublisherAdapter } from "./kafka.publisher.adapter";
export { KafkaSubscriberAdapter } from "./kafka.subscriber.adapter";

// Types
export type { KafkaAdapterConfig, KafkaMessageMetadata } from "./kafka.types";

// Type guards and utilities
export { getKafkaOffset, getKafkaPartition, isKafkaMetadata } from "./kafka.types";
