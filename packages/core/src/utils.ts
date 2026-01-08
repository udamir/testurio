/**
 * Core Utilities
 */

/**
 * Generate unique ID with optional prefix
 */
export function generateId(prefix = ""): string {
	return `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
