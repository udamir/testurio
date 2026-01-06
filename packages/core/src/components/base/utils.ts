/**
 * Hook Utilities
 *
 * Utility functions for hook system.
 */

/**
 * Generate unique hook ID
 */
export function generateHookId(): string {
	return `hook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate unique trace ID
 */
export function generateTraceId(): string {
	return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate unique step ID
 */
export function generateStepId(): string {
	return `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate unique request ID
 */
export function generateRequestId(): string {
	return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Match HTTP path with support for path parameters
 * Supports both {id} (OpenAPI) and :id (Express) formats
 * Examples:
 *   matchHttpPath('/users/123', '/users/{id}') => true
 *   matchHttpPath('/users/123', '/users/:id') => true
 *   matchHttpPath('/users/123/posts', '/users/{id}/posts') => true
 *   matchHttpPath('/users', '/users/{id}') => false
 */
export function matchHttpPath(actualPath: string, patternPath: string): boolean {
	// Exact match
	if (actualPath === patternPath) return true;

	// No path parameters - simple comparison
	if (!patternPath.includes("{") && !patternPath.includes(":")) {
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
		// Support both {id} (OpenAPI) and :id (Express) formats
		if ((patternSegment.startsWith("{") && patternSegment.endsWith("}")) || patternSegment.startsWith(":")) {
			continue;
		}

		// Literal segment - must match exactly
		if (patternSegment !== actualSegment) {
			return false;
		}
	}

	return true;
}
