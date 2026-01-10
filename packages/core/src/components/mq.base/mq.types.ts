/**
 * Message Queue Types
 *
 * Core types for message queue components.
 * These types are adapter-agnostic and used by Publisher/Subscriber components.
 *
 * Includes flexible type system for loose/strict mode:
 * - **Loose mode** (no type parameter): Any topic string accepted, payload is `unknown`
 * - **Strict mode** (with type parameter): Only defined topics accepted, payloads are typed
 *
 * @example Loose mode
 * ```typescript
 * const publisher = new Publisher("pub", { adapter });
 * publisher.publish("any-topic", { any: "data" });
 * ```
 *
 * @example Strict mode
 * ```typescript
 * interface MyTopics {
 *   "user-events": { userId: string; action: string };
 *   "order-events": { orderId: string; status: string };
 * }
 * const publisher = new Publisher<MyTopics>("pub", { adapter });
 * publisher.publish("user-events", { userId: "123", action: "created" }); // ✓
 * publisher.publish("invalid", {}); // ✗ Type error
 * ```
 */

// =============================================================================
// Core Message Types
// =============================================================================

/**
 * Message received from or sent to a message queue.
 *
 * @template T - Payload type (defaults to unknown for loose mode)
 *
 * @example
 * ```typescript
 * const message: QueueMessage<{ orderId: string }> = {
 *   topic: "orders",
 *   payload: { orderId: "123" },
 *   key: "order-123",
 *   headers: { "correlation-id": "abc" },
 *   timestamp: Date.now(),
 * };
 * ```
 */
export interface QueueMessage<T = unknown> {
	/**
	 * Topic or queue name the message was received from/sent to
	 */
	readonly topic: string;

	/**
	 * Message payload (deserialized by codec)
	 */
	readonly payload: T;

	/**
	 * Optional message key (used for partitioning in Kafka, routing in RabbitMQ)
	 */
	readonly key?: string;

	/**
	 * Optional message headers
	 */
	readonly headers?: Record<string, string>;

	/**
	 * Optional timestamp (milliseconds since epoch)
	 */
	readonly timestamp?: number;

	/**
	 * Opaque broker-specific metadata.
	 * Use adapter utilities to interpret (e.g., Kafka partition/offset).
	 */
	readonly metadata?: unknown;
}

/**
 * Options for publishing a message.
 *
 * @example
 * ```typescript
 * publisher.publish("orders", payload, {
 *   key: "customer-123",
 *   headers: { "correlation-id": "abc" },
 * });
 * ```
 */
export interface PublishOptions {
	/**
	 * Message key for partitioning/routing
	 */
	key?: string;

	/**
	 * Message headers
	 */
	headers?: Record<string, string>;
}

/**
 * Batch message item for publishBatch operations.
 *
 * @template T - Payload type
 */
export interface BatchMessage<T = unknown> {
	/**
	 * Message payload
	 */
	payload: T;

	/**
	 * Optional message key
	 */
	key?: string;

	/**
	 * Optional message headers
	 */
	headers?: Record<string, string>;
}

// =============================================================================
// Flexible Type System (Loose/Strict Mode)
// =============================================================================

/**
 * Topic definitions type.
 * Maps topic names to their payload types.
 */
export type Topics = Record<string, unknown>;

/**
 * Default topics type for loose mode.
 * Uses index signature to accept any string key.
 */
export type DefaultTopics = { [key: string]: unknown };

/**
 * Detects whether T is in loose mode (accepts any string key).
 *
 * Returns `true` if T has an index signature (loose mode).
 * Returns `false` if T has specific keys only (strict mode).
 */
export type IsLooseMode<T> = string extends keyof T ? true : false;

/**
 * Extracts valid topic names from Topics type T.
 *
 * - Loose mode: Returns `string` (any topic allowed)
 * - Strict mode: Returns union of defined topic names
 */
export type Topic<T> = IsLooseMode<T> extends true ? string : keyof T & string;

/**
 * Extracts payload type for a given topic K in Topics type T.
 *
 * - Loose mode: Returns `unknown` (any payload allowed)
 * - Strict mode: Returns the defined payload type for topic K
 */
export type Payload<T, K> = IsLooseMode<T> extends true ? unknown : K extends keyof T ? T[K] : unknown;
