/**
 * @testurio/adapter-rabbitmq
 *
 * RabbitMQ adapter for testurio Publisher/Subscriber components.
 *
 * @example
 * ```typescript
 * import { Publisher, Subscriber } from "testurio";
 * import { RabbitMQAdapter } from "@testurio/adapter-rabbitmq";
 *
 * // Create adapter with RabbitMQ configuration
 * const adapter = new RabbitMQAdapter({
 *   url: "amqp://localhost:5672",
 *   exchange: "events",
 *   exchangeType: "topic",
 * });
 *
 * // Use with Publisher
 * const publisher = new Publisher("pub", { adapter });
 * await publisher.publish("orders.created", { orderId: "123" });
 *
 * // Use with Subscriber (topic patterns supported)
 * const subscriber = new Subscriber("sub", { adapter, topics: ["orders.#"] });
 * subscriber.onMessage("orders.#").assert((msg) => msg.payload.orderId !== undefined);
 * ```
 *
 * @packageDocumentation
 */

// Main adapter
export { RabbitMQAdapter } from "./rabbitmq.adapter";

// Individual adapters (for advanced use cases)
export { RabbitMQPublisherAdapter } from "./rabbitmq.publisher.adapter";
export { RabbitMQSubscriberAdapter } from "./rabbitmq.subscriber.adapter";

// Types
export type { RabbitMQAdapterConfig, RabbitMQMessageMetadata } from "./rabbitmq.types";

// Type guards and utilities
export { getDeliveryTag, getRoutingKey, isRabbitMQMetadata, isRedelivered } from "./rabbitmq.types";
