/**
 * Message Queue Components
 *
 * Publisher and Subscriber components for message queue testing.
 * Supports Kafka, RabbitMQ, Redis Pub/Sub via adapter pattern.
 *
 * @example Loose mode (any topic)
 * ```typescript
 * import { Publisher, Subscriber, KafkaAdapter } from "testurio";
 *
 * const adapter = new KafkaAdapter({ brokers: ["localhost:9092"] });
 * const publisher = new Publisher("pub", { adapter });
 * const subscriber = new Subscriber("sub", { adapter, topics: ["orders"] });
 *
 * await publisher.publish("orders", { orderId: "123" });
 * const msg = await subscriber.waitForMessage("orders");
 * ```
 *
 * @example Strict mode (typed topics)
 * ```typescript
 * interface MyTopics {
 *   "orders": { orderId: string; status: string };
 *   "events": { type: string; data: unknown };
 * }
 *
 * const publisher = new Publisher<MyTopics>("pub", { adapter });
 * publisher.publish("orders", { orderId: "123", status: "pending" }); // Type-safe
 * ```
 */

export * from "./mq.adapter.types";
export * from "./mq.base.component";
export * from "./mq.types";
