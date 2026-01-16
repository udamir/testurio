/**
 * Async Client Types
 *
 * Type extraction helpers for async client step builders.
 * Types are extracted from the protocol type which contains
 * the message definition via clientMessages/serverMessages.
 */

import type { ExtractClientPayload, ExtractServerPayload } from "../../protocols/base";

/**
 * Extract payload type for a client message.
 * @template A - Protocol type
 * @template K - Message type key
 */
export type ExtractMessagePayload<A, K> = ExtractClientPayload<A, K>;

/**
 * Extract payload type for a server event.
 * @template A - Protocol type
 * @template K - Event type key
 */
export type ExtractEventPayload<A, K> = ExtractServerPayload<A, K>;
