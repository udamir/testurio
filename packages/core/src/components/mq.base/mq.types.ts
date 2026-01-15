/**
 * Message Queue Types
 *
 * Type helpers for loose/strict topic validation.
 * Message structure is fully adapter-specific - no base types here.
 *
 * Uses mapped type approach (same as HttpOperations) which does NOT require
 * T to have an index signature - it only maps over the actual keys of T.
 */

// =============================================================================
// Topic Type System (Loose/Strict Mode)
// =============================================================================

/**
 * Default topics type for loose mode.
 * Uses index signature to accept any string key.
 */
export type DefaultTopics = { [key: string]: unknown };

/**
 * Topic definitions type - maps topic names to their payload types.
 *
 * Uses mapped type `[K in keyof T]` which does NOT require T to have
 * an index signature - it only maps over the actual keys of T.
 *
 * @template T - Topic definition type
 *   - If T has index signature: loose mode (any string key)
 *   - If T has specific keys: strict mode (only defined keys)
 *
 * @example
 * ```typescript
 * // Strict mode - specific keys only, no index signature required
 * interface OrderTopics {
 *   'orders.created': { orderId: string; amount: number };
 *   'orders.shipped': { orderId: string; trackingId: string };
 * }
 * type Strict = Topics<OrderTopics>; // { 'orders.created': {...}, 'orders.shipped': {...} }
 *
 * // Loose mode - index signature allows any key
 * type Loose = Topics<DefaultTopics>; // any string key
 * ```
 */
export type Topics<T = object> = {
	[K in keyof T]: T[K];
};

/**
 * Detects whether T is in loose mode (accepts any string key).
 *
 * Returns `true` if T has an index signature (loose mode).
 * Returns `false` if T has specific keys only (strict mode).
 */
export type IsLooseMode<T> = string extends keyof T ? true : false;

/**
 * Extracts valid topic names from Topics type T.
 *
 * - Loose mode: Returns `string` (any topic allowed)
 * - Strict mode: Returns union of defined topic names
 */
export type Topic<T> = IsLooseMode<T> extends true ? string : keyof T & string;

/**
 * Extracts payload type for a given topic K in Topics type T.
 *
 * - Loose mode: Returns `unknown` (any payload allowed)
 * - Strict mode: Returns the defined payload type for topic K
 */
export type Payload<T, K> = IsLooseMode<T> extends true ? unknown : K extends keyof T ? T[K] : unknown;
