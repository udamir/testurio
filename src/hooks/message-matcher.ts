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
	// For httpEndpoint matcher, match by endpoint directly (ignores messageTypes)
	// This allows custom messageType names while still matching HTTP requests
	if (hook.matcher?.type === "httpEndpoint") {
		return matchPayload(hook.matcher, message);
	}

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
			} catch (error) {
				// Function matcher failed - treat as no match
				return false;
			}

		case "httpEndpoint":
			// HTTP endpoint matching requires metadata
			if (!message.metadata) return false;
			return (
				message.metadata.method === matcher.method &&
				matchPath(message.metadata.path as string, matcher.path)
			);

		default:
			return false;
	}
}

/**
 * Match HTTP path with support for path parameters
 * Examples:
 *   matchPath('/users/123', '/users/{id}') => true
 *   matchPath('/users/123/posts', '/users/{id}/posts') => true
 *   matchPath('/users', '/users/{id}') => false
 */
export function matchPath(actualPath: string, patternPath: string): boolean {
	// Exact match
	if (actualPath === patternPath) return true;

	// No path parameters - simple comparison
	if (!patternPath.includes("{")) {
		return actualPath === patternPath;
	}

	// Split paths into segments
	const actualSegments = actualPath.split("/").filter(Boolean);
	const patternSegments = patternPath.split("/").filter(Boolean);

	// Different number of segments - no match
	if (actualSegments.length !== patternSegments.length) {
		return false;
	}

	// Match each segment
	for (let i = 0; i < patternSegments.length; i++) {
		const patternSegment = patternSegments[i];
		const actualSegment = actualSegments[i];

		// Path parameter - matches anything
		if (patternSegment.startsWith("{") && patternSegment.endsWith("}")) {
			continue;
		}

		// Literal segment - must match exactly
		if (patternSegment !== actualSegment) {
			return false;
		}
	}

	return true;
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
			return 100; // Most specific

		case "requestId":
			return 100; // Most specific

		case "httpEndpoint":
			// More specific if no path parameters
			return matcher.path.includes("{") ? 50 : 80;

		case "function":
			return 10; // Least specific (could match anything)

		default:
			return 0;
	}
}
