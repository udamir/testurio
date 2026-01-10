// =============================================================================
// Hook Matching Helpers (for Protocol Messages)
// =============================================================================

import type { Message, MessageMatcher } from "../../protocols/base";
import type { PayloadMatcher } from "./base.types";

/**
 * Creates an `isMatch` function for protocol messages (Message<T>).
 * This helper builds the matching logic from messageType and optional payloadMatcher.
 *
 * @param messageType - Message type to match (string or function)
 * @param payloadMatcher - Optional payload-level matcher
 * @returns An `isMatch` function for use in Hook
 *
 * @example
 * ```typescript
 * const hook: Hook<Message> = {
 *   id: "hook-1",
 *   isMatch: createMessageMatcher("orderRequest", { type: "traceId", value: "123" }),
 *   handlers: [...],
 * };
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
// Hook Errors
// =============================================================================

/**
 * Special error to signal message should be dropped
 */
export class DropMessageError extends Error {
	constructor() {
		super("Message dropped by hook");
		this.name = "DropMessageError";
	}
}
