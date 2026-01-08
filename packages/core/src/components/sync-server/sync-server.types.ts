/**
 * Sync Server Types
 *
 * Type extraction helpers for sync server step builders.
 * All types are extracted from the protocol type A which contains
 * the service definition via __types.service.
 *
 * Supports both loose mode (no type parameter) and strict mode (with type parameter):
 * - Loose mode: Returns protocol's raw request/response types (e.g., HttpRequest, HttpResponse)
 * - Strict mode: Returns typed request/response from service definition
 */

import type { IsSyncLooseMode, ProtocolService } from "../../protocols/base";

/**
 * Extract protocol's raw request type (for loose mode fallback).
 * Uses $request phantom type from ISyncProtocol.
 */
type ProtocolRawRequest<A> = A extends { $request: infer R } ? R : unknown;

/**
 * Extract protocol's raw response type (for loose mode fallback).
 * Uses $response phantom type from ISyncProtocol.
 */
type ProtocolRawResponse<A> = A extends { $response: infer R } ? R : unknown;

/**
 * Extract server request type from protocol.
 * For servers, we want the full request object (not just body):
 * - HTTP: Full request with body, query, params, headers
 * - gRPC: Request payload directly
 *
 * In loose mode (no type parameter on protocol):
 * - Returns protocol's raw request type (e.g., HttpRequest)
 *
 * In strict mode (with type parameter):
 * - Checks for `serverRequest` first (server-specific type with required params)
 * - Falls back to `request` for protocols without server-specific types
 *
 * @template A - Protocol type
 * @template K - Operation/method key
 */
export type ExtractServerRequest<A, K> =
	IsSyncLooseMode<ProtocolService<A>> extends true
		? ProtocolRawRequest<A>
		: K extends keyof ProtocolService<A>
			? ProtocolService<A>[K] extends { serverRequest: infer R }
				? R
				: ProtocolService<A>[K] extends { request: infer R }
					? R
					: ProtocolService<A>[K]
			: ProtocolRawRequest<A>;

/**
 * Extract server response type from protocol.
 *
 * In loose mode (no type parameter on protocol):
 * - Returns protocol's raw response type (e.g., HttpResponse)
 *
 * In strict mode (with type parameter):
 * - Returns the typed response from service definition
 * - Protocol-specific response wrapping should be defined in service definition
 *
 * @template A - Protocol type
 * @template K - Operation/method key
 */
export type ExtractServerResponse<A, K> =
	IsSyncLooseMode<ProtocolService<A>> extends true
		? ProtocolRawResponse<A>
		: K extends keyof ProtocolService<A>
			? ProtocolService<A>[K] extends { responses: infer R }
				? R
				: ProtocolService<A>[K] extends { response: infer R }
					? R
					: ProtocolService<A>[K]
			: ProtocolRawResponse<A>;
