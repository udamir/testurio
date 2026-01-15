/**
 * Message Queue Types
 *
 * Type helpers for loose/strict topic validation.
 * Message structure is fully adapter-specific - no base types here.
 */

// =============================================================================
// Topic Type System (Loose/Strict Mode)
// =============================================================================

/**
 * Topic definitions type.
 * Maps topic names to their payload types.
 */
export type Topics = Record<string, unknown>;

/**
 * Default topics type for loose mode.
 * Uses index signature to accept any string key.
 */
export type DefaultTopics = { [key: string]: unknown };

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
