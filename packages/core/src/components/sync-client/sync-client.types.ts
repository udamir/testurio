/**
 * Sync Client Types
 *
 * Type extraction helpers for sync client step builders.
 * All types are extracted from the protocol type A which contains
 * the service definition via __types.service.
 */

import type { ProtocolService } from "../../protocols/base";

/**
 * Extract request data type from protocol service definition.
 * Returns the request type directly from the service definition.
 * Protocol-specific fields (e.g., body for HTTP) should be
 * defined in the service definition itself, not extracted here.
 *
 * @template A - Protocol type
 * @template K - Operation/method key
 */
export type ExtractRequestData<A, K extends keyof ProtocolService<A>> =
	ProtocolService<A>[K] extends { request: infer R }
		? R
		: ProtocolService<A>[K];

/**
 * Extract client response type from protocol.
 * Returns the response type directly from the service definition.
 * Protocol-specific response format (e.g., HttpResponse) should be
 * defined in the service definition itself, not inferred here.
 *
 * @template A - Protocol type (ISyncProtocol)
 * @template K - Operation/method key
 */
export type ExtractClientResponse<A, K extends keyof ProtocolService<A>> =
	ProtocolService<A>[K] extends { response: infer R }
		? R
		: ProtocolService<A>[K];
