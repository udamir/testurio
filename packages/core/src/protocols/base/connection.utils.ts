/**
 * Connection Utilities
 */

/**
 * Generate a unique connection ID
 */
export function generateConnectionId(prefix = "conn"): string {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
