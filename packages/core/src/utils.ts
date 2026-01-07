/**
 * Core Utilities
 */

/**
 * Generate unique ID with optional prefix
 */
export function generateId(prefix = ""): string {
	return `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Generate unique hook ID
 */
export const generateHookId = () => generateId("hook_");

/**
 * Generate unique trace ID
 */
export const generateTraceId = () => generateId("trace_");

/**
 * Generate unique step ID
 */
export const generateStepId = () => generateId("step_");

/**
 * Generate unique request ID
 */
export const generateRequestId = () => generateId("req_");
