/**
 * Sync Client Types
 *
 * Type extraction helpers for sync client step builders.
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
 * Extract request data type from protocol service definition.
 *
 * In loose mode (no type parameter on protocol):
 * - Returns protocol's raw request type (e.g., HttpRequest)
 * - Allows any request structure that matches the protocol
 *
 * In strict mode (with type parameter):
 * - Returns the typed request from service definition
 * - Provides full type safety for the specific operation
 *
 * @template A - Protocol type
 * @template K - Operation/method key
 *
 * @example
 * ```typescript
 * // Loose mode - returns HttpRequest
 * type LooseReq = ExtractRequestData<HttpProtocol, "any">; // HttpRequest
 *
 * // Strict mode - returns typed request
 * type StrictReq = ExtractRequestData<HttpProtocol<MyApi>, "getUsers">; // { method: "GET"; path: "/users" }
 * ```
 */
export type ExtractRequestData<A, K> = IsSyncLooseMode<ProtocolService<A>> extends true
	? ProtocolRawRequest<A>
	: K extends keyof ProtocolService<A>
		? ProtocolService<A>[K] extends { request: infer R }
			? R
			: ProtocolService<A>[K]
		: ProtocolRawRequest<A>;

/**
 * Extract client response type from protocol.
 *
 * In loose mode (no type parameter on protocol):
 * - Returns protocol's raw response type (e.g., HttpResponse)
 * - Response has generic structure for the protocol
 *
 * In strict mode (with type parameter):
 * - Returns the typed response from service definition
 * - Provides full type safety for the specific operation
 *
 * @template A - Protocol type (ISyncProtocol)
 * @template K - Operation/method key
 *
 * @example
 * ```typescript
 * // Loose mode - returns HttpResponse
 * type LooseRes = ExtractClientResponse<HttpProtocol, "any">; // HttpResponse
 *
 * // Strict mode - returns typed response
 * type StrictRes = ExtractClientResponse<HttpProtocol<MyApi>, "getUsers">; // { code: 200; body: User[] }
 * ```
 */
export type ExtractClientResponse<A, K> = IsSyncLooseMode<ProtocolService<A>> extends true
	? ProtocolRawResponse<A>
	: K extends keyof ProtocolService<A>
		? ProtocolService<A>[K] extends { response: infer R }
			? R
			: ProtocolService<A>[K]
		: ProtocolRawResponse<A>;
