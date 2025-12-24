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
