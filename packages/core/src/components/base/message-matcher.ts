/**
 * Message Matcher
 *
 * Implements message matching logic for hooks.
 *
 * Matching is two-level:
 * 1. Message type(s) - protocol level, filters which messages trigger this hook
 * 2. Payload matcher - hook level, filters by traceId, requestId, or custom function
 */

import type { Message } from "../../protocols/base";
import type { Hook, PayloadMatcher } from "./base.types";

/**
 * Check if a message matches a hook's message types
 */
export function matchMessageType(
	messageTypes: string | string[],
	messageType: string,
): boolean {
	if (Array.isArray(messageTypes)) {
		return messageTypes.includes(messageType);
	}
	return messageTypes === messageType;
}

/**
 * Check if a message matches a hook (both message type and payload matcher)
 */
export function matchHook<T>(hook: Hook<T>, message: Message<T>): boolean {
	// First check message type
	if (!matchMessageType(hook.messageTypes, message.type)) {
		return false;
	}

	// If no payload matcher, message type match is sufficient
	if (!hook.matcher) {
		return true;
	}

	// Check payload matcher
	return matchPayload(hook.matcher, message);
}

/**
 * Check if a message matches a payload matcher
 */
export function matchPayload(
	matcher: PayloadMatcher,
	message: Message,
): boolean {
	switch (matcher.type) {
		case "traceId":
			return message.traceId === matcher.value;

		case "function":
			try {
				return matcher.fn(message.payload);
			} catch {
				// Function matcher failed - treat as no match
				return false;
			}

		default:
			return false;
	}
}
