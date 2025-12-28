/**
 * Generate unique handle ID
 */
export function generateId(prefix = ""): string {
	return `${prefix}${Date.now().toString(36)}`;
}
