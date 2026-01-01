/**
 * Sync Server Types
 *
 * Type extraction helpers for sync server step builders.
 * All types are extracted from the protocol type A which contains
 * the service definition via __types.service.
 */

import type { ProtocolService } from "../../protocols/base";

/**
 * Extract server request type from protocol.
 * For servers, we want the full request object (not just body):
 * - HTTP: Full request with body, query, params, headers
 * - gRPC: Request payload directly
 *
 * @template A - Protocol type
 * @template K - Operation/method key
 */
export type ExtractServerRequest<A, K extends keyof ProtocolService<A>> =
	ProtocolService<A>[K] extends { request: infer R }
		? R
		: ProtocolService<A>[K];

/**
 * Extract server response type from protocol.
 * Returns the response type directly from the service definition.
 * Protocol-specific response wrapping (e.g., HttpResponse) should be
 * defined in the service definition itself, not inferred here.
 *
 * @template A - Protocol type
 * @template K - Operation/method key
 */
export type ExtractServerResponse<A, K extends keyof ProtocolService<A>> =
	ProtocolService<A>[K] extends { responses: infer R }
		? R
		: ProtocolService<A>[K] extends { response: infer R }
			? R
			: ProtocolService<A>[K];
