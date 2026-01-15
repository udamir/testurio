/**
 * Base Utilities
 *
 * Utility functions for components and builders.
 */

import type { Message, MessageMatcher } from "../../protocols/base";
import type { PayloadMatcher } from "./base.types";

// =============================================================================
// Description Utility
// =============================================================================

/**
 * Extract optional description from overloaded function arguments.
 *
 * Many builder methods support both:
 * - `.assert(predicate)` - without description
 * - `.assert("description", predicate)` - with description
 *
 * This utility helps implement such overloads.
 *
 * @example
 * ```typescript
 * assert(...args: [string, PredicateFn] | [PredicateFn]): this {
 *   const [description, predicate] = withDesc(args);
 *   return this.addHandler({ type: "assert", description, params: { predicate } });
 * }
 * ```
 */
export function withDesc<T extends unknown[]>(args: [string, ...T] | [...T]): [string | undefined, ...T] {
	return (typeof args[0] === "string" ? [args[0], ...args.slice(1)] : [undefined, ...args]) as [
		string | undefined,
		...T,
	];
}

// =============================================================================
// Hook Matching Helpers
// =============================================================================

/**
 * Creates an `isMatch` function for protocol messages.
 *
 * This helper builds matching logic from messageType and optional payloadMatcher.
 *
 * @param messageType - Message type to match (string or function)
 * @param payloadMatcher - Optional payload-level matcher
 * @returns An `isMatch` function for use in Hook
 *
 * @example
 * ```typescript
 * const isMatch = createMessageMatcher("orderRequest", { type: "traceId", value: "123" });
 * ```
 */
export function createMessageMatcher<T = unknown>(
	messageType: string | MessageMatcher<T>,
	payloadMatcher?: PayloadMatcher<T>
): (message: Message<T>) => boolean {
	return (message: Message<T>): boolean => {
		// Match message type
		const typeMatches =
			typeof messageType === "function"
				? messageType(message.type, message.payload)
				: messageType === message.type;

		if (!typeMatches) return false;
		if (!payloadMatcher) return true;

		// Match payload
		if (payloadMatcher.type === "traceId") {
			return message.traceId === payloadMatcher.value;
		}

		try {
			return payloadMatcher.fn(message.payload);
		} catch {
			return false;
		}
	};
}

// =============================================================================
// Errors
// =============================================================================

/**
 * Special error to signal message should be dropped.
 * Thrown by handlers to indicate the message should not be processed further.
 */
export class DropMessageError extends Error {
	constructor() {
		super("Message dropped by hook");
		this.name = "DropMessageError";
	}
}

/**
 * Timeout error for wait operations.
 */
export class TimeoutError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TimeoutError";
	}
}

// =============================================================================
// Sleep Utility
// =============================================================================

/**
 * Sleep for specified milliseconds.
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
