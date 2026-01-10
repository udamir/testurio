/**
 * Subscriber Hook Types
 *
 * Types for subscriber hook system (message interception, assertions, transformations).
 */

import type { QueueMessage } from "../mq.base";

/**
 * Hook handler types for subscriber
 */
export type SubscriberHookHandlerType = "assert" | "transform" | "drop";

/**
 * Hook handler for subscriber
 */
export interface SubscriberHookHandler<T = unknown> {
	type: SubscriberHookHandlerType;
	execute: (message: QueueMessage<T>) => Promise<QueueMessage<T> | null>;
	metadata?: Record<string, unknown>;
}

/**
 * Subscriber hook definition
 */
export interface SubscriberHook<T = unknown> {
	id: string;
	topic: string;
	payloadMatcher?: (payload: T) => boolean;
	/** Handlers use unknown internally for flexibility */
	handlers: SubscriberHookHandler[];
	persistent: boolean;
}

/**
 * Error thrown when a message should be dropped
 */
export class DropMQMessageError extends Error {
	constructor() {
		super("Message dropped by hook");
		this.name = "DropMQMessageError";
	}
}
