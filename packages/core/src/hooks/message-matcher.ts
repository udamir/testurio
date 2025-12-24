/**
 * Message Matcher
 *
 * Implements message matching logic for hooks.
 *
 * Matching is two-level:
 * 1. Message type(s) - adapter level, filters which messages trigger this hook
 * 2. Payload matcher - hook level, filters by traceId, requestId, or custom function
 */

import type { Hook, Message, PayloadMatcher } from "../types";

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
export function matchHook(hook: Hook, message: Message): boolean {
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

		case "requestId":
			return message.metadata?.requestId === matcher.value;

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

/**
 * Calculate match score for hook prioritization
 * Higher score = more specific match
 */
export function calculateHookScore(hook: Hook): number {
	// Base score for message type specificity
	let score = 0;

	// More specific if single message type vs array
	if (typeof hook.messageTypes === "string") {
		score += 20;
	} else {
		score += 10;
	}

	// Add payload matcher score
	if (hook.matcher) {
		score += calculatePayloadMatcherScore(hook.matcher);
	}

	return score;
}

/**
 * Calculate score for payload matcher
 */
function calculatePayloadMatcherScore(matcher: PayloadMatcher): number {
	switch (matcher.type) {
		case "traceId":
		case "requestId":
			return 100; // Exact ID match = highest priority

		case "function":
			return 20; // Custom function

		default:
			return 0;
	}
}
