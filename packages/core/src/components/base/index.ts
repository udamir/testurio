/**
 * Component System
 *
 * Exports core component functionality.
 *
 * Component hierarchy:
 * - BaseComponent: Pure hooks + lifecycle (no protocol, no adapter)
 * - ServiceComponent<P>: Extends BaseComponent with protocol (for HTTP, gRPC, WS, TCP)
 * - MQComponent: Extends BaseComponent with adapter (for Kafka, RabbitMQ, Redis) - in mq/
 *
 * Note: Component builders are in their respective component folders:
 * - SyncHookBuilderImpl: components/sync-server/sync-hook-builder.ts
 * - AsyncHookBuilderImpl: components/async-server/async-hook-builder.ts
 */

export * from "./base.component";
export * from "./base.types";
export * from "./base.utils";
export * from "./service.component";
